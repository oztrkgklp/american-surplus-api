import { AppError } from "@/utils/response/appError";
import Application from "../models/Application.entity";
import ApplicationForm from "../models/ApplicationForm.entity";
import path from 'path';
import { StoragePaths } from '@/utils/storage/paths';
import fs from 'fs/promises';
import { fileExists, getFilePath, saveUploadedFile } from '@/utils/storage/fileSystem';
import Form from "../models/Form.entity";
import ApplicationAttachment from "../models/ApplicationAttachment.entity";
import { PaginatedResponse } from "@/utils/pagination/interfaces";
import { paginateArray } from "@/utils/pagination";
import { Op, Transaction } from "sequelize";
import StateFormRequirement from "../models/StateFormRequirement.entity";
import Organization from "@/organization/models/Organization";
import Sba8aCertification, { isSba8aPrimaryActivity, isVetCertPrimaryActivity } from "@/organization/models/Sba8aCertification.entity";
import { Sba8aService } from "@/organization/services/sba8a.service";
import { EligibilityApplicationFormStatuses, EligibilityApplicationStatuses, EligibilityApplicationStatusLabels } from "@/enums/eligibilityStatus.enum";
import { DoneeAccountService } from "@/organization/services/donee";
import { withTransaction } from "@/utils/transactionalOperation";
import { cache } from '@/utils/cache';
import { cacheKeys } from '@/utils/cache/keys';
import { EligbilityActions } from "@/enums/eligibilityActions.enum";
import ApplicationLog from "../models/ApplicationLogs.entity";
import NotificationFactory, { NotificationType } from "@/notifications/services/notification-factory.service";
import { INotificationPayloadMap } from "@/notifications/interfaces/NotificationPayload.interface";
import User from "../../authn/models/User";
import Scope from "@/authz/models/Scope";
import { ScopeType } from "@/enums/scope.enum";
import { IUserCorperate } from "@/authz/interfaces/IUserScope";
import SaspAuditLog, { Activity } from "@/sasp/models/SaspAuditLogs.entity";
import SaspUser from "@/sasp/models/SaspUsers.entity";
import OrganizationUser from "@/organization/models/OrganizationUser";
import State from "../../states/models/State";
import { QBOCustomerService } from "@/qbo/customer/customer.service";
import { getLogger } from '@/utils/logger';
import { OrganizationService } from "@/organization/services/organization";
import { OrganizationUserService } from "@/organization/services/organizationUser";
import { OrganizationAddressService } from "@/organization/services/organizationAddress.service";
import { HaoRoleInvitationService } from "@/organization/services/haoRoleInvitation.service";
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import envvars from '@/config/envvars';

const logger = getLogger('EligibilityService');

const FORM_DATA_INTERNAL_KEYS = new Set([
    '_reviewFlags',
    '_changedFields',
    '_previousValues',
]);

function stripFormDataMetadata(formData: object | string | null | undefined): object | undefined {
    if (formData == null) return undefined;
    const parsed =
        typeof formData === 'string'
            ? (JSON.parse(String(formData) || '{}') as Record<string, unknown>)
            : ({ ...(formData as Record<string, unknown>) });
    for (const key of FORM_DATA_INTERNAL_KEYS) {
        delete parsed[key];
    }
    return parsed;
}

export type ApplicationApprovalAuditLog = SaspAuditLog & { user?: User; saspUser?: SaspUser | null };
export type EligibilityActorSide = 'sasp' | 'donee';
export type EligibilityDocumentSignOptions = {
    preserveSaspSignature?: boolean;
    refreshSignatureDates?: boolean;
};
// Notifications enqueue to BullMQ outside the DB transaction, so firing them inline would send
// even when the transaction later rolls back. reviewForm collects them and the controller fires
// them only after commit.
export type PendingEligibilityNotification = {
    type: NotificationType.ELIGIBILITY_STATUS_CHANGED;
    payload: INotificationPayloadMap[NotificationType.ELIGIBILITY_STATUS_CHANGED];
};

export class EligibilityService {
    static async getLatestChangeRequestLog(applicationId: number, transaction?: Transaction): Promise<ApplicationLog | null> {
        const candidateLogs = await ApplicationLog.findAll({
            where: {
                application_id: applicationId,
                action: {
                    [Op.in]: [
                        EligbilityActions.APPLICATION_CHANGES_REQUESTED,
                        EligbilityActions.APPLICATION_STATUS_CHANGED,
                        EligbilityActions.FORM_EDITS_REQUESTED,
                    ],
                },
            },
            order: [['createdAt', 'DESC']],
            transaction,
            limit: 20,
        });
        return (
            candidateLogs.find((log) => {
                const metadata = (log.metadata ?? {}) as {
                    requested_by_side?: string;
                    status?: string;
                    new_status?: string;
                };
                const hasRequesterSide =
                    metadata.requested_by_side === 'sasp' ||
                    metadata.requested_by_side === 'donee';
                if (!hasRequesterSide) return false;
                return (
                    log.action === EligbilityActions.APPLICATION_CHANGES_REQUESTED ||
                    metadata.status === EligibilityApplicationStatuses.CHANGE_REQUESTED ||
                    metadata.new_status === EligibilityApplicationStatuses.CHANGE_REQUESTED
                );
            }) ?? null
        );
    }

    static getRequesterSideFromLog(log: ApplicationLog | null): EligibilityActorSide | null {
        const metadata = (log?.metadata ?? {}) as { requested_by_side?: string };
        if (metadata.requested_by_side === 'sasp' || metadata.requested_by_side === 'donee') {
            return metadata.requested_by_side;
        }
        return null;
    }


    /**
     * True when the user has an active SASP scope for the same state as the application.
     */
    static isUserActiveSaspForApplication(user: User, application: Application): boolean {
        if (!user.scopes?.length) return false;
        const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(
            (scope) => scope.type === ScopeType.SASP && scope.isActive === true,
        );
        if (!saspScope?.stateId) return false;
        return Number(saspScope.stateId) === Number(application.state_id);
    }

    /**
     * Latest SASP audit row for this application being approved (metadata.applicationId).
     */
    static async findApplicationApprovalAuditLog(
        application: Application,
        transaction?: Transaction,
    ): Promise<ApplicationApprovalAuditLog | null> {
        const logs = await SaspAuditLog.findAll({
            where: {
                activity: Activity.APPLICATION_APPROVED,
                state_id: application.state_id,
            },
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'typeId'] }],
            order: [['createdAt', 'DESC']],
            limit: 50,
            transaction,
        });
        const match =
            logs.find(
                (log) => Number((log.metadata as Record<string, unknown>)?.applicationId) === Number(application.id),
            ) ?? null;
        if (!match) return null;

        const saspUser = match.activator
            ? await SaspUser.findOne({
                where: {
                    userId: match.activator,
                    stateId: application.state_id,
                },
                transaction,
            })
            : null;

        const result = match as ApplicationApprovalAuditLog;
        result.saspUser = saspUser;
        return result;
    }

    /**
     * PDF header: show "Renewal Application" when status is on a renewal flow or application_logs
     * recorded Form_Renewal_Required / Application_Renewal_Required (e.g. after approval when status is Approved).
     */
    static async getEligibilityApplicationDocumentHeaderMeta(
        application: Application,
        transaction?: Transaction,
    ): Promise<{ showRenewalApplicationLabel: boolean; applicationStatusLabel: string }> {
        const status = application.status as EligibilityApplicationStatuses;

        const renewalByStatus =
            status === EligibilityApplicationStatuses.ON_FORM_RENEWAL ||
            status === EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL;

        let renewalByLogs = false;
        if (!renewalByStatus) {
            const renewalCount = await ApplicationLog.count({
                where: {
                    application_id: application.id,
                    action: {
                        [Op.in]: [EligbilityActions.FORM_RENEWAL_REQUIRED, EligbilityActions.APPLICATION_RENEWAL_REQUIRED],
                    },
                },
                transaction,
            });
            renewalByLogs = renewalCount > 0;
        }

        const showRenewalApplicationLabel = renewalByStatus || renewalByLogs;

        const applicationStatusLabel =
            EligibilityApplicationStatusLabels[status] ?? application.status ?? 'N/A';

        return { showRenewalApplicationLabel, applicationStatusLabel };
    }

    static async createApplication(data: { organizationId: string; doneeAccountId: number; stateId: number; createdBy: User; }, transaction?: Transaction): Promise<Application> {
        const { organizationId, doneeAccountId, stateId, createdBy } = data
        await cache.deleteSmart(cacheKeys.applicationStatusCounts, stateId);

        const existingApplication = await Application.findOne({
            where: {
                organization_id: organizationId,
                state_id: stateId
            },
            include: [{
                model: State,
                as: 'state',
                attributes: ['stateId', 'stateName']
            }],
            transaction
        });
        if (existingApplication) throw new AppError(400, `Application already exists in ${existingApplication.state?.stateName}`);

        const application = await Application.create({
            organization_id: organizationId,
            donee_account_id: doneeAccountId,
            status: EligibilityApplicationStatuses.DRAFT,
            state_id: stateId,
            created_by: createdBy.id
        }, { transaction });

        return application;
    }

    static async deleteApplication(applicationId: number, transaction?: Transaction): Promise<void> {
        const application = await Application.findByPk(applicationId);
        if (!application) throw new AppError(404, 'Application not found');

        const isProduction = envvars.app.environment === 'production';
        const deletableStatuses: string[] = [EligibilityApplicationStatuses.DRAFT, EligibilityApplicationStatuses.SUBMITTED];
        if (isProduction && !deletableStatuses.includes(application.status)) {
            throw new AppError(400, `Cannot delete application with status: ${application.status}`);
        }

        await Application.destroy({ where: { id: applicationId }, transaction });
        const applicationForms = await ApplicationForm.findAll({ where: { application_id: applicationId }, transaction });
        for (const applicationForm of applicationForms) {
            await ApplicationAttachment.destroy({ where: { application_form_id: applicationForm.id }, transaction });
        }
        await ApplicationForm.destroy({ where: { application_id: applicationId }, transaction });

        await DoneeAccountService.deactivateDoneeAccount(application.donee_account_id, transaction);
        await DoneeAccountService.updateDoneeAccount(application.donee_account_id, { name: null }, transaction);
    }

    /**
     * Atomically transitions an application from SUBMITTED to IN_REVIEW.
     * Idempotent: if already IN_REVIEW, returns transitioned=false without firing a notification.
     * Rejects with 409 if the application is in any other state.
     */
    static async beginReview(applicationId: number, transaction?: Transaction): Promise<{ application: Application; transitioned: boolean }> {
        const [affectedRows] = await Application.update(
            { status: EligibilityApplicationStatuses.IN_REVIEW },
            { where: { id: applicationId, status: EligibilityApplicationStatuses.SUBMITTED }, transaction }
        );

        const application = await Application.findByPk(applicationId, {
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' }
            ],
            transaction
        });
        if (!application) throw new AppError(404, 'Application not found');

        if (affectedRows === 0) {
            if (application.status !== EligibilityApplicationStatuses.IN_REVIEW) {
                throw new AppError(409, `Cannot begin review: application status is ${application.status}`);
            }
            return { application, transitioned: false };
        }

        await NotificationFactory.createNotification(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            {
                application,
                oldStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.SUBMITTED],
                newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.IN_REVIEW]
            }
        );
        return { application, transitioned: true };
    }

    static async denyApplication(applicationId: number, denyReason: string, transaction?: Transaction): Promise<void> {
        const application = await Application.findByPk(applicationId, {
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' }
            ],
            transaction
        });
        if (!application) throw new AppError(404, 'Application not found');

        if (application.status === EligibilityApplicationStatuses.SUBMITTED) {
            throw new AppError(400, 'Begin review before denying this application');
        }

        const oldStatus = application.status;
        await application.update({ status: EligibilityApplicationStatuses.DENIED, deny_reason: denyReason }, { transaction });

        // Send status change notification
        await NotificationFactory.createNotification(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            {
                application,
                oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.DENIED as EligibilityApplicationStatuses]
            }
        );
    }

    static async startChangeRequest(
        applicationId: number,
        requesterSide: EligibilityActorSide,
        requesterUserId: string,
        transaction?: Transaction,
    ): Promise<Application> {
        const application = await Application.findByPk(applicationId, { transaction });
        if (!application) throw new AppError(404, 'Application not found');
        if (application.status !== EligibilityApplicationStatuses.APPROVED) {
            throw new AppError(400, `Cannot request edits when application status is ${application.status}`);
        }
        // Entering edit mode should not mutate application status yet.
        // Status changes to Change_Requested only on confirm/submit.
        void requesterSide;
        void requesterUserId;
        return application;
    }

    static async submitChangeRequest(
        applicationId: number,
        requesterSide: EligibilityActorSide,
        requesterUserId: string,
        transaction?: Transaction,
    ): Promise<{ application: Application; updatedForms: ApplicationForm[] }> {
        const application = await Application.findByPk(applicationId, { transaction });
        if (!application) throw new AppError(404, 'Application not found');
        if (
            application.status !== EligibilityApplicationStatuses.APPROVED &&
            application.status !== EligibilityApplicationStatuses.CHANGES_RETURNED
        ) {
            throw new AppError(400, `Cannot submit requested edits when application status is ${application.status}`);
        }

        const forms = await ApplicationForm.findAll({
            where: { application_id: applicationId },
            transaction,
        });
        const updatedForms = forms.filter(
            (form) =>
                form.status === EligibilityApplicationFormStatuses.EDITS_REQUESTED ||
                form.status === EligibilityApplicationFormStatuses.SIGNED ||
                form.status === EligibilityApplicationFormStatuses.EDITS_RETURNED,
        );
        if (!updatedForms.length) {
            throw new AppError(400, 'At least one updated form is required to submit requested edits');
        }

        const touchedForms: ApplicationForm[] = [];
        for (const form of updatedForms) {
            if (form.status !== EligibilityApplicationFormStatuses.EDITS_REQUESTED) {
                await form.update({ status: EligibilityApplicationFormStatuses.EDITS_REQUESTED }, { transaction });
            }
            touchedForms.push(form);
        }

        const statusBeforeSubmit = application.status;
        if (
          application.status === EligibilityApplicationStatuses.APPROVED ||
          application.status === EligibilityApplicationStatuses.CHANGES_RETURNED
        ) {
          await application.update(
            { status: EligibilityApplicationStatuses.CHANGE_REQUESTED },
            { transaction },
          );
            await NotificationFactory.createNotification(
                NotificationType.ELIGIBILITY_STATUS_CHANGED,
                {
                    application,
                    oldStatus: EligibilityApplicationStatusLabels[
                        statusBeforeSubmit as EligibilityApplicationStatuses
                    ],
                    newStatus: EligibilityApplicationStatusLabels[
                        EligibilityApplicationStatuses.CHANGE_REQUESTED
                    ],
                },
            );
          await this.logApplicationStatusChange(
            applicationId,
            requesterUserId,
            statusBeforeSubmit,
            EligibilityApplicationStatuses.CHANGE_REQUESTED,
            transaction,
            { requested_by_side: requesterSide },
          );
        }

        return { application, updatedForms: touchedForms };
    }

    static async bulkCreateApplicationForms(applicationId: number, forms: { id: number, isRequired: boolean }[], transaction?: Transaction): Promise<ApplicationForm[]> {
        const formData = forms.map((form) => ({
            application_id: applicationId,
            form_id: form.id,
            status: EligibilityApplicationFormStatuses.NEW,
            is_required: form.isRequired
        }));
        return await ApplicationForm.bulkCreate(formData, { transaction });
    }

    static async uploadApplicationAttachment(applicationId: number, formId: number, file: Express.Multer.File, description?: string, transaction?: Transaction): Promise<ApplicationAttachment> {
        try {
            const form = await Form.findByPk(formId);
            if (!form) throw new AppError(404, 'Form not found');

            const application = await Application.findByPk(applicationId, {
                include: [
                    { model: Organization, as: 'organization' },
                    { model: State, as: 'state' }
                ],
                transaction
            });
            if (!application) throw new AppError(404, 'Application not found');

            const blockedApplicationStatuses = [
                EligibilityApplicationStatuses.SUBMITTED,
                EligibilityApplicationStatuses.IN_REVIEW,
                EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
                EligibilityApplicationStatuses.ON_FORM_RENEWAL,
                EligibilityApplicationStatuses.DENIED,
            ] as string[];

            if (blockedApplicationStatuses.includes(application.status)) throw new AppError(404, 'Application is already sent or approved');


            const applicationForm = await ApplicationForm.findOne({
                where: { application_id: applicationId, form_id: formId }
            });
            if (!applicationForm) throw new AppError(404, 'Application form not initialized');

            const blockedApplicationFormStatuses = [EligibilityApplicationFormStatuses.APPROVED] as string[]
            if (
                application.status === EligibilityApplicationStatuses.APPROVED ||
                application.status === EligibilityApplicationStatuses.CHANGE_REQUESTED ||
                application.status === EligibilityApplicationStatuses.CHANGES_RETURNED
            ) {
                const approvedIdx = blockedApplicationFormStatuses.indexOf(
                    EligibilityApplicationFormStatuses.APPROVED,
                );
                if (approvedIdx > -1) blockedApplicationFormStatuses.splice(approvedIdx, 1);
            }
            if (blockedApplicationFormStatuses.includes(applicationForm.status)) throw new AppError(404, 'Form is already submitted or approved');

            const base = StoragePaths.private.orgs.org(application.organization_id.toString());
            const scoped = form.scope === 'Donee'
                ? base.donees.donee(application.donee_account_id!.toString()).applications.application(applicationId.toString())
                : base.applications.application(applicationId.toString());

            const attachmentsDir = scoped.forms.form(formId.toString()).attachments; // string path

            const ext = path.extname(file.originalname);
            const fileName = `attachment_${formId}_${Date.now()}${ext}`;
            const filePath = getFilePath(attachmentsDir, fileName);

            await saveUploadedFile(file.buffer, attachmentsDir, fileName);

            const metadata = { originalName: file.originalname, mimeType: file.mimetype, size: file.size, description };
            const attachment = await ApplicationAttachment.create({
                path: filePath,
                metadata,
                application_form_id: applicationForm.id
            }, { transaction });

            return attachment;
        } catch (error) {
            throw new AppError(400, 'Failed to add application attachment');
        }
    }

    static async deleteApplicationAttachment(applicationId: number, formId: number, attachmentId: number, transaction?: Transaction): Promise<ApplicationForm> {
        const form = await Form.findByPk(formId);
        if (!form) throw new AppError(404, 'Form not found');

        const application = await Application.findByPk(applicationId, {
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' }
            ],
            transaction
        });

        if (!application) throw new AppError(404, 'Application not found');

        const blockedApplicationStatuses = [
            EligibilityApplicationStatuses.SUBMITTED,
            EligibilityApplicationStatuses.IN_REVIEW,
            EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
            EligibilityApplicationStatuses.ON_FORM_RENEWAL,
            EligibilityApplicationStatuses.DENIED,
        ] as string[];

        if (blockedApplicationStatuses.includes(application.status)) throw new AppError(400, 'Cannot delete attachments after submission or approval');

        const appForm = await ApplicationForm.findOne({ where: { application_id: applicationId, form_id: formId } });
        if (!appForm) throw new AppError(404, 'Application form not initialized');

        const blockedApplicationFormStatuses = [EligibilityApplicationFormStatuses.APPROVED, EligibilityApplicationFormStatuses.SIGNED] as string[]
        if (
            application.status === EligibilityApplicationStatuses.APPROVED ||
            application.status === EligibilityApplicationStatuses.CHANGE_REQUESTED ||
            application.status === EligibilityApplicationStatuses.CHANGES_RETURNED
        ) {
            const approvedIdx = blockedApplicationFormStatuses.indexOf(
                EligibilityApplicationFormStatuses.APPROVED,
            );
            if (approvedIdx > -1) blockedApplicationFormStatuses.splice(approvedIdx, 1);
            const signedIdx = blockedApplicationFormStatuses.indexOf(
                EligibilityApplicationFormStatuses.SIGNED,
            );
            if (signedIdx > -1) blockedApplicationFormStatuses.splice(signedIdx, 1);
        }
        if (blockedApplicationFormStatuses.includes(appForm.status)) throw new AppError(400, 'Cannot delete attachments for a submitted/approved form');

        const attachment = await ApplicationAttachment.findByPk(attachmentId);
        if (!attachment || attachment.application_form_id !== appForm.id) throw new AppError(404, 'Attachment not found');

        const exists = await fileExists(attachment.path);
        if (exists) await fs.unlink(attachment.path);

        await attachment.destroy({ transaction });
        return appForm;
    }


    /**
  * Update the JSON form_data and mark status as 'Signed'.
  */
    static async updateFormData(
        applicationId: number,
        formId: number,
        formData: object | string,
        transaction?: Transaction,
        actorUserId?: string,
        actorSide?: EligibilityActorSide,
    ): Promise<ApplicationForm> {
        const application = await Application.findByPk(applicationId);

        if (!application) throw new AppError(404, 'Application not found');

        const blockedApplicationStatuses = [
            EligibilityApplicationStatuses.SUBMITTED,
            EligibilityApplicationStatuses.IN_REVIEW,
            EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
            EligibilityApplicationStatuses.ON_FORM_RENEWAL,
            EligibilityApplicationStatuses.DENIED,
        ] as string[];

        if (
          application.status ===
            EligibilityApplicationStatuses.CHANGE_REQUESTED ||
          application.status === EligibilityApplicationStatuses.CHANGES_RETURNED
        ) {
          const latestChangeRequestLog = await this.getLatestChangeRequestLog(
            applicationId,
            transaction,
          );
          const requesterSide = this.getRequesterSideFromLog(
            latestChangeRequestLog,
          );
          if (!requesterSide || !actorSide || requesterSide !== actorSide) {
            throw new AppError(
              403,
              'Only the party that requested edits can modify forms',
            );
          }
        }

        if (blockedApplicationStatuses.includes(application.status)) {
            throw new AppError(400, `Cannot update form data due to application status:${application.status}`);
        }

        if (
            application.status === EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE
            && application.submitted_date
        ) {
            throw new AppError(400, `Cannot update form data due to application status:${application.status}`);
        }

        const appForm = await ApplicationForm.findOne({
            where: { application_id: applicationId, form_id: formId },
        });

        if (!appForm) throw new AppError(404, 'Application form not found');

        const blockedApplicationFormStatuses = [EligibilityApplicationFormStatuses.APPROVED] as string[]
        if (
            application.status === EligibilityApplicationStatuses.CHANGE_REQUESTED ||
            application.status === EligibilityApplicationStatuses.APPROVED
        ) {
            blockedApplicationFormStatuses.splice(
                blockedApplicationFormStatuses.indexOf(EligibilityApplicationFormStatuses.APPROVED),
                1,
            );
        }
        if (blockedApplicationFormStatuses.includes(appForm.status)) throw new AppError(400, `Cannot update form data due to form status: ${appForm.status}`);

        const nextFormStatus =
            application.status === EligibilityApplicationStatuses.CHANGE_REQUESTED ||
            application.status === EligibilityApplicationStatuses.CHANGES_RETURNED
                ? EligibilityApplicationFormStatuses.EDITS_REQUESTED
                : EligibilityApplicationFormStatuses.SIGNED;

        await appForm.update({ form_data: formData, status: nextFormStatus, submitted_date: Date.now() }, { transaction });

        // Form 3 (Capacity / Oversight / Program Funding): olderAmericansAct affects 3040 subCategory via EligibilityCategoryMapper — resync mappings.
        if (formId === 3 && application.organization_id) {
            await OrganizationService.sync3040MappingsForOrganization(application.organization_id, transaction);
        }

        if (
            formId === 1 &&
            application.organization_id &&
            application.status !== EligibilityApplicationStatuses.APPROVED &&
            application.status !== EligibilityApplicationStatuses.CHANGE_REQUESTED &&
            application.status !== EligibilityApplicationStatuses.CHANGES_RETURNED
        ) {
            const parsed = typeof formData === 'string' ? JSON.parse(String(formData) || '{}') : (formData as object);
            const fallback = await OrganizationAddressService.getMailingFallbackFromDb(application.organization_id);
            await OrganizationAddressService.syncFromForm1Payload(application.organization_id, parsed, fallback, transaction);
            if (actorUserId) {
                await OrganizationUserService.syncHeadAuthorizedOfficialFromForm1ToUserProfile(
                    actorUserId,
                    application.organization_id,
                    parsed as Record<string, unknown>,
                    transaction,
                );
            }
        }

        return appForm;
    }

    private static async applyForm1OrganizationUpdatesFromRequestedEdits(
        application: Application,
        transaction?: Transaction,
    ): Promise<void> {
        if (!application.organization_id) return;
        const form1 = await ApplicationForm.findOne({
            where: { application_id: application.id, form_id: 1 },
            transaction,
        });
        if (!form1?.form_data) return;
        const parsed = typeof form1.form_data === 'string'
            ? JSON.parse(String(form1.form_data) || '{}')
            : (form1.form_data as Record<string, unknown>);
        await OrganizationService.updateOrganizationInfo(
            String(application.organization_id),
            {
                organization_type: String(parsed.organizationType ?? ''),
                organization_sub_type: String(parsed.organizationSubType ?? ''),
                public_purpose: String(parsed.publicPurpose ?? ''),
                primary_activity: String(parsed.primaryActivity ?? ''),
                name: String(parsed.organizationName ?? ''),
                website: String(parsed.organizationWebsiteAddress ?? ''),
                tin: String(parsed.organizationTinEin ?? ''),
                contact_fax_number: String(parsed.organizationFaxNumber ?? ''),
            },
            false,
            transaction,
        );
        const fallback = await OrganizationAddressService.getMailingFallbackFromDb(
            String(application.organization_id),
        );
        await OrganizationAddressService.syncFromForm1Payload(
            String(application.organization_id),
            parsed,
            fallback,
            transaction,
        );

        // SDN-1321: edit-request approval also needs HAO/PPOC sync — updateForm's sync is gated to non-edit-request statuses.
        const orgId = String(application.organization_id);
        const doneeAccountId = application.donee_account_id ?? undefined;
        const scopes = await OrganizationUserService.resolveHeadAndPrimaryFromUserScopes(orgId, transaction, doneeAccountId);
        logger.info('[propagate] apply...edits resolved scopes', { applicationId: application.id, orgId, doneeAccountId, headUserId: scopes.headAuthorizedOfficialUserId, primaryUserId: scopes.primaryContactUserId, primaryDedicated: scopes.primaryContactHasDedicatedScope, parsedHaoName: (parsed as Record<string, unknown>).headAuthorizedOfficialName, parsedHaoEmail: (parsed as Record<string, unknown>).headAuthorizedOfficialEmail });
        if (scopes.headAuthorizedOfficialUserId) {
            logger.info('[propagate] calling HAO sync', { headUserId: scopes.headAuthorizedOfficialUserId });
            await OrganizationUserService.syncHeadAuthorizedOfficialFromForm1ToUserProfile(
                scopes.headAuthorizedOfficialUserId,
                orgId,
                parsed as Record<string, unknown>,
                transaction,
            );
            logger.info('[propagate] HAO sync returned');
        } else {
            logger.info('[propagate] HAO sync SKIPPED (no headAuthorizedOfficialUserId)');
        }
        const ppocDoneeAccountId = scopes.primaryDoneeAccountId ?? doneeAccountId;
        // When the same person is both HAO and Primary Contact, both sections write the same users/
        // organization_users row. Running PPOC sync after HAO sync would overwrite the HAO edits with
        // the (often unchanged) PPOC fields. HAO is authoritative for the shared person, so skip PPOC.
        const ppocIsSameAsHao = scopes.primaryContactUserId != null && scopes.primaryContactUserId === scopes.headAuthorizedOfficialUserId;
        if (ppocIsSameAsHao) {
            logger.info('[propagate] PPOC sync SKIPPED (same user as HAO)', { userId: scopes.primaryContactUserId });
        }
        if (!ppocIsSameAsHao && scopes.primaryContactUserId && scopes.primaryContactHasDedicatedScope && ppocDoneeAccountId != null) {
            const ppocUpdates: { primary_contact_full_name?: string; primary_contact_title?: string; primary_contact_phone?: string } = {};
            const name = typeof parsed.primaryContactName === 'string' ? parsed.primaryContactName.trim() : '';
            const title = typeof parsed.primaryContactTitle === 'string' ? parsed.primaryContactTitle.trim() : '';
            const phone = typeof parsed.primaryContactPhone === 'string' ? parsed.primaryContactPhone.trim() : '';
            if (name) ppocUpdates.primary_contact_full_name = name;
            if (title) ppocUpdates.primary_contact_title = title;
            if (phone) ppocUpdates.primary_contact_phone = phone;
            if (Object.keys(ppocUpdates).length > 0) {
                await DoneeAccountService.primaryContactInfoChange(
                    ppocDoneeAccountId,
                    orgId,
                    scopes.primaryContactUserId,
                    ppocUpdates,
                    transaction,
                );
            }
        }
    }

    /**
    * Fetches one ApplicationForm by (applicationId, formId), including attachments.
    */
    static async getApplicationForm(applicationId: number, formId: number): Promise<{ applicationForm: ApplicationForm, stateRequirement: StateFormRequirement | null }> {
        const application = await Application.findByPk(applicationId);
        if (!application) throw new AppError(404, 'Application not found');


        const applicationForm = await ApplicationForm.findOne({
            where: { application_id: applicationId, form_id: formId },
            include: [
                {
                    model: ApplicationAttachment,
                    as: 'attachments',
                    attributes: ['id', 'path', 'metadata', 'createdAt']
                }
            ]
        });

        if (!applicationForm) throw new AppError(404, 'Application form not found');

        const stateRequirement = await StateFormRequirement.findOne({
            where: {
                state_id: application.state_id,
                form_id: formId,
            },
        });


        return { applicationForm, stateRequirement };
    }

    static async generateEligibilityApplicationPDF(applicationId: number, createdBy: User): Promise<{ document?: string, displayName?: string, application: Application }> {
        const application = await Application.findByPk(applicationId);
        if (!application) throw new AppError(404, 'Application not found');

        // pdf-render: the generate path hardcodes saspApprovingOfficial* to '', so regenerating for
        // an application that already has a signed PDF on disk would overwrite pdf_path with an
        // unsigned copy and visually strip the SASP signature block. Re-signing is the path for these statuses.
        const signedStatuses = [
            EligibilityApplicationStatuses.APPROVED,
            EligibilityApplicationStatuses.DENIED,
            EligibilityApplicationStatuses.CHANGE_REQUESTED,
            EligibilityApplicationStatuses.CHANGES_RETURNED,
            EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE,
        ] as string[];
        if (signedStatuses.includes(application.status)) {
            throw new AppError(409, `Cannot regenerate PDF for application in status '${application.status}'. Use the signed copy or trigger a re-sign instead.`);
        }

        const { EligibilityApplicationDocumentService } = await import("./eligibilityApplicationDocument.service");
        const document: { documentPath: string, displayName: string } = await EligibilityApplicationDocumentService.generateApplicationDocument(applicationId, createdBy) as { documentPath: string, displayName: string };
        return { document: document?.documentPath, displayName: document?.displayName, application };
    }

    static async signEligibilityApplication(
        applicationId: number,
        signedBy: User,
        transaction?: Transaction,
        options?: EligibilityDocumentSignOptions,
    ): Promise<{ document?: string, displayName?: string, application: Application }> {
        const application = await Application.findByPk(applicationId, { transaction });
        if (!application) throw new AppError(404, 'Application not found');
        const { EligibilityApplicationDocumentService } = await import("./eligibilityApplicationDocument.service");
        const document: { documentPath: string, displayName: string } = options
            ? await EligibilityApplicationDocumentService.signApplicationDocument(
                applicationId,
                signedBy,
                transaction,
                options,
            ) as { documentPath: string, displayName: string }
            : await EligibilityApplicationDocumentService.signApplicationDocument(
                applicationId,
                signedBy,
                transaction,
            ) as { documentPath: string, displayName: string };
        // signApplicationDocument writes pdf_path on its own instance; reload so callers see the fresh path.
        await application.reload({ transaction });
        return { document: document?.documentPath, displayName: document?.displayName, application };
    }

    private static async logApplicationStatusChange(
        applicationId: number,
        userId: string | null,
        oldStatus: string,
        newStatus: string,
        transaction?: Transaction,
        extraMetadata?: Record<string, unknown>,
    ): Promise<void> {
        await ApplicationLog.create(
            {
                application_id: applicationId,
                user_id: userId,
                action: EligbilityActions.APPLICATION_STATUS_CHANGED,
                metadata: {
                    old_status: oldStatus,
                    new_status: newStatus,
                    ...extraMetadata,
                },
            },
            { transaction },
        );
    }

    /**
     * When a filer designates a Head Authorized Official via invitation, move the
     * application from Draft (or Rejected) into Waiting for HAO Signature.
     */
    static async markApplicationWaitingForHaoRoleInvitation(
        applicationId: number,
        organizationId: string,
        doneeAccountId: number,
        actorUserId?: string | null,
        transaction?: Transaction,
    ): Promise<{ application: Application; statusBeforeInvitation: string | null }> {
        const application = await Application.findByPk(applicationId, { transaction });
        if (!application) throw new AppError(404, 'Application not found');
        if (application.organization_id !== organizationId) throw new AppError(400, 'Application does not belong to this organization');
        if (application.donee_account_id !== doneeAccountId) throw new AppError(400, 'Application does not belong to this donee account');

        const transitionFrom: string[] = [EligibilityApplicationStatuses.DRAFT, EligibilityApplicationStatuses.REJECTED,];
        if (!transitionFrom.includes(application.status)) return { application, statusBeforeInvitation: null };

        const oldStatus = application.status;
        await application.update({ status: EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE }, { transaction },);

        await NotificationFactory.createNotification(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            {
                application,
                oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                newStatus: EligibilityApplicationStatusLabels[
                    EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE
                ],
            },
        );

        await this.logApplicationStatusChange(
            applicationId,
            actorUserId ?? null,
            oldStatus,
            EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE,
            transaction,
        );

        await cache.deleteSmart(cacheKeys.applicationStatusCounts, String(application.state_id));
        return { application, statusBeforeInvitation: oldStatus };
    }

    /**
     * After an HAO role invitation is accepted or declined, restore the linked
     * application from Waiting for HAO Signature to its pre-invitation status.
     */
    static async restoreApplicationAfterHaoRoleInvitation(
        applicationId: number,
        previousStatus: string,
        organizationId: string,
        doneeAccountId: number,
        actorUserId?: string | null,
        transaction?: Transaction,
    ): Promise<Application | null> {
        const application = await Application.findByPk(applicationId, { transaction });
        if (!application) return null;
        if (application.organization_id !== organizationId) return null;
        if (application.donee_account_id !== doneeAccountId) return null;

        if (application.status !== EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE) return application;

        const currentStatus = application.status;
        await application.update({ status: previousStatus }, { transaction });

        await NotificationFactory.createNotification(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            {
                application,
                oldStatus: EligibilityApplicationStatusLabels[
                    currentStatus as EligibilityApplicationStatuses
                ],
                newStatus: EligibilityApplicationStatusLabels[
                    previousStatus as EligibilityApplicationStatuses
                ] ?? previousStatus,
            },
        );

        await this.logApplicationStatusChange(
            applicationId,
            actorUserId ?? null,
            currentStatus,
            previousStatus,
            transaction,
        );

        await cache.deleteSmart(cacheKeys.applicationStatusCounts, String(application.state_id));
        return application;
    }

    /**
    * Marks an application as 'submitted' if all its forms are signed.
    */
    static async submitApplication(applicationId: number, submitterUserId: string, transaction?: Transaction,): Promise<Application> {
        const application = await Application.findByPk(applicationId, { transaction });
        if (!application) throw new AppError(404, 'Application not found');

        const blockedApplicationStatuses = [
            EligibilityApplicationStatuses.APPROVED,
            EligibilityApplicationStatuses.SUBMITTED,
            EligibilityApplicationStatuses.IN_REVIEW,
            EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
            EligibilityApplicationStatuses.ON_FORM_RENEWAL,
            EligibilityApplicationStatuses.DENIED,
        ] as string[];

        if (blockedApplicationStatuses.includes(application.status)) throw new AppError(400, 'Cannot submit application after submission or approval');

        const forms = await ApplicationForm.findAll({ where: { application_id: applicationId } });
        if (forms.length === 0) throw new AppError(400, 'No forms found for this application');

        const readyToSubmitFormStatuses = [
            EligibilityApplicationFormStatuses.SIGNED,
            EligibilityApplicationFormStatuses.APPROVED,
            EligibilityApplicationFormStatuses.REJECTED,
            EligibilityApplicationFormStatuses.FORM_EXPIRED,
            EligibilityApplicationFormStatuses.FORM_RENEWAL_REQUIRED,

        ] as string[];

        const notReady = forms.filter(form => !(readyToSubmitFormStatuses.includes(form.status) && form.is_required));
        if (notReady.length > 0) throw new AppError(400, 'All forms must be Signed before submitting');

        const oldStatus = application.status;
        let newStatus: string;

        const headUserId = await HaoRoleInvitationService.resolveHeadUserIdForDonee(application.organization_id, application.donee_account_id,);
        const submitterIsHead = headUserId != null && headUserId === submitterUserId;
        if (!headUserId) throw new AppError(400, 'A Head Authorized Official must be designated before submitting this application.',);

        const pendingInvite = await HaoRoleInvitationService.hasPendingInvitationForDonee(application.organization_id, application.donee_account_id,);
        if (pendingInvite) throw new AppError(400, 'A Head Authorized Official invitation is still pending. Wait for them to accept before submitting.',);


        const resolveSubmittedStatus = (): string => {
            switch (application.status) {
                case EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED:
                case EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED:
                case EligibilityApplicationStatuses.APPLICATION_EXPIRED:
                    return EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL;
                case EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED:
                case EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED:
                case EligibilityApplicationStatuses.FORM_EXPIRED:
                    return EligibilityApplicationStatuses.ON_FORM_RENEWAL;
                case EligibilityApplicationStatuses.REJECTED:
                    return EligibilityApplicationStatuses.SUBMITTED;
                default:
                    return EligibilityApplicationStatuses.SUBMITTED;
            }
        };

        if (submitterIsHead) {
            newStatus = resolveSubmittedStatus();
        } else {
            newStatus = EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE;
        }

        await application.update({ status: newStatus, submitted_date: Date.now() }, { transaction });
        await NotificationFactory.createNotification(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            {
                application,
                oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                newStatus: EligibilityApplicationStatusLabels[newStatus as EligibilityApplicationStatuses]
            },
        );

        if (
            newStatus === EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE
            && headUserId
            && oldStatus !== EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE
        ) {
            await this.sendWaitingForHaoSignatureEmail(application, headUserId, transaction);
        }

        return application;
    }

    private static async sendWaitingForHaoSignatureEmail(application: Application, headUserId: string, transaction?: Transaction,): Promise<void> {
        const headUser = await User.findByPk(headUserId, { transaction });
        const organization = await Organization.findByPk(application.organization_id, { transaction });
        if (!headUser?.email) return;

        const state = await State.findByPk(application.state_id, { transaction });
        const applicationUrl = `${envvars.ui}/org/${application.organization_id}/applications/${application.id}${state?.stateId ? `?stateId=${state.stateId}` : ''}`;

        const mailContent = await renderEmail({
            templateName: TemplateEnum.Eligibility_Waiting_For_Hao_Signature,
            data: {
                name: headUser.name,
                organizationName: organization?.name ?? 'your organization',
                applicationUrl,
            },
        });

        await emailQueue.add('eligibilityWaitingForHaoSignature',
            {
                to: headUser.email,
                subject: 'Eligibility application requires your signature',
                html: mailContent as string,
            },
            { removeOnComplete: true, attempts: 3 },
        );
    }

    static async completeHaoSignature(applicationId: number, organizationId: string, signer: User, transaction?: Transaction,): Promise<Application> {
        const application = await Application.findByPk(applicationId, { transaction });
        if (!application) throw new AppError(404, 'Application not found');
        if (application.organization_id !== organizationId) throw new AppError(400, 'Application does not belong to this organization');
        if (application.status !== EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE) throw new AppError(400, 'Application is not waiting for Head Authorized Official signature');

        const isHead = await OrganizationUserService.userIsHeadAuthorizedOfficialForOrganization(signer.id, organizationId,);
        if (!isHead) throw new AppError(403, 'Only the Head Authorized Official may sign this application');
        if (!signer.is_email_verified) throw new AppError(403, 'You must verify your email address before signing. Check your inbox or request a new verification email.',);


        const oldStatus = application.status;
        const newStatus = EligibilityApplicationStatuses.SUBMITTED;
        await application.update({ status: newStatus }, { transaction });

        // Sign after the status flip and inside the tx so the archived PDF and its History log capture Submitted.
        const { application: signedApplication } = await this.signEligibilityApplication(applicationId, signer, transaction);

        await NotificationFactory.createNotification(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            {
                application: signedApplication,
                oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                newStatus: EligibilityApplicationStatusLabels[newStatus as EligibilityApplicationStatuses],
            },
        );

        return signedApplication;
    }

    /**
     * Fetches the attachment record, validates ownership, reads the file into a buffer,
     * and returns { buffer, originalName, mimeType }.
     */
    static async getApplicationAttachment(organizationId: string, attachmentId: number): Promise<{ buffer: Buffer; originalName: string; mimeType: string }> {
        const attachment = await ApplicationAttachment.findByPk(attachmentId);
        if (!attachment) throw new AppError(404, 'Attachment not found');

        const appForm = await ApplicationForm.findByPk(attachment.application_form_id);
        if (!appForm) throw new AppError(404, 'Associated application form not found');

        const application = await Application.findByPk(appForm.application_id);
        if (!application || application.organization_id !== organizationId) {
            throw new AppError(404, 'No such attachment under this organization');
        }

        const exists = await fileExists(attachment.path);
        if (!exists) throw new AppError(404, 'File not found on disk');

        const buffer: Buffer = await fs.readFile(attachment.path);
        const { originalName, mimeType } = attachment.metadata as any;

        return { buffer, originalName, mimeType };
    }

    static async getEligibilityApplicationPDF(applicationId: number): Promise<{ buffer: Buffer; originalName: string; mimeType: string }> {
        const application = await Application.findByPk(applicationId);
        if (!application) throw new AppError(404, 'Application not found');

        const exists = await fileExists(application.pdf_path!);
        if (!exists) throw new AppError(404, 'File not found on disk');

        const buffer: Buffer = await fs.readFile(application.pdf_path!);
        const originalName = application.pdf_path!.split('/').pop()!.split('.').slice(0, -1).join('.');
        const mimeType = 'application/pdf';

        return { buffer, originalName, mimeType };

    }

    /**
     * Fetches applications for a given state and groups them by status with their counts.
     */
    static async getApplicationsGroupedByStatus(stateId: number): Promise<{ [status: string]: number }> {
        const cacheIdentifier = cacheKeys.applicationStatusCounts;
        const cacheKey = cacheIdentifier.key(stateId.toString());

        let counts = await cache.get<{ [status: string]: number }>(cacheKey);
        if (counts) return counts;

        const applications = await Application.findAll({ where: { state_id: stateId }, attributes: ['status'], });

        counts = applications.reduce((acc, app) => {
            acc[app.status] = (acc[app.status] || 0) + 1;
            return acc;
        }, {} as { [status: string]: number });


        await cache.set(cacheKey, counts, cacheIdentifier.ttl);
        return counts;
    }


    /**
   * Fetches all applications in the given state with optional status filter,
   * then paginates them in-memory using paginateArray().
   */
    static async getApplicationsForReview(stateId: number, status: string, page: number, limit: number): Promise<PaginatedResponse<Application>> {
        const allApps = await Application.findAll({
            where: { state_id: stateId, ...(status ? { status } : {}) },
            order: [['createdAt', 'DESC']],
            include: [
                {
                    model: ApplicationForm,
                    as: 'applicationForms',
                    include: [
                        {
                            model: ApplicationAttachment,
                            as: 'attachments',
                        }
                    ]
                },
                { model: Organization, as: 'organization', attributes: ['id', 'name'] },
                { model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] },
                { model: Sba8aCertification, as: 'sba8aCertification' }
            ]
        });

        return paginateArray(allApps, page, limit);
    }

    /**
     * Retrieves a single application by its ID.
     * 
     * @param applicationId - The unique identifier of the application to retrieve
     * @param transaction - Optional Sequelize transaction object for database consistency
     * @returns A promise that resolves to the Application record
     * @throws {AppError} 404 - If the application with the given ID does not exist
     * 
     */
    static async getApplicationById(applicationId: number, transaction?: Transaction): Promise<Application> {
        const application = await Application.findByPk(applicationId, {
            transaction, include: [
                {
                    model: ApplicationForm,
                    as: 'applicationForms',
                    include: [
                        { model: ApplicationAttachment, as: 'attachments' }
                    ]
                }
            ]
        });
        if (!application) throw new AppError(404, 'Application not found');
        if (
            application.status === EligibilityApplicationStatuses.CHANGE_REQUESTED ||
            application.status === EligibilityApplicationStatuses.CHANGES_RETURNED
        ) {
            const latestChangeRequestLog = await this.getLatestChangeRequestLog(applicationId, transaction);
            const requesterSide = this.getRequesterSideFromLog(latestChangeRequestLog);
            if (requesterSide) {
                (application as unknown as { setDataValue: (key: string, value: unknown) => void })
                    .setDataValue('change_requested_by_side', requesterSide);
            }
        }
        return application;
    }

    /**
     * SDN-1277: returns the application plus its status-transition log timeline, with actor and approver names.
     * SASP-only at the route layer; this method itself does not enforce scope.
     */
    static async getApplicationHistory(applicationId: number): Promise<{ application: Application; logs: ApplicationLog[] }> {
        const application = await Application.findByPk(applicationId, {
            include: [
                { model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] },
                { model: User, as: 'approvedBy', attributes: ['id', 'name', 'email'] },
            ],
        });
        if (!application) throw new AppError(404, 'Application not found');

        const logs = await ApplicationLog.findAll({
            where: { application_id: applicationId },
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
            order: [['createdAt', 'ASC']],
        });

        return { application, logs };
    }

    /**
     * SDN-1277: returns the PDF archived under a specific ApplicationLog's `metadata.pdf_path`.
     * Validates that the log belongs to the given application.
     */
    static async getApplicationLogPdf(applicationId: number, logId: number): Promise<{ buffer: Buffer; originalName: string; mimeType: string }> {
        const log = await ApplicationLog.findByPk(logId);
        if (!log || log.application_id !== applicationId) throw new AppError(404, 'History event not found');

        const metadata = (log.metadata ?? {}) as { pdf_path?: string };
        if (!metadata.pdf_path) throw new AppError(404, 'No PDF archived for this event');

        const exists = await fileExists(metadata.pdf_path);
        if (!exists) throw new AppError(404, 'File not found on disk');

        const buffer = await fs.readFile(metadata.pdf_path);
        const originalName = metadata.pdf_path.split('/').pop()!.split('.').slice(0, -1).join('.');
        return { buffer, originalName, mimeType: 'application/pdf' };
    }

    /**
     * Approve or reject a specific form in an application.
     * If rejected, marks the parent application as 'rejected'.
     * For form 2 (Public Purpose/Primary Activity) approval with SBA 8(a) primary activity,
     * creates the SBA 8(a) certification record.
     */
    static async reviewForm(
        applicationId: number,
        formId: number,
        isApproved: boolean,
        reason?: string | null,
        expiryDate?: number,
        transaction?: Transaction,
        sba8aCertificationDate?: number,
        createdBy?: string,
        isEdited?: boolean,
        formData?: object | null,
        reviewerSide?: EligibilityActorSide,
    ): Promise<{
        application: Application,
        applicationForm: ApplicationForm,
        wasEditRequestFlow?: boolean,
        pendingNotifications: PendingEligibilityNotification[],
    }> {
        const pendingNotifications: PendingEligibilityNotification[] = [];
        // FOR UPDATE serializes concurrent reviews of the same application (double-submit). The second
        // request blocks until the first commits, then re-reads the committed status and is rejected by
        // the idempotency guard below. Lock the application first, then the form, to keep a stable order.
        const lockOpts = transaction ? { transaction, lock: Transaction.LOCK.UPDATE } : {};
        const application = await Application.findByPk(applicationId, lockOpts);
        const appForm = await ApplicationForm.findOne({ where: { application_id: applicationId, form_id: formId }, ...lockOpts });
        const oldStatus = application?.status as string;
        const now = Date.now();

        if (!appForm || !application) throw new AppError(404, 'Application form not found');

        if (application.status === EligibilityApplicationStatuses.SUBMITTED) {
            throw new AppError(400, 'Begin review before approving or rejecting forms');
        }

        // Re-approving an already-approved form is never a legitimate action; it only happens on a
        // double-submit that slipped past the lock. Reject the duplicate so it cannot re-sign or re-notify.
        if (isApproved && appForm.status === EligibilityApplicationFormStatuses.APPROVED) {
            throw new AppError(409, 'Form has already been reviewed');
        }

        const formUpdate: Partial<{ status: string; rejected_date: number | null; rejectedReason: string | null; approved_date: number; expiry_date: number | null; form_data: object }> = {};

        const isChangeRequestedFlow =
            application.status === EligibilityApplicationStatuses.CHANGE_REQUESTED ||
            appForm.status === EligibilityApplicationFormStatuses.EDITS_REQUESTED;

        if (isChangeRequestedFlow) {
            const latestChangeRequestLog = await this.getLatestChangeRequestLog(applicationId, transaction);
            const requesterSide = this.getRequesterSideFromLog(latestChangeRequestLog);
            if (!requesterSide || !reviewerSide || reviewerSide === requesterSide) {
                throw new AppError(403, 'Requested edits must be reviewed by the opposite party');
            }

            if (!isApproved) {
                if (!reason) throw new AppError(400, 'Return reason must be provided.');
                // Preserve requested values and comparison metadata; do not overwrite form_data from review payload.
                await appForm.update(
                    {
                        status: EligibilityApplicationFormStatuses.EDITS_RETURNED,
                        rejected_date: now,
                        rejectedReason: reason,
                    },
                    { transaction },
                );
                await application.update(
                    { status: EligibilityApplicationStatuses.CHANGES_RETURNED },
                    { transaction },
                );
                if (oldStatus !== application.status) {
                    pendingNotifications.push({
                        type: NotificationType.ELIGIBILITY_STATUS_CHANGED,
                        payload: {
                            application,
                            oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                            newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.CHANGES_RETURNED],
                        },
                    });
                }
                return { applicationForm: appForm, application, wasEditRequestFlow: true, pendingNotifications };
            }

            const existingExpiry = appForm.expiry_date ?? null;
            const approvedFormData =
                stripFormDataMetadata(formData as object | undefined) ??
                stripFormDataMetadata(appForm.form_data as object | string | null | undefined);
            await appForm.update(
                {
                    ...(approvedFormData ? { form_data: approvedFormData } : {}),
                    status: EligibilityApplicationFormStatuses.APPROVED,
                    approved_date: now,
                    // For requested edits review, keep existing expiry when none is provided.
                    expiry_date: typeof expiryDate === 'number' ? expiryDate : existingExpiry,
                    rejected_date: null,
                    rejectedReason: null,
                },
                { transaction },
            );

            const remainingRequestedEditsCount = await ApplicationForm.count({
                where: {
                    application_id: applicationId,
                    status: EligibilityApplicationFormStatuses.EDITS_REQUESTED,
                },
                transaction,
            });
            if (remainingRequestedEditsCount === 0) {
                await application.update(
                    { status: EligibilityApplicationStatuses.APPROVED },
                    { transaction },
                );
                await this.applyForm1OrganizationUpdatesFromRequestedEdits(
                    application,
                    transaction,
                );
                if (oldStatus !== application.status) {
                    pendingNotifications.push({
                        type: NotificationType.ELIGIBILITY_STATUS_CHANGED,
                        payload: {
                            application,
                            oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                            newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.APPROVED],
                        },
                    });
                }
            }
            return { applicationForm: appForm, application, wasEditRequestFlow: true, pendingNotifications };
        }

        if (formData !== undefined) formUpdate.form_data = formData as object;

        if (!isApproved) {
            if (!reason) throw new AppError(400, 'Rejection reason must be provided.');
            Object.assign(formUpdate, { status: EligibilityApplicationFormStatuses.REJECTED, rejected_date: now, rejectedReason: reason });
            await appForm.update(formUpdate, { transaction });
            let newStatus = EligibilityApplicationStatuses.REJECTED; // assuming app status is submitted unless otherwise.

            if (application.status === EligibilityApplicationStatuses.ON_FORM_RENEWAL) newStatus = EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED;
            if (application.status === EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL) newStatus = EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED;

            await application.update({ status: newStatus }, { transaction });
            if (oldStatus !== application.status) {
                pendingNotifications.push({
                    type: NotificationType.ELIGIBILITY_STATUS_CHANGED,
                    payload: {
                        application,
                        oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                        newStatus: EligibilityApplicationStatusLabels[newStatus as EligibilityApplicationStatuses],
                    },
                });
            }

            return { applicationForm: appForm, application: application, wasEditRequestFlow: false, pendingNotifications }
        }

        if (typeof expiryDate !== 'number' && appForm.is_required) throw new AppError(400, 'Expiry date is required when approving a required form');

        Object.assign(formUpdate, { status: EligibilityApplicationFormStatuses.APPROVED, approved_date: now, expiry_date: expiryDate, rejected_date: null, rejectedReason: null });
        await appForm.update(formUpdate, { transaction });

        // When isEdited and application was in a rejected state due to this form, restore the application status.
        if (isEdited) {
            let newStatus = application.status;
            if (application.status === EligibilityApplicationStatuses.REJECTED) {
                newStatus = EligibilityApplicationStatuses.SUBMITTED;
            } else if (application.status === EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED) {
                newStatus = EligibilityApplicationStatuses.ON_FORM_RENEWAL;
            } else if (application.status === EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED) {
                newStatus = EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL;
            }
            await application.update({ status: newStatus }, { transaction });
            if (oldStatus !== application.status) {
                pendingNotifications.push({
                    type: NotificationType.ELIGIBILITY_STATUS_CHANGED,
                    payload: {
                        application,
                        oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                        newStatus: EligibilityApplicationStatusLabels[newStatus as EligibilityApplicationStatuses],
                    },
                });
            }
        }

        // Handle SBA 8(a) certification when approving form 2 (Public Purpose/Primary Activity)
        if (formId === 1 && sba8aCertificationDate && createdBy) {
            const organization = await Organization.findByPk(application.organization_id);
            let type;
            if (isSba8aPrimaryActivity(organization?.primary_activity)) {
                type = 'sba';
            } else {
                type = 'veteran';
            }
            await Sba8aService.createCertification(application.donee_account_id, applicationId, sba8aCertificationDate, createdBy, type, transaction);
        }
        return { applicationForm: appForm, application: application, wasEditRequestFlow: false, pendingNotifications };
    }

    /**
     * Migrate `sba8aCertificationDate` from form 2's form_data to form 1's form_data for a given application.
     * If form 2 contains the field and form 1 does not, copy the value to form 1 and remove it from form 2.
     *
     * @returns true if a migration occurred, false otherwise
     */
    static async migrateSba8aCertificationDate(applicationId: number, transaction?: Transaction): Promise<boolean> {
        const _migrate = async (tx?: Transaction): Promise<boolean> => {
            const form2 = await ApplicationForm.findOne({ where: { application_id: applicationId, form_id: 2 }, transaction: tx });
            const form1 = await ApplicationForm.findOne({ where: { application_id: applicationId, form_id: 1 }, transaction: tx });

            if (!form2 || !form1) return false;

            const parseFormData = (d: any) => {
                if (!d) return {};
                try {
                    return typeof d === 'string' ? JSON.parse(d) : d;
                } catch {
                    return {};
                }
            };

            const data2 = parseFormData(form2.form_data);
            const data1 = parseFormData(form1.form_data);

            const sbaVal = data2?.sba8aCertificationDate;
            if (sbaVal === undefined || sbaVal === null) return false;
            if (data1?.sba8aCertificationDate !== undefined && data1?.sba8aCertificationDate !== null) return false; // already present on form1

            // migrate: copy to form1 and remove from form2
            data1.sba8aCertificationDate = sbaVal;
            delete data2.sba8aCertificationDate;

            // Use direct model update to ensure JSON is persisted correctly
            await ApplicationForm.update(
                { form_data: data1 },
                { where: { id: form1.id }, transaction: tx }
            );
            await ApplicationForm.update(
                { form_data: data2 },
                { where: { id: form2.id }, transaction: tx }
            );
            return true;
        };

        if (transaction) {
            return await _migrate(transaction);
        }

        return await withTransaction(async (tx) => {
            return await _migrate(tx);
        });
    }

    /**
     * Migrate `sba8aCertificationDate` for all applications where it exists on form 2.
     * Returns summary about migrated records.
     */
    static async migrateAllSba8aCertificationDates(): Promise<{ totalChecked: number; migrated: number; skipped: number; failures: number; failuresDetails: { applicationId: number; error: string }[] }> {
        const forms = await ApplicationForm.findAll({ where: { form_id: 2 }, attributes: ['application_id', 'form_data'] });
        let totalChecked = 0;
        let migrated = 0;
        let skipped = 0;
        let failures = 0;
        const failuresDetails: { applicationId: number; error: string }[] = [];

        for (const f of forms) {
            totalChecked++;
            const applicationId = Number(f.application_id);
            let data2: any = {};
            try {
                if (f.form_data) {
                    data2 = typeof f.form_data === 'string' ? JSON.parse(f.form_data) : f.form_data;
                }
            } catch {
                // malformed form_data - skip
                skipped++;
                continue;
            }

            const sbaVal = data2?.sba8aCertificationDate;
            if (sbaVal === undefined || sbaVal === null) {
                skipped++;
                continue;
            }

            try {
                const result = await EligibilityService.migrateSba8aCertificationDate(applicationId);
                if (result) migrated++;
                else skipped++;
            } catch (err: any) {
                failures++;
                failuresDetails.push({ applicationId, error: err?.message || String(err) });
            }
        }

        return { totalChecked, migrated, skipped, failures, failuresDetails };
    }

    /**
    * Finalizes review of the entire application.
    * - If approved:
    *   • Ensures every form has approved_date set
    *   • Sets application.status = 'approved'
    *   • Sets application.expiry_date = now + 1 year (Unix ms)
    *   • Activates the donee account
    * - If rejected:
    *   • Sets application.status = 'rejected'
    */
    static async approveApplication({ applicationId, name, approved_by }: { applicationId: number; name?: string; approved_by?: string; }, transaction?: Transaction): Promise<Application> {
        const application = await Application.findByPk(applicationId, {
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' }
            ],
            transaction
        });
        if (!application) throw new AppError(404, 'Application not found');

        if (application.status === EligibilityApplicationStatuses.SUBMITTED) {
            throw new AppError(400, 'Begin review before approving this application');
        }

        const oldStatus = application.status;
        const updates: any = { status: EligibilityApplicationFormStatuses.APPROVED, approved_by, approved_date: Date.now() };

        // handle approving
        const unapprovedCount = await ApplicationForm.count({
            where: {
                application_id: applicationId,
                status: { [Op.not]: EligibilityApplicationFormStatuses.APPROVED }
            },
            transaction,
        });

        if (unapprovedCount > 0) throw new AppError(400, 'Cannot approve application: all forms must be approved first');

        const threeYearMs = 3 * 365 * 24 * 60 * 60 * 1000;
        const doneeAccountId = application.donee_account_id;
        if (!doneeAccountId) throw new AppError(400, 'No donee account associated with this application');
        const doneeAccount = await DoneeAccountService.getDoneeAccountById(doneeAccountId);

        const isMigratedDoneeAccount = doneeAccount.isActive && doneeAccount.name && application.status === EligibilityApplicationStatuses.SUBMITTED;

        //new application(first time applying) should activate donee account and set donee account number.
        if (!doneeAccount?.name) {
            updates.expiry_date = Date.now() + threeYearMs
            if (!name) throw new AppError(404, 'Name not found');
            const isNameUnique = await DoneeAccountService.isDoneeAccountNameUnique(name);
            if (!isNameUnique) throw new AppError(400, 'Donee account name is not unique');
            await DoneeAccountService.updateDoneeAccount(doneeAccountId, { isActive: true, ...(name ? { name } : {}) }, transaction);
        }

        const extensionStatuses = [
            EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
            EligibilityApplicationStatuses.APPLICATION_EXPIRED,
            EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED,
        ] as string[];

        //make sure application should activate donee account
        if (extensionStatuses.includes(application.status) || isMigratedDoneeAccount) {
            updates.expiry_date = Date.now() + threeYearMs
            await DoneeAccountService.activateDoneeAccount(doneeAccountId, transaction)
        }

        await application.update(updates, { transaction });
        // Create QBO customer if not already exists
        if (!doneeAccount.qbo_ref_id && name && envvars.app.environment !== 'local_development') {
            const qboCustomerService = new QBOCustomerService();
            const hydratedOrg = await OrganizationUserService.getOrganizationById(
                application.organization_id,
                transaction,
                application.donee_account_id != null ? { doneeAccountId: application.donee_account_id } : undefined,
            );
            const customerData = await QBOCustomerService.generateCustomerData(
                application.organization as Organization,
                name,
                {
                    primaryPhone: hydratedOrg?.primary_contact_phone ?? hydratedOrg?.head_authorized_official_phone,
                    primaryEmail: hydratedOrg?.primary_contact_email ?? hydratedOrg?.head_authorized_official_email,
                },
            );
            const qboCustomer = await qboCustomerService.create(customerData);
            if (!qboCustomer.Id) throw new AppError(400, 'Cannot approve application: qbo customer id is missing', qboCustomer ? JSON.stringify(qboCustomer) : 'No qbo customer data');
            await DoneeAccountService.updateDoneeAccount(doneeAccountId, { qbo_ref_id: qboCustomer.Id }, transaction);
        }

        await NotificationFactory.createNotification(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            {
                application,
                oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                newStatus: EligibilityApplicationFormStatuses.APPROVED
            }
        );
        // No organization updates here; use OrganizationService.updateOrganizationInfo when needed.
        return application;
    }
    /**
     * fetching all forms from table
     */
    static async getAllForms(): Promise<Form[]> {
        const forms = await Form.findAll();

        if (!forms || forms.length === 0) {
            throw new AppError(404, "No forms found");
        }

        return forms;
    }


    /**
     * Derive organization fields from application form_data for relevant forms.
     * Returns a partial OrganizationCreationAttributes object.
     */
    static async getOlderAmericansActSelected(organizationId: string, transaction?: Transaction): Promise<boolean> {
        const applicationForm = await ApplicationForm.findOne({
            where: { form_id: 3 },
            include: [
                {
                    model: Application,
                    as: 'application',
                    where: { organization_id: organizationId },
                    required: true,
                    attributes: [],
                },
            ],
            order: [['updatedAt', 'DESC']],
            transaction,
        });

        if (!applicationForm?.form_data) {
            return false;
        }

        const formData = typeof applicationForm.form_data === 'string'
            ? JSON.parse(String(applicationForm.form_data) || '{}')
            : applicationForm.form_data;

        return Boolean((formData as Record<string, unknown>).olderAmericansAct);
    }

    /**
     * Update application form_data for forms 1 and 2 to reflect organization updates.
     * Called when organization information changes so stored form JSON stays in sync.
     */
    static async updateOrganizationInfoOfApplications(organizationId: string, updates: Partial<any>, changeUserEmail: boolean, transaction?: Transaction): Promise<void> {
        enum EligibilityFormIds {
            OrganizationalIdentityLegalProfile = 1,
            PublicPurposePrimaryProgramActivity = 2,
        }

        // Draft only — submitted/approved forms are frozen snapshots and must not be rewritten.
        const applications = await Application.findAll({
            where: { organization_id: organizationId, status: EligibilityApplicationStatuses.DRAFT },
            transaction,
        });

        if (!applications || applications.length === 0) return;

        for (const app of applications) {
            // Update form 2 (public purpose / primary activity)
            const form2 = await ApplicationForm.findOne({
                where: { application_id: app.id, form_id: EligibilityFormIds.PublicPurposePrimaryProgramActivity },
                transaction,
            });
            if (form2) {
                // Fresh object: form_data is a JSON column — mutating the stored reference in place
                // is a Sequelize no-op (new === current), so a new reference is needed to persist.
                const fd = { ...(typeof form2.form_data === 'string' ? JSON.parse(String(form2.form_data) || '{}') : (form2.form_data || {})) };
                if (updates.organization_type !== undefined) fd.organizationType = updates.organization_type;
                if (updates.organization_sub_type !== undefined) fd.organizationSubType = updates.organization_sub_type;
                if (updates.public_purpose !== undefined) fd.publicPurpose = updates.public_purpose;
                if (updates.primary_activity !== undefined) fd.primaryActivity = updates.primary_activity;
                await form2.update({ form_data: fd }, { transaction });
            }

            // Update form 1 (organizational identity / legal profile)
            const form1 = await ApplicationForm.findOne({
                where: { application_id: app.id, form_id: EligibilityFormIds.OrganizationalIdentityLegalProfile },
                transaction,
            });
            if (form1) {
                // Fresh object (see form2) so Sequelize persists the JSON UPDATE.
                const fd = { ...(typeof form1.form_data === 'string' ? JSON.parse(String(form1.form_data) || '{}') : (form1.form_data || {})) };
                if (updates.name !== undefined) fd.organizationName = updates.name;
                if (updates.website !== undefined) fd.organizationWebsiteAddress = updates.website;
                if (updates.tin !== undefined) fd.organizationTinEin = updates.tin;
                if (updates.contact_fax_number !== undefined)
                    fd.organizationFaxNumber = updates.contact_fax_number;
                // Keep Form 1 org categories in sync when Organization Details is PATCHed
                // (SDN-1348: reverse sync after the first form is confirmed/signed).
                if (updates.organization_type !== undefined) fd.organizationType = updates.organization_type;
                if (updates.organization_sub_type !== undefined) fd.organizationSubType = updates.organization_sub_type;
                if (updates.public_purpose !== undefined) fd.publicPurpose = updates.public_purpose;
                if (updates.primary_activity !== undefined) fd.primaryActivity = updates.primary_activity;

                const addressRows = await OrganizationAddressService.listByOrganizationId(organizationId, transaction);
                if (addressRows.length > 0) {
                    Object.assign(fd, OrganizationAddressService.toForm1AddressFields(addressRows));
                }

                await form1.update({ form_data: fd }, { transaction });
            }
        }
    }




    // ------------------------------ CRON JOBS -------------------------------- 

    /**
   *  WARNING FORMS:
   *  mark any approved forms expiring in ≤2 weeks as 'need renewal'; 
   *  cascade to application: if any form needs renewal, mark that application 'need form renewal'.
   */

    static async warnForms(): Promise<void> {
        const now = Date.now();
        const cutoff = now + 14 * 24 * 60 * 60 * 1000;

        const forms = await ApplicationForm.findAll({
            where: {
                status: {
                    [Op.in]: [
                        EligibilityApplicationFormStatuses.APPROVED,
                        EligibilityApplicationFormStatuses.FORM_RENEWAL_REQUIRED,
                        EligibilityApplicationFormStatuses.SIGNED,
                        EligibilityApplicationFormStatuses.REJECTED
                    ]
                },
                expiry_date: { [Op.gt]: now, [Op.lte]: cutoff, [Op.not]: null },
            },
        });

        for (const form of forms) {
            const application = await Application.findByPk(form.application_id);
            if (!application) continue;
            const oldStatus = application.status;

            if (form.status === EligibilityApplicationFormStatuses.FORM_RENEWAL_REQUIRED) continue;
            const skippableEligibilityStatuses = [EligibilityApplicationStatuses.ON_FORM_RENEWAL, EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED] as string[];
            if (skippableEligibilityStatuses.includes(application.status)) continue;

            await withTransaction(async (transaction) => {
                await form.update({ status: EligibilityApplicationFormStatuses.FORM_RENEWAL_REQUIRED }, { transaction });
                await ApplicationLog.create({ application_id: Number(form.application_id), application_form_id: form.id, user_id: 'system', action: EligbilityActions.FORM_RENEWAL_REQUIRED }, { transaction });
                const notAllowedEligibilityStatuses = [EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL, EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED] as string[];
                if (!notAllowedEligibilityStatuses.includes(application.status)) await application.update({ status: EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED }, { transaction });

                // Calculate days until expiry
                const daysUntilExpiry = Math.ceil((application.expiry_date! - now) / (1000 * 60 * 60 * 24));
                await NotificationFactory.createNotification(NotificationType.ELIGIBILITY_EXPIRATION_WARNING, { application, daysUntilExpiry });
                await NotificationFactory.createNotification(
                    NotificationType.ELIGIBILITY_STATUS_CHANGED,
                    {
                        application,
                        oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                        newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED as EligibilityApplicationStatuses]
                    }
                );
            });
        }
    }

    /**
     *   Warning Applications: 
     *   Mark approved applications expiring in ≤2 weeks as 'need renewal'.
     */
    static async warnApplications(): Promise<void> {
        const now = Date.now();
        const cutoff = now + 14 * 24 * 60 * 60 * 1000;

        const applications = await Application.findAll({
            where: {
                status: {
                    [Op.in]: [
                        EligibilityApplicationStatuses.APPROVED,
                        EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED,
                        EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
                        EligibilityApplicationStatuses.SUBMITTED,
                        EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED,
                        EligibilityApplicationStatuses.ON_FORM_RENEWAL,
                        EligibilityApplicationStatuses.FORM_EXPIRED,
                        EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED,
                    ]
                },
                expiry_date: { [Op.gt]: now, [Op.lte]: cutoff },
            },
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' }
            ]
        });

        for (const application of applications) {
            const skippableEligibilityStatuses = [
                EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED,
                EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
                EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED
            ] as string[];
            if (skippableEligibilityStatuses.includes(application.status)) continue;

            await withTransaction(async (transaction) => {
                const oldStatus = application.status;
                await application.update({ status: EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED }, { transaction });
                await ApplicationLog.create({ application_id: Number(application.id), user_id: 'system', action: EligbilityActions.APPLICATION_RENEWAL_REQUIRED }, { transaction });
                await ApplicationForm.update({ status: EligibilityApplicationFormStatuses.NEW }, { where: { application_id: application.id, expiry_date: { [Op.not]: null } }, transaction });

                // Calculate days until expiry
                const daysUntilExpiry = Math.ceil((application.expiry_date! - now) / (1000 * 60 * 60 * 24));
                await NotificationFactory.createNotification(NotificationType.ELIGIBILITY_EXPIRATION_WARNING, { application, daysUntilExpiry });
                await NotificationFactory.createNotification(
                    NotificationType.ELIGIBILITY_STATUS_CHANGED,
                    {
                        application,
                        oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                        newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED as EligibilityApplicationStatuses]
                    }
                );
            })
        }
    }

    /**
     * 2) Warning Forms: expire any approved or need-renewal forms whose expiry_date ≤ now; 
     *     cascade to application: if any form expired, mark that application 'expired'. 
     *      deactivate donee account too
     */
    static async expireForms(): Promise<void> {
        const now = Date.now();

        const forms = await ApplicationForm.findAll({
            where: {
                status: {
                    [Op.in]: [
                        EligibilityApplicationFormStatuses.APPROVED,
                        EligibilityApplicationFormStatuses.FORM_RENEWAL_REQUIRED,
                        EligibilityApplicationFormStatuses.SIGNED,
                        EligibilityApplicationFormStatuses.REJECTED
                    ]
                },
                expiry_date: { [Op.lte]: now, [Op.not]: null }, // since its not null rejected can never enter here !
            },
        });

        for (const form of forms) {
            await withTransaction(async (transaction) => {
                const application = await Application.findByPk(form.application_id);
                if (!application) return;
                const oldStatus = application?.status;

                await form.update({ status: EligibilityApplicationFormStatuses.FORM_EXPIRED }, { transaction });
                await application.update({ status: EligibilityApplicationStatuses.FORM_EXPIRED }, { transaction });
                await ApplicationLog.create({ application_id: Number(form.application_id), application_form_id: form.id, user_id: 'system', action: EligbilityActions.FORM_EXPIRED }, { transaction });
                await DoneeAccountService.deactivateDoneeAccount(application.donee_account_id, transaction);

                await NotificationFactory.createNotification(NotificationType.ELIGIBILITY_EXPIRED, { application });
                await NotificationFactory.createNotification(
                    NotificationType.ELIGIBILITY_STATUS_CHANGED,
                    {
                        application,
                        oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                        newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.FORM_EXPIRED as EligibilityApplicationStatuses]
                    }
                );
            })
        }
    }

    /**
     * 2b) Applications: expire any approved or need-renewal applications whose expiry_date ≤ now.
     */
    static async expireApplications(): Promise<void> {
        const now = Date.now();

        const aplications = await Application.findAll({
            where: {
                status: {
                    [Op.in]: [
                        EligibilityApplicationStatuses.APPROVED,
                        EligibilityApplicationStatuses.APPLICATION_RENEWAL_REQUIRED,
                        EligibilityApplicationStatuses.ON_APPLICATION_RENEWAL,
                        EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED,
                        EligibilityApplicationStatuses.SUBMITTED,
                        EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED,
                        EligibilityApplicationStatuses.ON_FORM_RENEWAL,
                        EligibilityApplicationStatuses.FORM_EXPIRED,
                        EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED,
                    ]
                },
                expiry_date: { [Op.lte]: now, },
            },
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' }
            ]
        });

        for (const application of aplications) {
            await withTransaction(async (transaction) => {
                const oldStatus = application.status;
                await application.update({ status: EligibilityApplicationStatuses.APPLICATION_EXPIRED }, { transaction });
                await ApplicationLog.create({ application_id: Number(application.id), user_id: 'system', action: EligbilityActions.APPLICATION_EXPIRED }, { transaction });

                await ApplicationForm.update({ status: EligibilityApplicationFormStatuses.NEW }, { where: { application_id: application.id, expiry_date: { [Op.not]: null } }, transaction });
                await DoneeAccountService.deactivateDoneeAccount(application.donee_account_id, transaction);

                await NotificationFactory.createNotification(NotificationType.ELIGIBILITY_EXPIRED, { application });
                await NotificationFactory.createNotification(
                    NotificationType.ELIGIBILITY_STATUS_CHANGED,
                    {
                        application,
                        oldStatus: EligibilityApplicationStatusLabels[oldStatus as EligibilityApplicationStatuses],
                        newStatus: EligibilityApplicationStatusLabels[EligibilityApplicationStatuses.APPLICATION_EXPIRED as EligibilityApplicationStatuses]
                    }
                );
            })

        }
    }

    static async fixMalformedEligibilityApplications(): Promise<void> {
        // Get all valid statuses from enum
        const validStatuses = Object.values(EligibilityApplicationStatuses);

        // Fetch all applications
        let applications = await Application.findAll({
            include: [
                {
                    model: ApplicationForm,
                    as: 'applicationForms',
                    include: [
                        {
                            model: ApplicationAttachment,
                            as: 'attachments'
                        }
                    ]
                },
                {
                    model: Organization,
                    as: 'organization'
                },
                {
                    model: State,
                    as: 'state'
                }
            ]
        });

        // Fix invalid statuses first
        for (const application of applications) {
            if (!validStatuses.includes(application.status as EligibilityApplicationStatuses)) {
                await application.update({ status: EligibilityApplicationStatuses.DRAFT });
            }
        }

        // Group applications by organization_id and state_id
        const groupedApplications = applications.reduce((acc, application) => {
            if (!acc[application.organization_id]) {
                acc[application.organization_id] = {};
            }
            if (!acc[application.organization_id][application.state_id]) {
                acc[application.organization_id][application.state_id] = [];
            }
            acc[application.organization_id][application.state_id].push(application);
            return acc;
        }, {} as { [organizationId: string]: { [stateId: number]: Application[] } });

        // Process each organization-state combination
        for (const organizationId in groupedApplications) {
            for (const stateId in groupedApplications[organizationId]) {
                const appsForOrgAndState = groupedApplications[organizationId][stateId];

                // Skip if only one application exists
                if (appsForOrgAndState.length <= 1) {
                    continue;
                }

                // Sort by createdAt descending (latest first)
                appsForOrgAndState.sort((a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );

                // Find approved applications
                const approvedApps = appsForOrgAndState.filter(
                    app => app.status === EligibilityApplicationStatuses.APPROVED
                );

                let applicationToKeep: Application;
                let applicationsToDelete: Application[];

                if (approvedApps.length > 0) {
                    // Keep the latest approved application
                    applicationToKeep = approvedApps[0];
                    applicationsToDelete = appsForOrgAndState.filter(
                        app => app.id !== applicationToKeep.id
                    );
                } else {
                    // Keep the latest application (already sorted)
                    applicationToKeep = appsForOrgAndState[0];
                    applicationsToDelete = appsForOrgAndState.slice(1);
                }

                // Delete all applications except the one to keep
                for (const appToDelete of applicationsToDelete) {
                    await withTransaction(async (transaction) => {
                        await this.deleteApplication(appToDelete.id, transaction);
                    });
                }
            }
        }
    }
}
