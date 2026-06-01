import UserScope from '@/authz/models/UserScope';
import Organization from '@/organization/models/Organization';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import { EligibilityApplicationFormStatuses, EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import { UserPermissionsEnum } from '@/enums/userPermissions.enum';
import { AppError } from '@/utils/response/appError';
import { addNotificationJob } from '../job/notification.job';
import { getLogger } from '@/utils/logger';
import DoneeAccount from '@/organization/models/DoneeAccount';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import Property from '@/properties/models/Property';
import { RequestService } from '@/properties/services/request';
import Request from '@/properties/models/Request';
import { Op } from 'sequelize';
import { INotificationPayloadMap } from '../interfaces/NotificationPayload.interface';
import Compliance from '@/compliance-utilization/models/Compliance.entity';
import LegacyPropertyData from '@/data-migration/models/LegacyPropertyData.model';
import Sba8aCertification from '@/organization/models/Sba8aCertification.entity';
import User from '@/authn/models/User';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import { TemplateEnum } from '@/enums/mailEnum';
import State from '@/states/models/State';
import { applicationUrl, invoiceUrl, loarUrl, propertyUrl, requestUrl, wantListUrl } from '@/notifications/utils/notificationUrls';
const logger = getLogger('NotifcationFactory');

// SASP has no Property Details page — for property-scoped notifications point at the parent
// request with the property highlighted. Null if request_id or stateId is missing.
const buildSaspPropertyUrl = (property: Property, stateId: number | undefined): string | null =>
    property.request_id && stateId
        ? requestUrl({ isSasp: true, stateId }, property.request_id, { section: 'properties', propertyId: property.property_id })
        : null;

export enum NotificationType {
    APPLICATION_SUBMITTED = 'ApplicationSubmitted',
    APPLICATION_REVIEWED = 'ApplicationReviewed',
    PROPERTY_REQUESTED_VIA_ICN = 'PropertyRequestedViaICN',
    PROPERTY_ADDED_TO_REQUEST = 'PropertyAddedToRequest',
    REQUEST_UPDATED = 'RequestUpdated',
    REQUEST_QUANTITY_UPDATED = 'RequestQuantityUpdated',
    TCN_UPDATED = 'TCNUpdated',
    COMMENT_ADDED = 'CommentAdded',
    ATTACHMENT_UPLOADED = 'AttachmentUploaded',
    LOAR_GENERATED = 'LOARGenerated',
    LOAR_SHIPPING_UPDATED = 'LOARShippingUpdated',
    PROPERTIES_ALLOCATED = 'PropertiesAllocated',
    PROPERTIES_DENIED = 'PropertiesDenied',
    PROPERTIES_CANCELED_SASP = 'PropertiesCanceledSASP',
    PROPERTIES_CANCELED_DONEE = 'PropertiesCanceledDonee',
    PROPERTIES_UN_CANCELED = 'PropertiesUnCanceled',
    PROPERTIES_PICKED_UP = 'PropertiesPickedUp',
    INVOICE_GENERATED = 'InvoiceGenerated',
    INVOICE_SIGNED = 'InvoiceSigned',
    INVOICE_CANCELED = 'InvoiceCanceled',
    INVOICE_PAYMENT_REQUESTED = 'InvoicePaymentRequested',
    INVOICE_PAID = 'InvoicePaid',
    COMPLIANCE_IN_SERVICE_WARNING = 'complianceInServiceWarning',
    COMPLIANCE_PERIOD_WARNING = 'compliancePeriodWarning',
    COMPLIANCE_OVERDUE = 'complianceOverDue',
    COMPLIANCE_EVIDENCE_SUBMITTED = 'complianceEvidenceSubmitted',
    COMPLIANCE_EVIDENCE_APPROVED = 'complianceEvidenceApproved',
    COMPLIANCE_EVIDENCE_REJECTED = 'complianceEvidenceRejected',
    ELIGIBILITY_ATTACHMENT_UPLOADED = 'eligibilityAttachmentUploaded',
    ELIGIBILITY_ATTACHMENT_REMOVED = 'eligibilityAttachmentRemoved',
    ELIGIBILITY_STATUS_CHANGED = 'eligibilityStatusChanged',
    ELIGIBILITY_EXPIRATION_WARNING = 'eligibilityExpirationWarning',
    ELIGIBILITY_EXPIRED = 'eligibilityExpired',
    LEGACY_PROPERTY_MIGRATION_REQUESTED = 'legacyPropertyMigrationRequested',
    EXPIRED_SCREENING_DATE = 'expiredScreeningDate',
    EXPIRED_SCREENING_DATE_TODAY = 'expiredScreeningDateToday',
    EXPIRED_SCREENING_DATE_THREE_DAYS_FROM_NOW = 'expiredScreeningDateThreeDaysFromNow',
    FEE_CHANGE_NOTIFICATION = 'feeChangeNotification',
    SBA8A_EXPIRATION_WARNING = 'sba8aExpirationWarning',
    SBA8A_EXPIRED = 'sba8aExpired',
    WANT_LIST_MATCH_FOUND = 'WantListMatchFound',
}

export type NotificationStoredPayload = {
    message: string;
    url?: string | null;
};

export default class NotificationFactory {
    private static async getEligibilityDoneeRecipients(application: Application): Promise<Array<{ user_id: string }>> {
        const recipients = await UserScope.findAll({ where: { donee_account_id: application.donee_account_id } });
        if (recipients.length > 0) return recipients;

        let createdBy = application.created_by;
        if (!createdBy && application.id) {
            const storedApplication = await Application.findByPk(application.id, { attributes: ['created_by'] });
            createdBy = storedApplication?.created_by;
        }

        return createdBy ? [{ user_id: createdBy }] : [];
    }

    /**
     * Generate and send a notification based on the type and payload.
     * @param type The type of notification.
     * @param payload The data required to generate the notification.
     */
    static async createNotification<T extends NotificationType>(type: T, payload: INotificationPayloadMap[T]) {
        switch (type) {
            case NotificationType.APPLICATION_SUBMITTED:
                return this.handleApplicationSubmitted(payload as INotificationPayloadMap[NotificationType.APPLICATION_SUBMITTED]);
            case NotificationType.PROPERTY_REQUESTED_VIA_ICN:
                return this.handlePropertyRequested(payload as INotificationPayloadMap[NotificationType.PROPERTY_REQUESTED_VIA_ICN]);
            case NotificationType.PROPERTY_ADDED_TO_REQUEST:
                return this.handlePropertyAdded(payload as INotificationPayloadMap[NotificationType.PROPERTY_ADDED_TO_REQUEST]);
            case NotificationType.REQUEST_UPDATED:
                return this.handleRequestUpdated(payload as INotificationPayloadMap[NotificationType.REQUEST_UPDATED]);
            case NotificationType.REQUEST_QUANTITY_UPDATED:
                return this.handleRequestQuantityUpdated(payload as INotificationPayloadMap[NotificationType.REQUEST_QUANTITY_UPDATED]);
            case NotificationType.TCN_UPDATED:
                return this.handleTCNUpdated(payload as INotificationPayloadMap[NotificationType.TCN_UPDATED]);
            case NotificationType.COMMENT_ADDED:
                return this.handleCommentAdded(payload as INotificationPayloadMap[NotificationType.COMMENT_ADDED]);
            case NotificationType.ATTACHMENT_UPLOADED:
                return this.handleAttachmentUploaded(payload as INotificationPayloadMap[NotificationType.ATTACHMENT_UPLOADED]);
            case NotificationType.LOAR_GENERATED:
                return this.handleLOARGenerated(payload as INotificationPayloadMap[NotificationType.LOAR_GENERATED]);
            case NotificationType.LOAR_SHIPPING_UPDATED:
                return this.handleLOARShippingUpdated(payload as INotificationPayloadMap[NotificationType.LOAR_SHIPPING_UPDATED]);
            case NotificationType.PROPERTIES_ALLOCATED:
                return this.handlePropertiesAllocated(payload as INotificationPayloadMap[NotificationType.PROPERTIES_ALLOCATED]);
            case NotificationType.PROPERTIES_DENIED:
                return this.handlePropertiesDenied(payload as INotificationPayloadMap[NotificationType.PROPERTIES_DENIED]);
            case NotificationType.PROPERTIES_CANCELED_SASP:
                return this.handlePropertiesCanceledSASP(payload as INotificationPayloadMap[NotificationType.PROPERTIES_CANCELED_SASP]);
            case NotificationType.PROPERTIES_CANCELED_DONEE:
                return this.handlePropertiesCanceledDonee(payload as INotificationPayloadMap[NotificationType.PROPERTIES_CANCELED_DONEE]);
            case NotificationType.PROPERTIES_UN_CANCELED:
                return this.handlePropertiesUnCanceled(payload as INotificationPayloadMap[NotificationType.PROPERTIES_UN_CANCELED]);
            case NotificationType.PROPERTIES_PICKED_UP:
                return this.handlePropertiesPickedUp(payload as INotificationPayloadMap[NotificationType.PROPERTIES_PICKED_UP]);
            case NotificationType.INVOICE_GENERATED:
                return this.handleInvoiceGenerated(payload as INotificationPayloadMap[NotificationType.INVOICE_GENERATED]);
            case NotificationType.INVOICE_SIGNED:
                return this.handleInvoiceSigned(payload as INotificationPayloadMap[NotificationType.INVOICE_SIGNED]);
            case NotificationType.INVOICE_CANCELED:
                return this.handleInvoiceCanceled(payload as INotificationPayloadMap[NotificationType.INVOICE_CANCELED]);
            case NotificationType.INVOICE_PAYMENT_REQUESTED:
                return this.handleInvoicePaymentRequested(payload as INotificationPayloadMap[NotificationType.INVOICE_PAYMENT_REQUESTED]);
            case NotificationType.INVOICE_PAID:
                return this.handleInvoicePaid(payload as INotificationPayloadMap[NotificationType.INVOICE_PAID]);
            case NotificationType.COMPLIANCE_IN_SERVICE_WARNING:
                return this.handleComplianceInServiceWarning(payload as INotificationPayloadMap[NotificationType.COMPLIANCE_IN_SERVICE_WARNING]);
            case NotificationType.COMPLIANCE_PERIOD_WARNING:
                return this.handleCompliancePeriodWarning(payload as INotificationPayloadMap[NotificationType.COMPLIANCE_PERIOD_WARNING]);
            case NotificationType.COMPLIANCE_OVERDUE:
                return this.handleComplianceOverdue(payload as INotificationPayloadMap[NotificationType.COMPLIANCE_OVERDUE]);
            case NotificationType.COMPLIANCE_EVIDENCE_SUBMITTED:
                return this.handleComplianceEvidenceSubmitted(payload as INotificationPayloadMap[NotificationType.COMPLIANCE_EVIDENCE_SUBMITTED]);
            case NotificationType.COMPLIANCE_EVIDENCE_APPROVED:
                return this.handleComplianceEvidenceApproved(payload as INotificationPayloadMap[NotificationType.COMPLIANCE_EVIDENCE_APPROVED]);
            case NotificationType.COMPLIANCE_EVIDENCE_REJECTED:
                return this.handleComplianceEvidenceRejected(payload as INotificationPayloadMap[NotificationType.COMPLIANCE_EVIDENCE_REJECTED]);
            case NotificationType.ELIGIBILITY_ATTACHMENT_UPLOADED:
                return this.handleEligibilityAttachmentUploaded(payload as INotificationPayloadMap[NotificationType.ELIGIBILITY_ATTACHMENT_UPLOADED]);
            case NotificationType.ELIGIBILITY_ATTACHMENT_REMOVED:
                return this.handleEligibilityAttachmentRemoved(payload as INotificationPayloadMap[NotificationType.ELIGIBILITY_ATTACHMENT_REMOVED]);
            case NotificationType.ELIGIBILITY_STATUS_CHANGED:
                return this.handleEligibilityStatusChanged(payload as INotificationPayloadMap[NotificationType.ELIGIBILITY_STATUS_CHANGED]);
            case NotificationType.ELIGIBILITY_EXPIRATION_WARNING:
                return this.handleEligibilityExpirationWarning(payload as INotificationPayloadMap[NotificationType.ELIGIBILITY_EXPIRATION_WARNING]);
            case NotificationType.ELIGIBILITY_EXPIRED:
                return this.handleEligibilityExpired(payload as INotificationPayloadMap[NotificationType.ELIGIBILITY_EXPIRED]);
            case NotificationType.LEGACY_PROPERTY_MIGRATION_REQUESTED:
                return this.handleLegacyPropertyMigrationRequest(payload as INotificationPayloadMap[NotificationType.LEGACY_PROPERTY_MIGRATION_REQUESTED]);
            case NotificationType.EXPIRED_SCREENING_DATE:
                return this.handleExpiredScreeningDate(payload as INotificationPayloadMap[NotificationType.EXPIRED_SCREENING_DATE]);
            case NotificationType.EXPIRED_SCREENING_DATE_TODAY:
                return this.handleExpiredScreeningDateToday(payload as INotificationPayloadMap[NotificationType.EXPIRED_SCREENING_DATE_TODAY]);
            case NotificationType.EXPIRED_SCREENING_DATE_THREE_DAYS_FROM_NOW:
                return this.handleExpiredScreeningDateThreeDaysFromNow(payload as INotificationPayloadMap[NotificationType.EXPIRED_SCREENING_DATE_THREE_DAYS_FROM_NOW]);
            case NotificationType.FEE_CHANGE_NOTIFICATION:
                return this.handleFeeChangeNotification(payload as INotificationPayloadMap[NotificationType.FEE_CHANGE_NOTIFICATION]);
            case NotificationType.SBA8A_EXPIRATION_WARNING:
                return this.handleSba8aExpirationWarning(payload as INotificationPayloadMap[NotificationType.SBA8A_EXPIRATION_WARNING]);
            case NotificationType.SBA8A_EXPIRED:
                return this.handleSba8aExpired(payload as INotificationPayloadMap[NotificationType.SBA8A_EXPIRED]);
            case NotificationType.WANT_LIST_MATCH_FOUND:
                return this.handleWantListMatchFound(payload as INotificationPayloadMap[NotificationType.WANT_LIST_MATCH_FOUND]);
            default:
                throw new Error(`Unsupported notification type: ${type}`);
        }
    }

    private static async handleApplicationSubmitted(payload: { application: Application }) {
        const application = await Application.findByPk(payload.application.id, {
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' }
            ]
        });

        if (!application) throw new AppError(404, 'Application not found');

        const organizationName = application.organization?.name || 'Unknown Organization';
        const stateName = application.state?.stateName || 'Unknown State';

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: payload.application.state_id, is_active: true },
                    required: true,
                },
                {
                    association: 'role',
                    required: true,
                    include: [
                        {
                            association: 'rolePermissions',
                            required: true,
                            include: [
                                {
                                    association: 'Permission',
                                    where: { identifier: UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS },
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const saspMessage = `New eligibility application ${payload.application.id} submitted by ${organizationName} in ${stateName}. Please review and make a decision.`;
        const saspEmailData = { application: payload.application, organization: organizationName, state: stateName, status: payload.application.status };

        const doneeRecipients = await this.getEligibilityDoneeRecipients(payload.application);

        const doneeMessage = `Your eligibility application ${payload.application.id} has been successfully submitted and is under review.`;
        const doneeEmailData = { application: payload.application, state: stateName, status: payload.application.status };

        const saspAppUrl = applicationUrl({ isSasp: true, stateId: payload.application.state_id }, payload.application.id);
        const doneeAppUrl = applicationUrl({ isSasp: false, organizationId: application.organization!.id }, payload.application.id);

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.APPLICATION_SUBMITTED, { message: saspMessage, url: saspAppUrl })
                    .catch(err => logger.error(`Notification failed for SASP user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            recipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Application_Submitted_Sasp, saspEmailData, `New Eligibility Application Submitted - ${organizationName}`)
                    .catch(err => logger.error(`Email failed for SASP user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            doneeRecipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.APPLICATION_SUBMITTED, { message: doneeMessage, url: doneeAppUrl })
                    .catch(err => logger.error(`Notification failed for Donee user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            doneeRecipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Application_Submitted_Donee, doneeEmailData, `Eligibility Application Submitted`)
                    .catch(err => logger.error(`Email failed for Donee user ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertyRequested(payload: { property: Property; doneeAccount: DoneeAccount }) {
        const { property, doneeAccount } = payload;
        const organization = await Organization.findByPk(doneeAccount.organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: doneeAccount.stateId, is_active: true },
                    required: true,
                },
                {
                    association: 'role',
                    required: true,
                    include: [
                        {
                            association: 'rolePermissions',
                            required: true,
                            include: [
                                {
                                    association: 'Permission',
                                    where: { identifier: UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS },
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const message = `${organization?.name} requested property with ICN #${property.property_control_number}.`;
        // SASP has no property page — point at the parent request.
        const url = property.request_id
            ? requestUrl({ isSasp: true, stateId: doneeAccount.stateId }, property.request_id, { section: 'properties', propertyId: property.property_id })
            : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTY_REQUESTED_VIA_ICN, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertyAdded(payload: { requestId: number, icn: string; doneeAccount: DoneeAccount }) {
        const organization = await Organization.findByPk(payload.doneeAccount.organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: payload.doneeAccount.stateId, is_active: true },
                    required: true,
                },
                {
                    association: 'role',
                    required: true,
                    include: [
                        {
                            association: 'rolePermissions',
                            required: true,
                            include: [
                                {
                                    association: 'Permission',
                                    where: { identifier: UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS },
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const message = `${organization?.name} added a property to request #${payload.requestId}.`;
        const url = requestUrl({ isSasp: true, stateId: payload.doneeAccount.stateId }, payload.requestId, { section: 'properties' });
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTY_ADDED_TO_REQUEST, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleRequestUpdated(payload: { property: Property; updatedBy: string }) {
        const request = await RequestService.getRequestById(payload.property.request_id, false);
        if (!request) throw new AppError(404, 'Request not found');
        let recipients;

        //if updatedBy sasp donee should get the notifications
        const isRequestorSasp = await SaspUser.findOne({ where: { userId: payload.updatedBy } });

        if (isRequestorSasp) {
            recipients = await UserScope.findAll({
                where: { donee_account_id: request.doneeAccount?.id },
            });
        } else {
            //TODO ADIR: IS ALL SASP GOING TO GET THIS NOTIFICATION ??????????????
            recipients = await UserScope.findAll({
                include: [
                    {
                        association: 'saspUser',
                        where: { stateId: request.doneeAccount?.stateId, is_active: true },
                        required: true,
                    },
                ],
            });
        }

        const message = `Request #${payload.property.request_id} has been updated.`;
        const saspUrl = requestUrl({ isSasp: true, stateId: request.doneeAccount!.stateId }, payload.property.request_id);
        const doneeUrl = requestUrl({ isSasp: false, organizationId: request.doneeAccount!.organization!.id }, payload.property.request_id);
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.REQUEST_UPDATED, {
                    message,
                    url: recipient.sasp_user_id ? saspUrl : doneeUrl,
                }).catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleRequestQuantityUpdated(payload: { property: Property; updatedBy: string; oldQuantity: number; newQuantity: number }) {
        const isRequestorSasp = await SaspUser.findOne({ where: { userId: payload.updatedBy } });
        if (isRequestorSasp) return;

        const request = await RequestService.getRequestById(payload.property.request_id, false);
        if (!request) throw new AppError(404, 'Request not found');

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: request.doneeAccount?.stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const organizationName = request.doneeAccount?.organization?.name || 'A donee';
        const propertyLabel = `Property ICN #${payload.property.property_control_number}`;
        const message = `${organizationName} changed the requested quantity for ${propertyLabel} on request #${payload.property.request_id} from ${payload.oldQuantity} to ${payload.newQuantity}.`;
        const emailData = {
            requestId: payload.property.request_id,
            organizationName,
            propertyLabel,
            oldQuantity: payload.oldQuantity,
            newQuantity: payload.newQuantity,
            tcn: request.tcn || 'N/A',
        };

        const saspReqUrl = requestUrl({ isSasp: true, stateId: request.doneeAccount!.stateId }, payload.property.request_id, { section: 'properties', propertyId: payload.property.property_id });
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.REQUEST_QUANTITY_UPDATED, { message, url: saspReqUrl })
                    .catch(err => logger.error(`Quantity update notification failed for ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            recipients.map(recipient =>
                this.sendEmailToUser(
                    recipient.user_id,
                    TemplateEnum.REQUEST_QUANTITY_UPDATED_SASP,
                    emailData,
                    `Requested Quantity Updated for Request #${payload.property.request_id}`
                ).catch(err => logger.error(`Quantity update email failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleTCNUpdated(payload: { requestId: number }) {
        const request = await RequestService.getRequestById(payload.requestId, false);
        const recipients = await UserScope.findAll({
            where: { donee_account_id: request.doneeAccount?.id },
        });

        const message = `SASP submitted request #${payload.requestId} to GSA with TCN ${request.tcn}.`;
        const doneeReqUrl = requestUrl({ isSasp: false, organizationId: request.doneeAccount!.organization!.id }, payload.requestId);
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.TCN_UPDATED, { message, url: doneeReqUrl })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleCommentAdded(payload: { requestId: number; userName: string }) {
        const request = await RequestService.getRequestById(payload.requestId, false);
        if (!request) throw new AppError(404, 'Request not found');

        const recipients = await UserScope.findAll({
            where: {
                [Op.or]: [
                    { donee_account_id: request.doneeAccount?.id },
                    {
                        '$saspUser.stateId$': request.doneeAccount?.stateId,
                        '$saspUser.is_active$': true,
                    },
                ],
            },
            include: [
                {
                    association: 'saspUser',
                    required: false,
                },
            ],
        });

        const message = `${payload.userName} commented on request #${payload.requestId}.`;
        const saspCommentUrl = requestUrl({ isSasp: true, stateId: request.doneeAccount!.stateId }, payload.requestId);
        const doneeCommentUrl = requestUrl({ isSasp: false, organizationId: request.doneeAccount!.organization!.id }, payload.requestId);
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.COMMENT_ADDED, {
                    message,
                    url: recipient.sasp_user_id ? saspCommentUrl : doneeCommentUrl,
                }).catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleAttachmentUploaded(payload: { request: Request, doneeAccount: DoneeAccount, userName: string }) {
        const { request, userName, doneeAccount } = payload
        const recipients = await UserScope.findAll({
            where: {
                [Op.or]: [
                    { donee_account_id: doneeAccount?.id },
                    {
                        '$saspUser.stateId$': doneeAccount?.stateId,
                        '$saspUser.is_active$': true,
                    },
                ],
            },
            include: [
                {
                    association: 'saspUser',
                    required: false,
                },
                {
                    association: 'role',
                    required: true,
                    include: [
                        {
                            association: 'rolePermissions',
                            required: true,
                            include: [
                                {
                                    association: 'Permission',
                                    where: { identifier: UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS },
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const message = `${userName} uploaded an attachment to request #${request.id}.`;
        const saspAttUrl = requestUrl({ isSasp: true, stateId: doneeAccount.stateId }, request.id, { section: 'attachments' });
        const doneeAttUrl = requestUrl({ isSasp: false, organizationId: doneeAccount.organizationId }, request.id, { section: 'attachments' });
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.ATTACHMENT_UPLOADED, {
                    message,
                    url: recipient.sasp_user_id ? saspAttUrl : doneeAttUrl,
                }).catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleLOARGenerated(payload: { request: Request }) {
        const recipients = await UserScope.findAll({
            where: { donee_account_id: payload.request.donee_account },
        });

        const da = await DoneeAccount.findByPk(payload.request.donee_account);
        const url = da?.organizationId ? loarUrl({ isSasp: false, organizationId: da.organizationId }, payload.request.id) : null;
        const message = `LOAR generated for request #${payload.request.id}. Review and prepare for pickup.`;
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.LOAR_GENERATED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleLOARShippingUpdated(payload: { requestId: number }) {
        const request = await RequestService.getRequestById(payload.requestId, false);
        if (!request) throw new AppError(404, 'Request not found');

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: request.doneeAccount?.stateId, is_active: true },
                    required: true,
                },
                {
                    association: 'role',
                    required: true,
                    include: [
                        {
                            association: 'rolePermissions',
                            required: true,
                            include: [
                                {
                                    association: 'Permission',
                                    where: { identifier: UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS },
                                    required: true,
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const message = `Shipping details updated for LOAR on request #${payload.requestId}.`;
        const url = request.doneeAccount?.stateId ? loarUrl({ isSasp: true, stateId: request.doneeAccount.stateId }, payload.requestId) : null;
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.LOAR_SHIPPING_UPDATED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertiesAllocated(payload: { request: Request; allocatedPropertyList: { property_name: string; ICN: string; allocated_quantity: number }[] }) {
        const propertyNames = payload.allocatedPropertyList.map(p => `${p.property_name} (ICN: ${p.ICN})`).join(', ');
        const message = `Properties have been allocated to your request #${payload.request.id}: ${propertyNames}`;
        const recipients = await UserScope.findAll({ where: { donee_account_id: payload.request.donee_account } });

        const da = await DoneeAccount.findByPk(payload.request.donee_account);
        const url = da?.organizationId ? requestUrl({ isSasp: false, organizationId: da.organizationId }, payload.request.id, { section: 'properties' }) : null;
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTIES_ALLOCATED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertiesDenied(payload: { requestId: number }) {
        const request = await RequestService.getRequestById(payload.requestId, true);
        if (!request) throw new AppError(404, 'Request not found');

        const recipients = await UserScope.findAll({ where: { donee_account_id: request.doneeAccount?.id } });
        const message = `Some properties in your request #${request.id} were denied by SASP.`;
        const url = request.doneeAccount?.organizationId ? requestUrl({ isSasp: false, organizationId: request.doneeAccount.organizationId }, payload.requestId, { section: 'properties' }) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTIES_DENIED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertiesCanceledSASP(payload: { requestId: number }) {
        const request = await RequestService.getRequestById(payload.requestId, true);
        if (!request) throw new AppError(404, 'Request not found');

        const organization = await Organization.findByPk(request.doneeAccount?.organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: request.doneeAccount?.stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const message = `Some properties in request #${payload.requestId} which was made by ${organization.name} were canceled.`;
        const url = request.doneeAccount?.stateId ? requestUrl({ isSasp: true, stateId: request.doneeAccount.stateId }, payload.requestId, { section: 'properties' }) : null;
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTIES_CANCELED_SASP, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertiesCanceledDonee(payload: { requestId: number }) {
        const request = await RequestService.getRequestById(payload.requestId, true);
        if (!request) throw new AppError(404, 'Request not found');

        const organization = await Organization.findByPk(request.doneeAccount?.organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const message = `Some properties in your request #${payload.requestId} were canceled by SASP.`;
        const recipients = await UserScope.findAll({ where: { donee_account_id: request.doneeAccount?.id } });
        const url = request.doneeAccount?.organizationId ? requestUrl({ isSasp: false, organizationId: request.doneeAccount.organizationId }, payload.requestId, { section: 'properties' }) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTIES_CANCELED_DONEE, { message, url })
                    .catch(err => logger.error(`Notification failed for Donee user ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertiesUnCanceled(payload: { requestId: number }) {
        const request = await RequestService.getRequestById(payload.requestId, true);
        if (!request) throw new AppError(404, 'Request not found');

        const organization = await Organization.findByPk(request.doneeAccount?.organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: request.doneeAccount?.stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const message = `Some properties in request #${payload.requestId} which was made by ${organization.name} were uncanceled.`;
        const url = request.doneeAccount?.stateId ? requestUrl({ isSasp: true, stateId: request.doneeAccount.stateId }, payload.requestId, { section: 'properties' }) : null;
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTIES_UN_CANCELED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handlePropertiesPickedUp(payload: { requestId: number }) {
        const request = await RequestService.getRequestById(payload.requestId, true);
        if (!request) throw new AppError(404, 'Request not found');

        const organization = await Organization.findByPk(request.doneeAccount?.organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId: request.doneeAccount?.stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const message = `${organization.name} marked properties as picked up for request #${payload.requestId}.`;
        const url = request.doneeAccount?.stateId ? requestUrl({ isSasp: true, stateId: request.doneeAccount.stateId }, payload.requestId, { section: 'properties' }) : null;
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.PROPERTIES_PICKED_UP, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleInvoiceGenerated(payload: { request: Request, updatedBy: string }) {
        let recipients;
        let message;
        let emailData;

        recipients = await UserScope.findAll({ where: { donee_account_id: payload.request.donee_account } });
        message = `Sasp uploaded the invoice for requestId:#${payload.request.id}. Waiting for your signature.`;
        emailData = {
            request: {
                id: payload.request.id,
                tcn: payload.request.tcn || 'N/A',
            },
            updatedBy: payload.updatedBy,
            requiresSignature: true,
        };

        const da = await DoneeAccount.findByPk(payload.request.donee_account);
        const url = da?.organizationId ? invoiceUrl({ isSasp: false, organizationId: da.organizationId }, payload.request.id) : null;
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.INVOICE_GENERATED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            recipients.map(recipient =>
                this.sendEmailToUser(
                    recipient.user_id,
                    TemplateEnum.INVOICE_GENERATED,
                    emailData,
                    `Invoice Uploaded for Request #${payload.request.id}`
                ).catch(err => logger.error(`handleInvoiceGenerated - Email failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleInvoiceSigned(payload: { request: Request }) {
        const recipients = await UserScope.findAll({ where: { donee_account_id: payload.request.doneeAccount?.id } });
        const message = `Invoice payment verified for request:#${payload.request.id}. It is now complete`;
        const url = payload.request.doneeAccount?.organizationId ? invoiceUrl({ isSasp: false, organizationId: payload.request.doneeAccount.organizationId }, payload.request.id) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.INVOICE_SIGNED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleInvoicePaymentRequested(payload: { request: Request }) {
        const recipients = await UserScope.findAll({ where: { donee_account_id: payload.request.doneeAccount?.id } });
        const message = `Invoice payment reported for request:#${payload.request.id}. Please review.`;
        const url = payload.request.doneeAccount?.organizationId ? invoiceUrl({ isSasp: false, organizationId: payload.request.doneeAccount.organizationId }, payload.request.id) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.INVOICE_PAYMENT_REQUESTED, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleInvoicePaid(payload: { request: Request }) {
        const recipients = await UserScope.findAll({ where: { donee_account_id: payload.request.doneeAccount?.id } });
        const message = `Invoice payment verified for request:#${payload.request.id}. It is now complete`;
        const url = payload.request.doneeAccount?.organizationId ? invoiceUrl({ isSasp: false, organizationId: payload.request.doneeAccount.organizationId }, payload.request.id) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.INVOICE_PAID, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleInvoiceCanceled(payload: { requestId: number; tcn?: string }) {
        const request = await RequestService.getRequestById(payload.requestId, true);
        if (!request) throw new AppError(404, 'Request not found');

        const message = `Request#${payload.requestId} with TCN ${payload.tcn || request.tcn || 'N/A'}: invoice is cancelled by SASP.`;
        const recipients = await UserScope.findAll({ where: { donee_account_id: request.doneeAccount?.id } });
        const url = request.doneeAccount?.organizationId ? invoiceUrl({ isSasp: false, organizationId: request.doneeAccount.organizationId }, payload.requestId) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.INVOICE_CANCELED, { message, url })
                    .catch(err => logger.error(`Notification failed for Donee user ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleComplianceInServiceWarning(payload: { property: Property }) {
        const doneeAccountId = payload.property.request?.donee_account;
        const recipients = await UserScope.findAll({ where: { donee_account_id: doneeAccountId } });
        const message = `Property with ICN #${payload.property.property_control_number} requires evidence to prove it is in service for compliance within 2 weeks.`;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.COMPLIANCE_IN_SERVICE_WARNING, { message })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleCompliancePeriodWarning(payload: { compliance: Compliance }) {
        const property = payload.compliance.property as Property;
        const doneeAccountId = payload.compliance.donee_account_id;
        const recipients = await UserScope.findAll({ where: { donee_account_id: doneeAccountId } });
        const message = `Property with ICN #${property.property_control_number} requires evidence to follow compliance within 2 weeks.`;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.COMPLIANCE_PERIOD_WARNING, { message })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleComplianceOverdue(payload: { property: Property }) {
        const stateId = payload.property.request?.doneeAccount?.stateId;
        const organizationName = payload.property.request?.doneeAccount?.organization?.name;
        const icn = payload.property.property_control_number;
        const message = `Compliance overdue: Organization "${organizationName}", ICN #${icn}. No evidence submitted.`;
        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.COMPLIANCE_OVERDUE, { message })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleComplianceEvidenceSubmitted(payload: { property: Property }) {
        const stateId = payload.property.request?.doneeAccount?.stateId;
        const organizationName = payload.property.request?.doneeAccount?.organization?.name;
        const icn = payload.property.property_control_number;
        const message = `Evidence submitted: Organization "${organizationName}", ICN #${icn}.`;
        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.COMPLIANCE_EVIDENCE_SUBMITTED, { message })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleComplianceEvidenceApproved(payload: { property: Property }) {
        const doneeAccountId = payload.property.request?.donee_account;
        const icn = payload.property.property_control_number;
        const message = `SASP has approved your compliance evidence for property ICN #${icn}.`;
        const recipients = await UserScope.findAll({ where: { donee_account_id: doneeAccountId } });

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.COMPLIANCE_EVIDENCE_APPROVED, { message })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleComplianceEvidenceRejected(payload: { property: Property }) {
        const doneeAccountId = payload.property.request?.donee_account;
        const icn = payload.property.property_control_number;
        const recipients = await UserScope.findAll({ where: { donee_account_id: doneeAccountId } });
        const message = `SASP has rejected your compliance evidence for property ICN #${icn}. Please review and provide evidence again.`;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.COMPLIANCE_EVIDENCE_REJECTED, { message })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleEligibilityAttachmentUploaded(payload: { application: Application; formId: number; fileName: string }) {
        const stateId = payload.application.state_id;
        const organizationName = payload.application.organization?.name || 'Unknown Organization';
        const stateName = payload.application.state?.stateName || 'Unknown State';

        // Notify SASP users in the application's state
        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const message = `Application #${payload.application.id} from ${organizationName}: Attachment "${payload.fileName}" uploaded to form #${payload.formId}.`;
        const emailData = {
            application: payload.application,
            organization: organizationName,
            state: stateName,
            fileName: payload.fileName,
            formId: payload.formId,
        };

        const url = applicationUrl({ isSasp: true, stateId }, payload.application.id, { formId: payload.formId });
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.ELIGIBILITY_ATTACHMENT_UPLOADED, { message, url })
                    .catch(err => logger.error(`Notification failed for SASP user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            recipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Document_Uploaded, emailData, `Eligibility Application Document Uploaded - ${organizationName}`)
                    .catch(err => logger.error(`Email failed for SASP user ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleEligibilityAttachmentRemoved(payload: { application: Application; formId: number }) {
        const stateId = payload.application.state_id;
        const organizationName = payload.application.organization?.name || 'Unknown Organization';
        const stateName = payload.application.state?.stateName || 'Unknown State';

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const message = `Application #${payload.application.id} from ${organizationName}: Attachment removed from form #${payload.formId}.`;
        const emailData = {
            application: payload.application,
            organization: organizationName,
            state: stateName,
            formId: payload.formId,
        };

        const url = applicationUrl({ isSasp: true, stateId }, payload.application.id, { formId: payload.formId });
        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.ELIGIBILITY_ATTACHMENT_REMOVED, { message, url })
                    .catch(err => logger.error(`Notification failed for SASP user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            recipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Document_Removed, emailData, `Eligibility Application Document Removed - ${organizationName}`)
                    .catch(err => logger.error(`Email failed for SASP user ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleEligibilityStatusChanged(payload: { application: Application; oldStatus: string; newStatus: string }) {
        const stateId = payload.application.state_id;

        const application = await Application.findByPk(payload.application.id, {
            include: [
                { model: Organization, as: 'organization' },
                { model: State, as: 'state' },
                { model: ApplicationForm, as: 'applicationForms' }
            ]
        });

        const organizationName = application?.organization?.name || 'Unknown Organization';
        const stateName = application?.state?.stateName || 'Unknown State';

        // Get rejection/denial reason based on status
        let reason = null;
        const rejectedStatuses = [
            EligibilityApplicationStatuses.REJECTED,
            EligibilityApplicationStatuses.APPLICATION_RENEWAL_REJECTED,
            EligibilityApplicationStatuses.FORM_RENEWAL_REJECTED,
            EligibilityApplicationStatuses.CHANGES_RETURNED,
        ];

        if (payload.newStatus === EligibilityApplicationStatuses.DENIED) {
            // For denied applications, use deny_reason from Application
            reason = application?.deny_reason || null;
        } else if (rejectedStatuses.map(s => s as string).includes(payload.newStatus)) {
            // For rejected applications, get rejectedReason from the rejected form(s)
            const rejectedForms = application?.applicationForms?.filter(form =>
                (
                    form.status === EligibilityApplicationFormStatuses.REJECTED ||
                    form.status === EligibilityApplicationFormStatuses.EDITS_RETURNED
                ) && form.rejectedReason
            );
            if (rejectedForms && rejectedForms.length > 0) {
                // Combine all rejection reasons if multiple forms were rejected
                reason = rejectedForms.map(form => form.rejectedReason).join('\n\n');
            }
        }

        // SDN-1295: display labels only for in-app message text. Underlying status values unchanged.
        const STATUS_DISPLAY_LABELS: Record<string, string> = {
            'Rejected': 'Returned',
            'Application Renewal Rejected': 'Application Renewal Returned',
            'Form Renewal Rejected': 'Form Renewal Returned',
            'Changes Returned': 'Changes Returned',
            'Denied': 'Not Eligible',
        };
        const displayOldStatus = STATUS_DISPLAY_LABELS[payload.oldStatus] ?? payload.oldStatus;
        const displayNewStatus = STATUS_DISPLAY_LABELS[payload.newStatus] ?? payload.newStatus;

        const doneeMessage = `Application ${payload.application.id} status changed from ${displayOldStatus} to ${displayNewStatus}.`;
        const doneeEmailData = { application: payload.application, state: stateName, oldStatus: payload.oldStatus, newStatus: payload.newStatus, denyReason: reason };

        const saspMessage = `Application ${payload.application.id} from ${organizationName} status changed from ${displayOldStatus} to ${displayNewStatus}.`;
        const saspEmailData = { application: payload.application, organization: organizationName, state: stateName, oldStatus: payload.oldStatus, newStatus: payload.newStatus, denyReason: reason };

        const doneeRecipients = await this.getEligibilityDoneeRecipients(application ?? payload.application);
        const saspRecipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const saspAppUrl = applicationUrl({ isSasp: true, stateId }, payload.application.id);
        const doneeAppUrl = application?.organization?.id ? applicationUrl({ isSasp: false, organizationId: application.organization.id }, payload.application.id) : null;

        await Promise.all(
            doneeRecipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.ELIGIBILITY_STATUS_CHANGED, { message: doneeMessage, url: doneeAppUrl })
                    .catch(err => logger.error(`Notification failed for Donee user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            saspRecipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.ELIGIBILITY_STATUS_CHANGED, { message: saspMessage, url: saspAppUrl })
                    .catch(err => logger.error(`Notification failed for SASP user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            doneeRecipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Status_Changed_Donee, doneeEmailData, `Eligibility Application Status Changed`)
                    .catch(err => logger.error(`Email failed for Donee user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            saspRecipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Status_Changed_Sasp, saspEmailData, `Eligibility Application Status Changed - ${organizationName}`)
                    .catch(err => logger.error(`Email failed for SASP user ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleEligibilityExpirationWarning(payload: { application: Application; daysUntilExpiry: number }) {
        const application = await Application.findByPk(payload.application.id, {
            include: [{ model: State, as: 'state' }]
        });

        const stateName = application?.state?.stateName || 'Unknown State';
        const recipients = await this.getEligibilityDoneeRecipients(application ?? payload.application);
        const message = `Your eligibility application ${payload.application.id} will expire in ${payload.daysUntilExpiry} days. Please renew if necessary.`;
        const emailData = { application: payload.application, state: stateName, daysUntilExpiry: payload.daysUntilExpiry };
        const orgId = (payload.application as Application & { organization_id?: string }).organization_id;
        const url = orgId ? applicationUrl({ isSasp: false, organizationId: orgId }, payload.application.id) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.ELIGIBILITY_EXPIRATION_WARNING, { message, url })
                    .catch(err => logger.error(`Notification failed for Donee user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            recipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Expiration_Warning_Donee, emailData, `Eligibility Application Expiration Warning`)
                    .catch(err => logger.error(`Email failed for Donee user ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleEligibilityExpired(payload: { application: Application }) {
        const application = await Application.findByPk(payload.application.id, {
            include: [
                { model: State, as: 'state' },
                { model: Organization, as: 'organization' }
            ]
        });

        const stateId = payload.application.state_id;
        const stateName = application?.state?.stateName || 'Unknown State';
        const organizationName = application?.organization?.name || 'Unknown Organization';
        const saspMessage = `Application ${payload.application.id} from ${organizationName} has expired.`;
        const saspEmailData = { application: payload.application, organization: organizationName, state: stateName };

        const saspRecipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        const expiredUrl = applicationUrl({ isSasp: true, stateId }, payload.application.id);
        await Promise.all(
            saspRecipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.ELIGIBILITY_EXPIRED, { message: saspMessage, url: expiredUrl })
                    .catch(err => logger.error(`Notification failed for SASP user ${recipient.user_id}`, err))
            )
        );

        await Promise.all(
            saspRecipients.map(recipient =>
                this.sendEmailToUser(recipient.user_id, TemplateEnum.Eligibility_Expired_Sasp, saspEmailData, `Eligibility Application Expired - ${organizationName}`)
                    .catch(err => logger.error(`Email failed for SASP user ${recipient.user_id}`, err))
            )
        );
    }

    // Add missing handler for migration requested notification
    private static async handleLegacyPropertyMigrationRequest(payload: { legacyProperty: LegacyPropertyData, doneeAccount: DoneeAccount }) {
        const stateId = payload.legacyProperty.stateId;
        const organization = await Organization.findByPk(payload.doneeAccount.organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const message = `Legacy Property Migration requested ICN:"${payload.legacyProperty.property_control_number}", ID: ${payload.legacyProperty.id} by ${organization.name}`;
        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.LEGACY_PROPERTY_MIGRATION_REQUESTED, { message })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleExpiredScreeningDate(payload: { property: Property }) {
        const stateId = payload.property.request?.doneeAccount?.stateId;
        const message = `The screening date for property ${payload.property.property_control_number} has expired`;
        const url = buildSaspPropertyUrl(payload.property, stateId);
        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.EXPIRED_SCREENING_DATE, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleExpiredScreeningDateToday(payload: { property: Property }) {
        const stateId = payload.property.request?.doneeAccount?.stateId;
        const message = `The screening date for property ${payload.property.property_control_number} is today`;
        const url = buildSaspPropertyUrl(payload.property, stateId);
        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.EXPIRED_SCREENING_DATE_TODAY, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleExpiredScreeningDateThreeDaysFromNow(payload: { property: Property }) {
        const stateId = payload.property.request?.doneeAccount?.stateId;
        const message = `The screening date for property ${payload.property.property_control_number} is going to expire in 3 days`;
        const url = buildSaspPropertyUrl(payload.property, stateId);
        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'saspUser',
                    where: { stateId, is_active: true },
                    required: true,
                },
            ],
        });

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.EXPIRED_SCREENING_DATE_THREE_DAYS_FROM_NOW, { message, url })
                    .catch(err => logger.error(`Notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    private static async handleFeeChangeNotification(payload: { stateId: number; effectiveDate: string; fees: Array<{ disposalConditionCode: string; disposalConditionName: string; fee: number }> }) {
        const effectiveDate = new Date(payload.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const feeSummary = payload.fees.map(fee => `${fee.disposalConditionName}: ${fee.fee.toFixed(2)}%`).join(', ');
        const message = `Fees will be updated on ${effectiveDate}. New fees: ${feeSummary}`;

        const recipients = await UserScope.findAll({
            include: [
                {
                    association: 'doneeAccount',
                    required: true,
                    where: { stateId: payload.stateId, isActive: true },
                },
            ],
        });

        // Deduplicate by user_id to avoid sending multiple notifications to the same user 
        const uniqueUserIds = Array.from(new Set(recipients.map(r => r.user_id)));
        await Promise.all(
            uniqueUserIds.map(userId =>
                this.send(userId, NotificationType.FEE_CHANGE_NOTIFICATION, { message })
                    .catch(err => logger.error(`Notification failed for ${userId}`, err))
            )
        );
    }

    private static async handleSba8aExpirationWarning(payload: { certification: Sba8aCertification; daysUntilExpiry: number }) {
        const doneeAccount = payload.certification.doneeAccount;
        if (!doneeAccount) {
            logger.warn(`No donee account found for SBA 8(a) certification ${payload.certification.id}`);
            return;
        }

        const organization = await Organization.findByPk(doneeAccount.organizationId);
        const recipients = await UserScope.findAll({ where: { donee_account_id: doneeAccount.id } });
        const expirationDate = new Date(payload.certification.expiration_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', });

        const message =
            `Your SBA 8(a) certification for ${organization?.name || 'your organization'} will expire in ${payload.daysUntilExpiry} days (${expirationDate}). 
             After expiration, your organization will no longer be eligible for SASP participation.`;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.SBA8A_EXPIRATION_WARNING, { message })
                    .catch(err => logger.error(`SBA 8(a) warning notification failed for ${recipient.user_id}`, err))
            )
        );

        logger.info(`Sent SBA 8(a) ${payload.daysUntilExpiry}-day warning to ${recipients.length} users for org ${organization?.name}`);
    }

    private static async handleSba8aExpired(payload: { certification: Sba8aCertification }) {
        const doneeAccount = payload.certification.doneeAccount;
        if (!doneeAccount) {
            logger.warn(`No donee account found for SBA 8(a) certification ${payload.certification.id}`);
            return;
        }

        const organization = await Organization.findByPk(doneeAccount.organizationId);
        const recipients = await UserScope.findAll({ where: { donee_account_id: doneeAccount.id } });

        const message =
            `Your SBA 8(a) certification for ${organization?.name || 'your organization'} has expired.
             Your organization's status has been updated to "Expired – SBA(8)a Term Limit Reached" and is no longer eligible for SASP participation.`;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.SBA8A_EXPIRED, { message })
                    .catch(err => logger.error(`SBA 8(a) expiration notification failed for ${recipient.user_id}`, err))
            )
        );

        logger.info(`Sent SBA 8(a) expiration notification to ${recipients.length} users for org ${organization?.name}`);
    }

    private static async handleWantListMatchFound(payload: { matchIds: number[]; doneeAccountId: number; keyword: string }) {
        if (!payload.matchIds.length) return;

        const recipients = await UserScope.findAll({ where: { donee_account_id: payload.doneeAccountId } });
        const count = payload.matchIds.length;
        const message = count === 1
            ? `New want-list match found for keyword "${payload.keyword}".`
            : `${count} new want-list matches found for keyword "${payload.keyword}".`;
        const da = await DoneeAccount.findByPk(payload.doneeAccountId);
        const url = da?.organizationId ? wantListUrl(da.organizationId) : null;

        await Promise.all(
            recipients.map(recipient =>
                this.send(recipient.user_id, NotificationType.WANT_LIST_MATCH_FOUND, { message, url })
                    .catch(err => logger.error(`Want-list match notification failed for ${recipient.user_id}`, err))
            )
        );
    }

    /**
    * Generic function to send email to a single user
    * @param userId The user ID to send email to
    * @param templateName The email template name
    * @param data Template data for rendering
    * @param subject The email subject
    */
    private static async sendEmailToUser(userId: string, templateName: string, data: Record<string, any>, subject: string): Promise<void> {
        const user = await User.findByPk(userId);
        if (!user?.email) return;

        const renderData = { templateName, data: { name: user.name || 'User', ...data } };
        const mailContent = await renderEmail(renderData);
        const mailData = { to: user.email as string, subject, html: mailContent as string };
        await emailQueue.add('eligibilityNotification', mailData, { removeOnComplete: true, attempts: 3 });
    }

    /**
    * Queue a new notification for asynchronous processing
    * @param userId the recipient user ID
    * @param type a string identifier for the notification type
    * @param payload custom data for the notification
    */
    private static async send(userId: string, type: string, payload: NotificationStoredPayload) {
        return addNotificationJob(type, { userId, type, payload });
    }
}
