import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorizeSASPManagement } from "../middleware/SASP/authorizeSaspManagement.sasp";
import { UserPermissionsEnum } from "@/enums/userPermissions.enum";
import { activation, assignRoleToUser, cancelInvitation, changeDoneeAccountActivation, getDoneeAccounts, getDoneeAccount, getStateDetails, getStateDisposalFees, getUser, getUsers, inviteUser, listAllInvitations, resendInvitation, respondInvitation, updateStateDetails, updateStateDisposalFees, updateUserDetails } from "../controllers/sasp.controller";
import { authorizeDoneeAccountManagement } from "../middleware/SASP/authorizeDoneeAccountManagement.sasp";
const router = Router();

router.get(
    '/:stateId/sasp-users',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    getUsers
);

router.get(
    '/:stateId/sasp-user',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    getUser
);

router.post(
    '/:stateId/users/invite',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    inviteUser
);

router.post(
    '/:stateId/users/cancel-invitation',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    cancelInvitation
);

router.post(
    '/:stateId/users/resend-invitation',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    resendInvitation
);

router.post(
    '/:stateId/users/respond-invitation',
    authenticate,
    respondInvitation
);

router.patch(
    '/:stateId/users/activation',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    activation
);

router.patch(
    '/:stateId/users/sasp-role',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    assignRoleToUser
);

router.patch(
    '/:stateId/users/details',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    updateUserDetails
);

router.get(
    '/:stateId/users/invitations',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    listAllInvitations
);

router.get(
    '/:stateId/donee-accounts',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_VIEW_ALL_DONEE_ACCOUNTS]),
    getDoneeAccounts
);

router.get(
    '/:stateId/donee-accounts/:organizationId',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SASP_USERS]),
    getDoneeAccount
);

router.patch(
    '/:stateId/donee-account/:doneeAccountId/activation',
    authenticate,
    authorizeDoneeAccountManagement([UserPermissionsEnum.SASP_VIEW_ALL_DONEE_ACCOUNTS]),
    changeDoneeAccountActivation
);

router.get(
    '/:stateId/settings/state',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SETTINGS]),
    getStateDetails
);

router.patch(
    '/:stateId/settings/state',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SETTINGS]),
    updateStateDetails
);

router.get(
    '/:stateId/settings/state-fees',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SETTINGS]),
    getStateDisposalFees
);

router.patch(
    '/:stateId/settings/state-fees',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_SETTINGS]),
    updateStateDisposalFees
);

export default router;





