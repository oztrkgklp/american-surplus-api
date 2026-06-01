import { Router } from "express";
import {
    create,
    getUserOrganizations,
    getOrganization,
    verifyAccess,
    createApplication,
    uploadApplicationAttachment,
    updateFormData,
    getApplicationForm,
    submitApplication,
    listApplications,
    downloadAttachment,
    getApplicationsForReview,
    reviewForm,
    requestApplicationEdits,
    submitApplicationEdits,
    fetchAvailableStates,
    fetchAllForms,
    deleteApplicationAttachment,
    approveApplication,
    getApplicationsGroupedByStatus,
    getApplicationHistory,
    downloadApplicationLogPdf,
    inviteUser,
    respondInvitation,
    changePrimaryContact,
    changeHeadAuthorizedOfficial,
    headAuthinfoChange,
    primaryContactinfoChange,
    organizationInvitations,
    getDoneeAccountsWithUsers,
    deleteRoleForDoneeAccount,
    assignRoleToDoneeAccount,
    updateOrganizationInfo,
    updateOrganizationInfoBySasp,
    cancelInvitation,
    resendInvitation,
    generateEligibilityApplicationPDF,
    signEligibilityApplication,
    downloadEligibilityApplicationPDF,
    deleteApplication,
    denyApplication,
    beginReview,
    getApplicationById,
    createHaoRoleInvitation,
    completeHaoSignature,
} from '@/orchestration/controllers/organization';
import { authenticate } from "@/orchestration/middleware/authenticate";
import { getDoneeAccounts } from "../controllers/donee";
import { authorizeOrganizationSASPAccess } from "../middleware/SASP/authorizeOrganizationAccess.sasp";
import { authorizeOrganizationDoneeAccess } from "../middleware/Donee/authorizeOrganizationAccess.donee";
import { UserPermissionsEnum } from "@/enums/userPermissions.enum";
import { upload, validateFileUpload } from '@/orchestration/middleware/upload';
import { activation, assignRoleToOrganizationUser, getOrganizationUser, getOrganizationUsers } from "../controllers/organizationUser";

const router = Router();

router.post('/create', authenticate, create);

router.patch(
    '/:organizationId/organization-info',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_INFO], { isOnlyDonee: true }),
    updateOrganizationInfo
);

router.patch(
    '/:organizationId/organization-info/sasp',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS], { isOnlySasp: true }),
    updateOrganizationInfoBySasp
);

router.get(
    '/user',
    authenticate,
    getUserOrganizations
);

router.get(
    '/:organizationId/organization-users',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess(),
    getOrganizationUsers
);

router.get(
    '/:organizationId/organization-user',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess(),
    getOrganizationUser
);

router.get(
    '/:organizationId',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess(),
    getOrganization
);

router.get('/:organizationId/verify-access', authenticate, verifyAccess);

router.get(
    '/:organizationId/donee-accounts',
    authenticate,
    authorizeOrganizationDoneeAccess([], { isOnlyDonee: true }),
    getDoneeAccounts
);

//----- eligibility applications releated endpoints -------

router.post(
    '/:organizationId/applications/create',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT], { isOnlyDonee: true }),
    createApplication
);

router.delete(
    '/:organizationId/applications/:applicationId',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT], { isOnlyDonee: true }),
    deleteApplication
);

router.post(
    '/:organizationId/applications/:applicationId/deny',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS], { isOnlySasp: true }),
    denyApplication
);

router.post(
    '/:organizationId/applications/:applicationId/begin-review',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS], { isOnlySasp: true }),
    beginReview
);

router.get(
    '/fetch/applications-form',
    authenticate,
    fetchAllForms
);

router.get(
    '/fetch/available-states',
    authenticate,
    fetchAvailableStates
);

router.post(
    '/:organizationId/applications/:applicationId/forms/:formId/attachments',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    upload.single('file'),
    validateFileUpload,
    uploadApplicationAttachment
);

router.delete(
    '/:organizationId/applications/:applicationId/forms/:formId/attachments/:attachmentId',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    deleteApplicationAttachment
);


router.put(
    '/:organizationId/applications/:applicationId/forms/:formId',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    updateFormData
);

router.get(
    '/:organizationId/applications/:applicationId/forms/:formId',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    getApplicationForm
);

router.post(
    '/:organizationId/applications/:applicationId/generate-pdf',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    generateEligibilityApplicationPDF
);

router.post(
    '/:organizationId/applications/:applicationId/sign-pdf',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    signEligibilityApplication
);

router.put(
    '/:organizationId/applications/:applicationId/submit',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT], { isOnlyDonee: true }),
    submitApplication
);

router.get(
    '/:organizationId/applications',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess(
        [UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT],
        { permissionDeniedMessage: 'You do not have permission to view applications for this organization.' }
    ),
    listApplications
);

router.get(
    '/:organizationId/application_attachments/:id',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    downloadAttachment
);

router.get(
    '/:organizationId/applications/:applicationId/pdf',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    downloadEligibilityApplicationPDF
);

router.get(
    '/applications/sasp',
    authenticate,
    getApplicationsForReview
);

router.get(
    '/applications/:applicationId',
    authenticate,
    getApplicationById
);

router.get(
    '/applications/:applicationId/history',
    authenticate,
    getApplicationHistory
);

router.get(
    '/applications/:applicationId/history/:logId/pdf',
    authenticate,
    downloadApplicationLogPdf
);

router.get(
    '/applications/sasp/counts',
    authenticate,
    getApplicationsGroupedByStatus
);

router.post(
    '/:organizationId/applications/:applicationId/request-edits',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    requestApplicationEdits
);

router.put(
    '/:organizationId/applications/:applicationId/change-request/submit',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    submitApplicationEdits
);

router.post(
    '/:organizationId/applications/:applicationId/forms/:formId/review',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    reviewForm
);

router.post(
    '/:organizationId/applications/:applicationId/review',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS], { isOnlySasp: true }),
    approveApplication
);



// ------------------------- Organization Management ----------------------------------

router.post(
    '/:organizationId/users/invite',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    inviteUser
);

router.post(
    '/:organizationId/users/cancel-invitation',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    cancelInvitation
);

router.post(
    '/:organizationId/users/resend-invitation',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    resendInvitation
);

router.post(
    '/:organizationId/users/respond-invitation',
    authenticate,
    respondInvitation
);

router.patch(
    '/:organizationId/users/activation',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    activation
);

router.patch(
    '/:organizationId/users/organization-role',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    assignRoleToOrganizationUser
);

router.patch(
    '/:organizationId/donee-accounts/:doneeAccountId/primary-contact',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    changePrimaryContact
);

router.patch(
    '/:organizationId/donee-accounts/:doneeAccountId/change-head-authorized-official',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    changeHeadAuthorizedOfficial
);

router.post(
    '/:organizationId/donee-accounts/:doneeAccountId/hao-role-invitations',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    createHaoRoleInvitation
);

router.post(
    '/:organizationId/applications/:applicationId/complete-hao-signature',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_DONEE_ACCOUNT]),
    completeHaoSignature
);

router.patch(
    '/:organizationId/donee-accounts/:doneeAccountId/users/:userId/primary-contact-info-change',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_INFO], { isOnlyDonee: true }),
    primaryContactinfoChange
);

router.patch(
    '/:organizationId/donee-accounts/:doneeAccountId/users/:userId/primary-contact-info-change/sasp',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS], { isOnlySasp: true }),
    primaryContactinfoChange
);

router.patch(
    '/:organizationId/users/:userId/head-auth-info-change',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_APPROVE_ORGANIZATIONS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_INFO]),
    headAuthinfoChange
);

router.get(
    '/:organizationId/users/invitations',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    organizationInvitations
);

router.get(
    '/:organizationId/donee-account/:doneeAccountId/donee-users',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    getDoneeAccountsWithUsers
);

router.patch(
    '/:organizationId/donee-accounts/:doneeAccountId/remove-role',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    deleteRoleForDoneeAccount
);

router.patch(
    '/:organizationId/donee-accounts/:doneeAccountId/assign-role',
    authenticate,
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.MANAGE_ORGANIZATION_USERS]),
    assignRoleToDoneeAccount
);

export default router;