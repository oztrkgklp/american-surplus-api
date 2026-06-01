import { Router } from 'express';
import { getPropertySummaries, getPropertyByICN, getPropertyImage } from '@/orchestration/controllers/ppms';
import { createDoneePropertyManual,
    createDoneePropertyWithICN,
    getAllPropertiesByOrganizationId,
    getAllPropertiesByStateId,
    getAllPropertyCountsByOrganizationId,
    getAllPropertyCountsByStateId,
    getDoneePropertyById,
    getStateFeesForDoneeAccount,
    updateDoneeProperty,
    uploadEvidence,
    evidenceApproval,
    getPropertyWithCompliance,
    getAllCompliancesForDonee,
    getAllCompliancesForState,
    downloadComplianceAttachment,
    getPropertiesHavingExpiredScreeningDates,
    getPropertiesHavingScreeningDatesExpiredToday,
    getPropertiesHavingScreeningDatesExpiredThreeDaysFromNow,
} from '@/orchestration/controllers/property';
import { updatePropertyQuantityJustificationByPropertyId } from '@/orchestration/controllers/request';
import { PropertyElasticsearchController } from '@/ppms/controllers/propertyElasticsearch.controller';
import { authenticate } from '@/orchestration/middleware/authenticate';
import { authorizePropertySASPAccess } from '../middleware/SASP/authorizePropertyAccess.sasp';
import { authorizePropertyDoneeAccess } from '../middleware/Donee/authorizePropertyAccess.donee';
import { UserPermissionsEnum } from '@/enums/userPermissions.enum';
import { authorizeDoneeOnRequestAccess } from '../middleware/Donee/authorizeDoneeOnRequest.donee';
import { authorizeActiveDoneeAccount } from '../middleware/Donee/authorizeActiveDoneeAccount.donee';
import { authorizeRequestSASPAccess } from '../middleware/SASP/authorizeRequestAccess.sasp';
import { authorizeOrganizationDoneeAccess } from '../middleware/Donee/authorizeOrganizationAccess.donee';
import { authorizeOrganizationSASPAccess } from '../middleware/SASP/authorizeOrganizationAccess.sasp';
import { upload, validateFileUpload } from '../middleware/upload';
import { authorizeSASPManagement } from '../middleware/SASP/authorizeSaspManagement.sasp';

const router = Router();

router.get(
    '/property-requests/organizations/:organizationId',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.VIEW_ORGANIZATION_REQUESTS]),
    getAllPropertiesByOrganizationId
);

router.get(
    '/property-requests/sasp/:stateId',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS], { isOnlySasp: true, isAllRequest: true }),
    getAllPropertiesByStateId
);

router.get(
    '/property-requests/organizations/:organizationId/counts',
    authenticate,
    authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    authorizeOrganizationDoneeAccess([UserPermissionsEnum.VIEW_ORGANIZATION_REQUESTS]),
    getAllPropertyCountsByOrganizationId
);

router.get(
    '/property-requests/sasp/:stateId/counts',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS], { isOnlySasp: true, isAllRequest: true }),
    getAllPropertyCountsByStateId
);

router.get(
    '/:propertyId',
    authenticate,
    authorizePropertySASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    authorizePropertyDoneeAccess(),
    getDoneePropertyById
);

router.put(
    '/:propertyId',
    authenticate,
    authorizePropertySASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizePropertyDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    updateDoneeProperty
);

router.put(
    '/:propertyId/update-quantity-justification',
    authenticate,
    authorizePropertySASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizePropertyDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    updatePropertyQuantityJustificationByPropertyId
);

router.post(
    '/',
    authenticate,
    authorizeDoneeOnRequestAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    createDoneePropertyManual
);

router.post(
    '/icn',
    authenticate,
    authorizeDoneeOnRequestAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    createDoneePropertyWithICN
);

router.get(
    '/listing/list',
    authenticate,
    authorizeActiveDoneeAccount(),
    getPropertySummaries
);

router.get(
    '/listing/:icn',
    authenticate,
    authorizeActiveDoneeAccount(),
    getPropertyByICN
);

router.get(
    '/listing/:icn/images/:imageName',
    authenticate,
    authorizeActiveDoneeAccount(),
    getPropertyImage
);

router.get(
    '/:doneeAccountId/fees',
    authenticate,
    authorizeActiveDoneeAccount(),
    getStateFeesForDoneeAccount
);

// ------------------ EXPIRED SCREENING DATES ----------------------------

router.get(
    '/sasp/:stateId/expired-screening-dates',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    getPropertiesHavingExpiredScreeningDates
);

router.get(
    '/sasp/:stateId/expired-screening-dates/today',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    getPropertiesHavingScreeningDatesExpiredToday
);

router.get(
    '/sasp/:stateId/expired-screening-dates/three-days-from-now',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    getPropertiesHavingScreeningDatesExpiredThreeDaysFromNow
);

// ------------------ COMPLIANCE ----------------------------

router.post(
    '/:propertyId/compliances/upload-evidence',
    authenticate,
    authorizePropertyDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    upload.single('file'),
    validateFileUpload,
    uploadEvidence
);

router.post(
    '/:propertyId/compliances/evidence-approval',
    authenticate,
    authorizePropertySASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    evidenceApproval
);

router.get(
    '/:propertyId/compliances',
    authenticate,
    authorizePropertySASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizePropertyDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    getPropertyWithCompliance
);

router.get(
    '/:doneeAccountId/donee-compliances',
    authenticate,
    authorizeActiveDoneeAccount(),
    getAllCompliancesForDonee
);

router.get(
    '/:stateId/all-compliances',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    getAllCompliancesForState
);

router.get(
    '/:propertyId/compliance-attachments/:attachmentId',
    authenticate,
    authorizePropertySASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizePropertyDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    downloadComplianceAttachment
);

// ------------------ EXPIRED SCREENING DATES ----------------------------

router.get(
    '/sasp/:stateId/expired-screening-dates',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    getPropertiesHavingExpiredScreeningDates
);

router.get(
    '/sasp/:stateId/expired-screening-dates/today',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    getPropertiesHavingScreeningDatesExpiredToday
);

router.get(
    '/sasp/:stateId/expired-screening-dates/three-days-from-now',
    authenticate,
    authorizeSASPManagement([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    getPropertiesHavingScreeningDatesExpiredThreeDaysFromNow
);

// ------------------ ELASTICSEARCH ----------------------------
router.get(
    '/elasticsearch/search',
    authenticate,
    authorizeActiveDoneeAccount(),
    PropertyElasticsearchController.searchProperties
);

router.get(
  '/elasticsearch/details/:icn',
  authenticate,
  authorizeActiveDoneeAccount(),
  PropertyElasticsearchController.getPropertyDetailsByIcn
);

export default router;
