import { Request, Response } from 'express';
import { OrganizationService } from '@/organization/services/organization';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { OrganizationFileService } from '@/organization/services/organizationFileService';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { withTransaction } from '@/utils/transactionalOperation';
import { DoneeAccountService } from '@/organization/services/donee';
import DoneeAccount from '@/organization/models/DoneeAccount';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Scope from '@/authz/models/Scope';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import { AppError } from '@/utils/response/appError';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import { StateService } from '@/states/services/state';
import Role from '@/authz/models/Role';
import { PredefinedRoles } from '@/enums/predefinedRoles.enum';
import ApplicationLog from '@/eligibility/models/ApplicationLogs.entity';
import { EligbilityActions } from '@/enums/eligibilityActions.enum';
import { Activity } from '../../sasp/models/SaspAuditLogs.entity';
import SaspAuditLog from '../../sasp/models/SaspAuditLogs.entity';
import { InvitationFilterKeys } from '@/enums/invitationFilterKeys.enum';
import User from '@/authn/models/User';
import type { OrganizationAddressUpsertInput } from '@/organization/services/organizationAddress.service';
import { HaoRoleInvitationService } from '@/organization/services/haoRoleInvitation.service';
import HaoRoleInvitation from '@/organization/models/HaoRoleInvitation.entity';
import { ScopeType } from '@/enums/scope.enum';
import NotificationFactory from '@/notifications/services/notification-factory.service';
import { getLogger } from '@/utils/logger';

const logger = getLogger('OrganizationController');

function normalizeOrganizationAddressesFromBody(body: Record<string, unknown>): OrganizationAddressUpsertInput[] | undefined {
    const raw = body.addresses;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return undefined;
    const out: OrganizationAddressUpsertInput[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const a = item as Record<string, unknown>;
        const address_type = a.address_type != null ? String(a.address_type).trim() : '';
        const address_line1 = a.address_line1 != null ? String(a.address_line1).trim() : '';
        const city = a.city != null ? String(a.city).trim() : '';
        const state = a.state != null ? String(a.state).trim() : '';
        const postal_code = a.postal_code != null ? String(a.postal_code).trim() : '';
        if (!address_type || !address_line1 || !city || !state || !postal_code) continue;
        out.push({
            address_type,
            address_line1,
            address_line2: a.address_line2 != null && String(a.address_line2).trim() !== '' ? String(a.address_line2).trim() : null,
            city,
            state,
            postal_code,
        });
    }
    return out.length ? out : undefined;
}

function getActorSide(req: Request): 'sasp' | 'donee' {
    const scopes = req.user?.scopes as (Scope & IUserCorperate)[] | undefined;
    const hasActiveSaspScope = Boolean(scopes?.some((scope) => scope.type === ScopeType.SASP && scope.isActive));
    return hasActiveSaspScope ? 'sasp' : 'donee';
}

/**
 * Handles creating a new organization.
 */
export const create = async (req: Request, res: Response): Promise<void> => {
    try {
        const creator = await User.findByPk(req.user.id);
        if (!creator) throw new AppError(404, 'User not found');

        const normalizedName = creator?.name?.trim();
        if (!normalizedName) throw new AppError(404, 'User name not found')

        const [firstName, ...rest] = normalizedName.split(/\s+/);
        const lastName = rest.join(' ').trim();

        if (!firstName || firstName.trim() === '' || !lastName || lastName === '') {
            throw new AppError(400, 'Full name is required (first name and last name), please go to profile page and update your name');
        }

        

        const organizationData = {
            name: req.body.name,
            website: req.body.website,
            tin: req.body.tin,
            mailing_address_line1: req.body.mailing_address_line1,
            mailing_address_line2: req.body.mailing_address_line2,
            mailing_city: req.body.mailing_city,
            mailing_state: req.body.mailing_state,
            mailing_zip: req.body.mailing_zip,
            organization_type: req.body.organization_type,
            organization_sub_type: req.body.organization_sub_type,
            public_purpose: req.body.public_purpose,
            primary_activity: req.body.primary_activity,
            contact_fax_number: req.body.contact_fax_number,
        };

        const tinExists = await OrganizationService.isTINExist(organizationData.tin);
        if (tinExists) throw new AppError(400, 'This EIN already exists, please enter a different EIN');


        await withTransaction(async (transaction) => {

            // Call the service to create the organization
            const newOrganization = await OrganizationService.create(organizationData, transaction);
            const organizationId = newOrganization.id;
            const userId = req.user.id;

            const organizationUser = await OrganizationUserService.addUser(
                organizationId,
                userId,
                true,
                transaction,
                {
                    title: req.body.contact_title,
                    phoneNumber: req.body.contact_phone,
                }
            );

            const scope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION } });
            const role = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Admin } });

            if (!scope || !role)
                throw new AppError(400, 'Unable to assign permissions for organization owner. Please try again.', 'Unable to get user scope or role for organization owner');

            //assignin org admin role to creator of organization
            await OrganizationUserService.assignRoleToOrganizationUser({ organizationUserId: organizationUser.id, userId, role_id: role.role_id, is_organization_create_action: true }, transaction);
            await OrganizationFileService.prepareOrgFolder(organizationId);
            sendSuccess(res, newOrganization, 201);
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Updates organization information.
 */
export const updateOrganizationInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;

        const addresses = normalizeOrganizationAddressesFromBody(req.body as Record<string, unknown>);

        const updates = {
            legal_entity: req.body.legal_entity,
            organization_type: req.body.organization_type,
            organization_sub_type: req.body.organization_sub_type,
            public_purpose: req.body.public_purpose,
            primary_activity: req.body.primary_activity,
            website: req.body.website,
            tin: req.body.tin,
            name: req.body.name,
            contact_fax_number: req.body.contact_fax_number,
            ...(addresses?.length ? { addresses } : {}),
        };

        // Prevent donee edits if organization already has an approved application
        const applications = await OrganizationService.listApplications(organizationId);
        const hasApprovedApplication = applications?.some(app => app.status === EligibilityApplicationStatuses.APPROVED);
        if (hasApprovedApplication) {
            throw new AppError(403, 'Organization with an approved application cannot modify this information');
        }

        await withTransaction(async (transaction) => {
            const updatedOrganization = await OrganizationService.updateOrganizationInfo(organizationId, updates, false, transaction);

            sendSuccess(res, { updatedOrganization });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Updates organization information for SASP users only.
 * Restricts updates to a limited set of fields.
 */
export const updateOrganizationInfoBySasp = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;

        const addresses = normalizeOrganizationAddressesFromBody(req.body as Record<string, unknown>);

        const updates = {
            name: req.body.name,
            website: req.body.website,
            tin: req.body.tin,
            organization_type: req.body.organization_type,
            organization_sub_type: req.body.organization_sub_type,
            public_purpose: req.body.public_purpose,
            primary_activity: req.body.primary_activity,
            contact_fax_number: req.body.contact_fax_number,
            ...(addresses?.length ? { addresses } : {}),
        };

        const sanitizedUpdates = Object.fromEntries(
            Object.entries(updates).filter(([key, value]) => {
                if (key === 'addresses') return Array.isArray(value) && (value as unknown[]).length > 0;
                if (value === undefined || value === null) return false;
                if (typeof value === 'string' && value.trim() === '') return false;
                return true;
            })
        );

        if (!Object.keys(sanitizedUpdates).length) throw new AppError(400, 'At least one updatable field is required');

        await withTransaction(async (transaction) => {
            const updatedOrganization = await OrganizationService.updateOrganizationInfo(organizationId, sanitizedUpdates, false, transaction);

            sendSuccess(res, { updatedOrganization });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Retrieves an organization by ID, ensuring the user has access.
 */
export const getOrganization = async (req: Request, res: Response): Promise<void> => {
    try {
        // req.user is populated from authentication middleware
        const userId = req.user.id;

        // Extract the organization ID from the request
        const { organizationId } = req.params;

        // Fetch the organization details
        const organizationDetails = await OrganizationUserService.getOrganizationById(organizationId, undefined, (() => {
            const raw = req.query.doneeAccountId;
            if (raw == null || raw === '') return undefined;
            const n = Number(raw);
            return Number.isFinite(n) && n > 0 ? { doneeAccountId: n } : undefined;
        })());
        const applications = await OrganizationService.listApplications(organizationId);
        const hasApprovedApplication = applications?.some(app => app.status === EligibilityApplicationStatuses.APPROVED) ?? false;
        const canEditOrganizationInfo =
            await OrganizationUserService.getCanEditOrganizationInfoForOrganization(
                userId,
                organizationId,
                applications ?? [],
            );

        sendSuccess(res, { ...organizationDetails, hasApprovedApplication, canEditOrganizationInfo });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Handles retrieving paginated organizations that the authenticated user belongs to.
 * Defaults to page 1 and limit 10 if not provided.
 */
export const getUserOrganizations = async (req: Request, res: Response): Promise<void> => {
    try {
        // Extract userId from authentication middleware
        const userId = req.user.id;

        // Extract pagination parameters from query string
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;

        // Fetch paginated organizations for the user
        const result = await OrganizationUserService.getUserOrganizations(userId, page, limit);

        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Verifies if the user has access to the organization.
 */
export const verifyAccess = async (req: Request, res: Response): Promise<void> => {
    try {
        // req.user is populated from authentication middleware
        const userId = req.user.id;

        // Extract the organization ID from the request
        const { organizationId } = req.params;

        // Check if the user has access to the organization
        const hasAccess = await OrganizationUserService.isUserInOrganization(organizationId, userId);

        sendSuccess(res, { hasAccess });
    } catch (error) {
        sendError(req, res, error);
    }
};

/*
*creating application for organziation
*/
export const createApplication = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const { stateId, forms } = req.body;
        const doneeAccountDetails = { organizationId: organizationId, stateId: stateId, isActive: false } as DoneeAccount

        await withTransaction(async (transaction) => {
            const isMigratedDoneeAccount = await DoneeAccountService.getDoneeAccountByOrganizationAndState(organizationId, stateId, transaction);
            const doneeAccount = isMigratedDoneeAccount ?? await DoneeAccountService.createDoneeAccount(doneeAccountDetails, transaction)
            const application = await EligibilityService.createApplication({ organizationId, doneeAccountId: doneeAccount.id, stateId, createdBy: req.user }, transaction)
            const applicationForms = await EligibilityService.bulkCreateApplicationForms(application.id, forms, transaction)
            await DoneeAccountService.assignHeadAuthRoleDoneeAccount(doneeAccount.id, req.user.id, false, transaction);
            sendSuccess(res, { doneeAccount, application, applicationForms });
        })
    } catch (error) {
        sendError(req, res, error);
    }
}

/*
*deleting application for organziation
*/
export const deleteApplication = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId } = req.params;
        await withTransaction(async (transaction) => {
            await EligibilityService.deleteApplication(Number(applicationId), transaction);
            sendSuccess(res, { message: 'Application deleted' });
        });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const denyApplication = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId } = req.params;
        const { deny_reason } = req.body;
        if (!deny_reason) throw new AppError(400, 'Deny reason is required', 'Deny reason is required');

        await withTransaction(async (transaction) => {
            await EligibilityService.denyApplication(Number(applicationId), deny_reason, transaction);
            // Deny previously mutated only application.status; History needs the moment + reason
            // as a discrete log row.
            await ApplicationLog.create(
                { application_id: Number(applicationId), user_id: req.user?.id, action: EligbilityActions.APPLICATION_DENIED, metadata: { deny_reason } },
                { transaction }
            );
            sendSuccess(res, { message: 'Application denied' });
        });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const beginReview = async (req: Request, res: Response): Promise<void> => {
    try {
        const applicationId = Number(req.params.applicationId);

        await withTransaction(async (transaction) => {
            const { application, transitioned } = await EligibilityService.beginReview(applicationId, transaction);
            if (transitioned) {
                await ApplicationLog.create(
                    { application_id: applicationId, user_id: req.user?.id, action: EligbilityActions.APPLICATION_IN_REVIEW },
                    { transaction }
                );
            }
            sendSuccess(res, { application });
        });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const uploadApplicationAttachment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId, formId } = req.params;
        const file = req.file;

        if (!file) throw new Error('File is missing');

        await withTransaction(async (transaction) => {
            const attachment = await EligibilityService.uploadApplicationAttachment(
                Number(applicationId),
                Number(formId),
                file,
                req.body.description,
                transaction
            );

            await ApplicationLog.create({ application_id: Number(applicationId), application_form_id: Number(attachment.application_form_id), user_id: req.user?.id, action: EligbilityActions.ATTACHMENT_UPLOADED }, { transaction })
            sendSuccess(res, { attachment });
        });

    } catch (error) {
        sendError(req, res, error);
    }
};

export const deleteApplicationAttachment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId, formId, attachmentId } = req.params;

        await withTransaction(async (transaction) => {
            const applicationForm = await EligibilityService.deleteApplicationAttachment(
                Number(applicationId),
                Number(formId),
                Number(attachmentId),
                transaction
            );
            await ApplicationLog.create({ application_id: Number(applicationId), application_form_id: Number(applicationForm.id), user_id: req.user?.id, action: EligbilityActions.ATTACHMENT_DELETED }, { transaction })
            sendSuccess(res, { message: 'Attachment deleted' });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const updateFormData = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId, formId } = req.params;
        const formData = req.body.data;  //  payload is the JSON blob

        await withTransaction(async (transaction) => {
            const applicationForm = await EligibilityService.updateFormData(
                Number(applicationId),
                Number(formId),
                formData,
                transaction,
                req.user?.id,
                getActorSide(req),
            );
            await ApplicationLog.create({ application_id: Number(applicationId), application_form_id: Number(applicationForm.id), user_id: req.user?.id, action: EligbilityActions.FORM_DATA_UPDATED }, { transaction });
            sendSuccess(res, { applicationForm });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const requestApplicationEdits = async (req: Request, res: Response): Promise<void> => {
    try {
        const applicationId = Number(req.params.applicationId);
        const requesterSide = getActorSide(req);
        await withTransaction(async (transaction) => {
            const application = await EligibilityService.startChangeRequest(
                applicationId,
                requesterSide,
                req.user.id,
                transaction,
            );
            await ApplicationLog.create(
                {
                    application_id: applicationId,
                    user_id: req.user?.id,
                    action: EligbilityActions.APPLICATION_CHANGES_REQUESTED,
                    metadata: { requested_by_side: requesterSide, status: application.status },
                },
                { transaction },
            );
            sendSuccess(res, { application });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const submitApplicationEdits = async (req: Request, res: Response): Promise<void> => {
    try {
        const applicationId = Number(req.params.applicationId);
        const requesterSide = getActorSide(req);
        await withTransaction(async (transaction) => {
            const { application, updatedForms } = await EligibilityService.submitChangeRequest(
                applicationId,
                requesterSide,
                req.user.id,
                transaction,
            );
            await ApplicationLog.create(
                {
                    application_id: applicationId,
                    user_id: req.user?.id,
                    action: EligbilityActions.APPLICATION_CHANGES_REQUESTED,
                    metadata: { requested_by_side: requesterSide, status: application.status },
                },
                { transaction },
            );
            for (const form of updatedForms) {
                await ApplicationLog.create(
                    {
                        application_id: applicationId,
                        application_form_id: Number(form.id),
                        user_id: req.user?.id,
                        action: EligbilityActions.FORM_EDITS_REQUESTED,
                        metadata: { requested_by_side: requesterSide, status: application.status },
                    },
                    { transaction },
                );
            }
            sendSuccess(res, { application });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getApplicationForm = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId, formId } = req.params;

        const applicationForm = await EligibilityService.getApplicationForm(
            Number(applicationId),
            Number(formId)
        );

        sendSuccess(res, { applicationForm });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const generateEligibilityApplicationPDF = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId } = req.params;
        const createdBy = req.user;

        const { document, displayName, application } = await EligibilityService.generateEligibilityApplicationPDF(Number(applicationId), createdBy);
        sendSuccess(res, { document, displayName, application });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const signEligibilityApplication = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId } = req.params;
        const signedBy = req.user;

        const { document, displayName, application } = await EligibilityService.signEligibilityApplication(Number(applicationId), signedBy);
        sendSuccess(res, { document, displayName, application });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const submitApplication = async (req: Request, res: Response): Promise<void> => {
    try {
        const applicationId = Number(req.params.applicationId);
        const signedBy = req.user;
        await withTransaction(async (transaction) => {
            await EligibilityService.submitApplication(
              applicationId,
              signedBy?.id,
              transaction,
            );
            // Sign inside the same tx so application.pdf_path reflects the just-submitted PDF
            // before we snapshot it into the log — otherwise History links to the pre-submit file.
            const { application } = await EligibilityService.signEligibilityApplication(applicationId, signedBy, transaction);
            await ApplicationLog.create(
                { application_id: applicationId, user_id: req.user?.id, action: EligbilityActions.APPLICATION_SUBMITTED, metadata: { pdf_path: application.pdf_path, status: application.status } },
                { transaction }
            );
            sendSuccess(res, { application });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const listApplications = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const applications = await OrganizationService.listApplications(organizationId);
        sendSuccess(res, { applications });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const downloadAttachment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId, id } = req.params;

        // Delegate to EligibilityService
        const { buffer, originalName, mimeType } = await EligibilityService.getApplicationAttachment(organizationId, Number(id));

        // Send raw buffer with correct Content-Type and filename
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
        res.send(buffer);
    } catch (err) {
        sendError(req, res, err);
    }
};

export const downloadEligibilityApplicationPDF = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId } = req.params;

        // Delegate to EligibilityService
        const { buffer, originalName, mimeType } = await EligibilityService.getEligibilityApplicationPDF(Number(applicationId));

        // Send raw buffer with correct Content-Type and filename
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
        res.send(buffer);
    } catch (err) {
        sendError(req, res, err);
    }
};

export const getApplicationsGroupedByStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const saspScope = (req.user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive === true);
        const stateId = Number((saspScope as (Scope & IUserCorperate))?.stateId);
        if (stateId === undefined || stateId === null) throw new AppError(401, 'Unauthenticated', 'State is missing');

        const applications = await EligibilityService.getApplicationsGroupedByStatus(stateId);
        sendSuccess(res, applications);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const getApplicationsForReview = async (req: Request, res: Response): Promise<void> => {
    try {
        const saspScope = (req.user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive === true);
        const stateId = Number((saspScope as (Scope & IUserCorperate))?.stateId);
        if (stateId === undefined || stateId === null) throw new AppError(401, 'Unauthenticated', 'State is missing');

        const status = (req.query.status as string) || 'submitted';
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;

        const applications = await EligibilityService.getApplicationsForReview(stateId, status, page, limit);
        sendSuccess(res, applications);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getApplicationById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId } = req.params;

        const application = await EligibilityService.getApplicationById(Number(applicationId));

        sendSuccess(res, { application });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * SDN-1277: SASP-only. Returns the application with logs (status transition history).
 * Donee access is intentionally blocked at this layer.
 */
export const getApplicationHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const saspScope = (req.user.scopes as (Scope & IUserCorperate)[]).find(
            (scope) => scope.type === ScopeType.SASP && scope.isActive === true
        );
        if (!saspScope) throw new AppError(403, 'Forbidden', 'Application history is SASP-only');

        const { applicationId } = req.params;
        const data = await EligibilityService.getApplicationHistory(Number(applicationId));
        sendSuccess(res, data);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * SDN-1277: SASP-only. Streams the PDF that was archived alongside a specific log event
 * (path stored in ApplicationLog.metadata.pdf_path). Used by the History timeline's "View Document" button.
 */
export const downloadApplicationLogPdf = async (req: Request, res: Response): Promise<void> => {
    try {
        const saspScope = (req.user.scopes as (Scope & IUserCorperate)[]).find(
            (scope) => scope.type === ScopeType.SASP && scope.isActive === true
        );
        if (!saspScope) throw new AppError(403, 'Forbidden', 'Application history is SASP-only');

        const applicationId = Number(req.params.applicationId);
        const logId = Number(req.params.logId);
        const { buffer, originalName, mimeType } = await EligibilityService.getApplicationLogPdf(applicationId, logId);

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
        res.send(buffer);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const reviewForm = async (req: Request, res: Response): Promise<void> => {
    try {
        const { applicationId, formId } = req.params;
        const { isApproved, reason, expiryDate, sba8aCertificationDate, isEdited, formData } = req.body;

        const actorSide = getActorSide(req);
        const response = await withTransaction(async (transaction) => {
            const result = await EligibilityService.reviewForm(
                Number(applicationId),
                Number(formId),
                isApproved,
                reason,
                Number(expiryDate),
                transaction,
                sba8aCertificationDate ? Number(sba8aCertificationDate) : undefined,
                req.user?.id,
                isEdited,
                formData,
                actorSide,
            );
            const updatedForm = result.applicationForm;
            const isEditRequestFormDecision =
                updatedForm.status === 'Edits_Returned' ||
                result.application.status === 'Changes_Returned' ||
                result.application.status === 'Change_Requested';
            const action = isEditRequestFormDecision
                ? (isApproved
                    ? EligbilityActions.FORM_EDITS_APPROVED
                    : EligbilityActions.FORM_EDITS_RETURNED)
                : EligbilityActions.REVIEW_FORM;
            const shouldCreateFormDecisionLog = !(
                isEditRequestFormDecision && !isApproved
            );
            if (shouldCreateFormDecisionLog) {
                await ApplicationLog.create(
                    {
                        application_id: Number(applicationId),
                        application_form_id: Number(updatedForm.id),
                        user_id: req.user?.id,
                        action,
                        metadata: { ...req.body, actor_side: actorSide },
                    },
                    { transaction },
                );
            }
            if (result.application.status === EligibilityApplicationStatuses.CHANGES_RETURNED) {
                await ApplicationLog.create(
                    {
                        application_id: Number(applicationId),
                        user_id: req.user?.id,
                        action: EligbilityActions.APPLICATION_CHANGES_RETURNED,
                        metadata: { actor_side: actorSide, reason },
                    },
                    { transaction },
                );
            }
            if (actorSide === 'sasp') {
                // Must run inside the transaction. The HAO sync above X-locks the reviewer's users row,
                // and this insert's FK on activator needs a shared lock on that same row — on a separate
                // autocommit connection it self-deadlocks (50s lock wait), inside the tx it is granted.
                await SaspAuditLog.create({
                    state_id: result.application.state_id,
                    activator: req.user?.id,
                    activity: isApproved ? Activity.FORM_APPROVED : Activity.FORM_REJECTED,
                    metadata: {
                        applicationId: applicationId,
                        formId: formId,
                        isApproved: isApproved,
                        reason: reason,
                        expiryDate: expiryDate,
                    },
                }, { transaction });
            }
            return result;
        });

        // Post-commit side effects. The PDF re-sign launches Puppeteer; running it inside the transaction
        // held row locks across a multi-second browser render and caused Lock wait timeouts. Now that the
        // review is committed, sign and notify outside the transaction. A PDF failure here no longer rolls
        // back the approval — it is logged, and the (real) status-change notifications still go out.
        if (
            response.wasEditRequestFlow &&
            response.application.status === EligibilityApplicationStatuses.APPROVED
        ) {
            try {
                const { application } = await EligibilityService.signEligibilityApplication(
                    Number(applicationId),
                    req.user,
                    undefined,
                    { preserveSaspSignature: true, refreshSignatureDates: true },
                );
                await ApplicationLog.create({
                    application_id: Number(applicationId),
                    user_id: req.user?.id,
                    action: EligbilityActions.APPLICATION_CHANGES_APPROVED,
                    metadata: { actor_side: actorSide, pdf_path: application.pdf_path },
                });
            } catch (signErr) {
                logger.error('Post-approval PDF re-sign failed; approval is committed', { applicationId, error: signErr });
            }
        }

        for (const notification of response.pendingNotifications) {
            await NotificationFactory.createNotification(notification.type, notification.payload);
        }

        sendSuccess(res, { applicationForm: response.applicationForm });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const approveApplication = async (req: Request, res: Response): Promise<void> => {
    try {
        const applicationId = Number(req.params.applicationId);
        const { name } = req.body;
        const signedBy = req.user;

        await withTransaction(async (transaction) => {
            await EligibilityService.approveApplication({ applicationId, name, approved_by: req.user?.id }, transaction);
            // Sign as SASP after approval so application.pdf_path holds the final donee+SASP PDF
            // before the History log snapshots it.
            const { application } = await EligibilityService.signEligibilityApplication(applicationId, signedBy, transaction);
            await ApplicationLog.create(
                { application_id: applicationId, user_id: req.user?.id, action: EligbilityActions.APPLICATION_APPROVED, metadata: { ...req.body, pdf_path: application.pdf_path } },
                { transaction }
            );
            await SaspAuditLog.create({
                state_id: application.state_id,
                activator: req.user?.id,
                activity: Activity.APPLICATION_APPROVED,
                metadata: {
                    applicationId: application.id,
                    doneeAccountName: name,
                },
            });
            sendSuccess(res, { application });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const fetchAvailableStates = async (req: Request, res: Response): Promise<void> => {
    try {
        const states = await StateService.getStates();
        sendSuccess(res, { states });
    } catch (err) {
        sendError(req, res, err);
    }
}

export const fetchAllForms = async (req: Request, res: Response): Promise<void> => {
    try {
        const forms = await EligibilityService.getAllForms();
        sendSuccess(res, { forms });
    } catch (err) {
        sendError(req, res, err);
    }
}

export const inviteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const invited_by = req.user?.id;
        const { invited_user_id, role, donee_account_ids } = req.body;

        const invitation = await OrganizationService.inviteUser(organizationId, invited_user_id, invited_by, role, donee_account_ids);
        sendSuccess(res, { invitation });
    } catch (err) {
        sendError(req, res, err);
    }
}

export const cancelInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const { invited_user_id } = req.body;

        const result = await OrganizationService.cancelInvitation(organizationId, invited_user_id);
        sendSuccess(res, { invitation: result });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const resendInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const { invited_user_id } = req.body;

        const invitation = await OrganizationService.resendInvitation(organizationId, invited_user_id);
        sendSuccess(res, { invitation });
    } catch (error) {
        sendError(req, res, error);
    }
};


export const respondInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const { userId, isAccepted } = req.body;

        if (req.user?.id !== userId) throw new AppError(400, 'Authenticated user does not match with the is given in the request');

        await withTransaction(async (transaction) => {
            await OrganizationService.respondInvitation(isAccepted, organizationId, userId, transaction);
        });

        sendSuccess(res, { success: true });
    } catch (err) {
        sendError(req, res, err);
    }
}

export const changePrimaryContact = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId, doneeAccountId } = req.params;
        const { userId, isPrimaryContact } = req.body;

        await withTransaction(async (transaction) => {
            if (isPrimaryContact === false) {
                await DoneeAccountService.clearDoneeAccountPrimaryContact(
                    Number(doneeAccountId),
                    organizationId,
                    userId,
                    transaction,
                );
            } else {
                await DoneeAccountService.updateDoneeAccountPrimaryContact(
                    Number(doneeAccountId),
                    organizationId,
                    userId,
                    transaction,
                );
            }
            sendSuccess(res);
        });
    } catch (err) {
        sendError(req, res, err);
    }
}

export const changeHeadAuthorizedOfficial = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId, doneeAccountId } = req.params;
        const { new_user_id, name, email, contact_title, contact_phone } = req.body;

        await withTransaction(async (transaction) => {
            const doneeAccount = await DoneeAccountService.changeHeadAuthorizedRepresentative(
                Number(doneeAccountId),
                organizationId,
                new_user_id,
                transaction
            );

            await SaspAuditLog.create({
                state_id: doneeAccount.stateId,
                activator: req.user?.id,
                activity: Activity.PRIMARY_CONTACT_CHANGED,
                metadata: {
                    organizationId,
                    doneeAccountId,
                    new_user_id,
                    name,
                    email,
                    contact_title,
                    contact_phone,
                },
            }, { transaction });

            sendSuccess(res, { success: true });
        });
    } catch (err) {
        sendError(req, res, err);
    }
}

export const primaryContactinfoChange = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId, doneeAccountId, userId } = req.params;
        const { primary_contact_full_name, primary_contact_title, primary_contact_phone } = req.body;

        await withTransaction(async (transaction) => {
            await DoneeAccountService.primaryContactInfoChange(
                Number(doneeAccountId),
                organizationId,
                userId,
                {
                    primary_contact_full_name,
                    primary_contact_title,
                    primary_contact_phone,
                },
                transaction
            );

            const saspScope = (req.user?.scopes as (Scope & IUserCorperate)[] | undefined)?.find(
                (scope) => scope.type === ScopeType.SASP && scope.isActive === true
            );
            let auditStateId = saspScope?.stateId;
            if (auditStateId == null) {
                const donee = await DoneeAccount.findOne({
                    where: { id: Number(doneeAccountId) },
                    attributes: ['stateId'],
                    transaction,
                });
                auditStateId = donee?.stateId;
            }
            if (auditStateId == null) {
                throw new AppError(500, 'Could not resolve state for SASP audit log');
            }

            await SaspAuditLog.create({
                state_id: auditStateId,
                activator: req.user?.id as string,
                activity: Activity.PRIMARY_CONTACT_INFO_UPDATED,
                metadata: {
                    userId,
                    organizationId,
                    doneeAccountId: Number(doneeAccountId),
                    primary_contact_full_name,
                    primary_contact_title,
                    primary_contact_phone,
                },
            }, { transaction });

            sendSuccess(res, { success: true });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const headAuthinfoChange = async (req: Request, res: Response): Promise<void> => {
    try {
        const { userId, organizationId } = req.params;
        const {
            head_authorized_official_name,
            head_authorized_official_title,
            head_authorized_official_phone,
        } = req.body;

        await withTransaction(async (transaction) => {
            await DoneeAccountService.headAuthInfoChange(
                userId,
                organizationId,
                {
                    head_authorized_official_name,
                    head_authorized_official_title,
                    head_authorized_official_phone,
                },
                transaction
            );

            const saspScope = (req.user?.scopes as (Scope & IUserCorperate)[] | undefined)?.find(
                (scope) => scope.type === ScopeType.SASP && scope.isActive === true
            );
            let auditStateId = saspScope?.stateId;
            if (auditStateId == null) {
                const donee = await DoneeAccount.findOne({
                    where: { organizationId },
                    attributes: ['stateId'],
                    transaction,
                });
                auditStateId = donee?.stateId;
            }
            if (auditStateId == null) {
                throw new AppError(500, 'Could not resolve state for SASP audit log');
            }

            await SaspAuditLog.create({
                state_id: auditStateId,
                activator: req.user?.id as string,
                activity: Activity.HEAD_AUTHORIZED_OFFICIAL_INFO_UPDATED,
                metadata: {
                    userId,
                    organizationId,
                    head_authorized_official_name,
                    head_authorized_official_title,
                    head_authorized_official_phone,
                },
            }, { transaction });

            sendSuccess(res, { success: true });
        });
    } catch (err) {
        sendError(req, res, err);
    }
}


export const organizationInvitations = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || parseInt(req.query.pageSize as string) || 10;
        const filterKey = req.query.filterKey as InvitationFilterKeys | undefined;
        const filterValue = req.query.filterValue as string | undefined;
        const operator = (req.query.operator as string) || 'contains';
        const sortBy = req.query.sortBy as string | undefined;
        const sortOrder = req.query.sortOrder as string | undefined;

        const result = await OrganizationService.getOrganizationInvitationsPaginated(
            organizationId,
            page,
            limit,
            filterKey,
            operator,
            filterValue,
            sortBy,
            sortOrder
        );
        sendSuccess(res, { invitations: result.items, totalItems: result.pagination.totalItems, pagination: result.pagination });
    } catch (err) {
        sendError(req, res, err);
    }
}


export const getDoneeAccountsWithUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { doneeAccountId } = req.params;
        const doneeAccountsWithUsers = await DoneeAccountService.getDoneeAccountWithUsers(Number(doneeAccountId));

        sendSuccess(res, { doneeAccountsWithUsers });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const deleteRoleForDoneeAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        const { doneeAccountId } = req.params;
        const { userId } = req.body;

        await withTransaction(async (transaction) => {
            const result = await DoneeAccountService.deleteRoleForDoneeAccount(Number(doneeAccountId), userId, transaction);
            sendSuccess(res, { success: result });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const assignRoleToDoneeAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        const { doneeAccountId } = req.params;
        const { userId, isPrimaryContact } = req.body;

        const result = await DoneeAccountService.assignRolesToDoneeAccount(Number(doneeAccountId), [{ userId, isPrimaryContact }]);
        sendSuccess(res, { success: result });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const createHaoRoleInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId, doneeAccountId } = req.params;
        const { email, name, title, phone, applicationId, invitedUserId } = req.body;
        const numericDoneeAccountId = Number(doneeAccountId);
        const numericApplicationId =
            applicationId != null ? Number(applicationId) : undefined;

        await withTransaction(async (transaction) => {
            let result: { invitationId: string };

            if (invitedUserId) {
                result = await HaoRoleInvitationService.createMemberInvitation(
                    {
                        organizationId,
                        doneeAccountId: numericDoneeAccountId,
                        applicationId: numericApplicationId,
                        invitedUserId: String(invitedUserId),
                        invitedByUserId: req.user!.id,
                    },
                    transaction,
                );
            } else {
                if (!email || !name) {
                    throw new AppError(400, 'Email and name are required');
                }

                result = await HaoRoleInvitationService.createInvitation(
                    {
                        organizationId,
                        doneeAccountId: numericDoneeAccountId,
                        applicationId: numericApplicationId,
                        email: String(email),
                        name: String(name),
                        title: title != null ? String(title) : undefined,
                        phone: phone != null ? String(phone) : undefined,
                        invitedByUserId: req.user!.id,
                    },
                    transaction,
                );
            }

            let application;
            if (numericApplicationId != null) {
                const markResult = await EligibilityService.markApplicationWaitingForHaoRoleInvitation(
                    numericApplicationId,
                    organizationId,
                    numericDoneeAccountId,
                    req.user!.id,
                    transaction,
                );
                application = markResult.application;
                if (markResult.statusBeforeInvitation) {
                    await HaoRoleInvitation.update(
                        { application_previous_status: markResult.statusBeforeInvitation },
                        { where: { id: result.invitationId }, transaction },
                    );
                }
            }

            await OrganizationUserService.invalidateUserScopeCaches([
                req.user!.id,
                invitedUserId ? String(invitedUserId) : undefined,
            ]);

            sendSuccess(res, { ...result, application });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const completeHaoSignature = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId, applicationId } = req.params;

        await withTransaction(async (transaction) => {
            const application = await EligibilityService.completeHaoSignature(
                Number(applicationId),
                organizationId,
                req.user!,
                transaction,
            );
            await ApplicationLog.create(
                {
                    application_id: Number(applicationId),
                    user_id: req.user?.id,
                    action: EligbilityActions.APPLICATION_SUBMITTED,
                    metadata: { pdf_path: application.pdf_path, status: application.status },
                },
                { transaction },
            );
            sendSuccess(res, { application });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};
