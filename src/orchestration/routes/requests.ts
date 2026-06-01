import { Router } from 'express';
import {
  getAllRequests,
  getRequestById,
  getRequestProperties,
  updateRequestTcn,
  allocateRequestProperties,
  generateLOAR,
  updateLoarShipping,
  getRequestAttachments,
  getRequestAttachment,
  createRequestAttachment,
  getMatchingPropertiesForRequest,
  addMatchingPropertyToRequest,
  cancelPropertiesInRequest,
  unCancelPropertiesInRequest,
  markPropertiesAsPickedUpInRequest,
  getRequestForSasp,
  denyPropertiesInRequest,
  updatePropertyStatusInRequest,
  generateInvoice,
  pickupApproval,
  getRequestCountsForSasp,
  getAllRequestsCounts,
  updatePropertyInRequest,
  sigInvoice,
  reportInvoicePayment,
  updateInvoiceMemo,
  signLogisticsPacket,
  getLogisticsPacketInfo,
  generateSF97,
  signSF97,
  getSf97Info,
  updateAllocatedQuantityInRequest,
  cancelInvoice,
  checkInvoiceAmountLessThanPenny,
} from '@/orchestration/controllers/request';
import { addCommentToRequest, getCommentsForRequest } from '@/orchestration/controllers/comment';
import { authenticate } from '@/orchestration/middleware/authenticate';
import { upload, validateFileUpload, validatePickupFiles } from '@/orchestration/middleware/upload';
import { validateRequestAttachment } from '@/orchestration/middleware/validateRequestAttachment';
import { UserPermissionsEnum } from '@/enums/userPermissions.enum';
import { authorizeOrganizationSASPAccess } from '../middleware/SASP/authorizeOrganizationAccess.sasp';
import { authorizeOrganizationDoneeAccess } from '../middleware/Donee/authorizeOrganizationAccess.donee';
import { authorizeRequestSASPAccess } from '../middleware/SASP/authorizeRequestAccess.sasp';
import { authorizeRequestDoneeAccess } from '../middleware/Donee/authorizeRequestAccess.donee';

const router = Router();

router.get(
  '/organization/:organizationId',
  authenticate,
  authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
  authorizeOrganizationDoneeAccess([UserPermissionsEnum.VIEW_ORGANIZATION_REQUESTS]),
  getAllRequests
);

router.get(
  '/organization/:organizationId/counts',
  authenticate,
  authorizeOrganizationSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
  authorizeOrganizationDoneeAccess([UserPermissionsEnum.VIEW_ORGANIZATION_REQUESTS]),
  getAllRequestsCounts
);

router.get(
  '/:requestId',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
  authorizeRequestDoneeAccess(),
  getRequestById
);

router.put('/:requestId/tcn', authenticate, authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS], { isOnlySasp: true }), updateRequestTcn);

router.get(
  '/:requestId/properties',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
  authorizeRequestDoneeAccess(),
  getRequestProperties
);

router.post(
  '/:requestId/comments',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
  authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
  addCommentToRequest
);

router.get(
  '/:requestId/comments',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
  authorizeRequestDoneeAccess(),
  getCommentsForRequest
);

router.put(
  '/:requestId/allocate',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS], { isOnlySasp: true }),
  allocateRequestProperties
);

router.post('/:requestId/loar', authenticate, authorizeRequestSASPAccess([UserPermissionsEnum.SASP_GENERATE_REQUEST_LOAR], { isOnlySasp: true }), generateLOAR);

router.put(
  '/:requestId/loar/:attachmentId/shipping',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
  authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
  updateLoarShipping
);

router.post(
  '/:requestId/logistics-packet/sign',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
  authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
  signLogisticsPacket
);

router.get(
  '/:requestId/logistics-packet',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
  authorizeRequestDoneeAccess(),
  getLogisticsPacketInfo
);

router.post(
  '/:requestId/sf-97',
  authenticate,
  authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS], true),
  generateSF97
);

router.post(
  '/:requestId/sf-97/sign',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
  authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
  signSF97
);

router.get(
  '/:requestId/sf-97',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
  authorizeRequestDoneeAccess(),
  getSf97Info
);

router.get(
    '/:requestId/attachments',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    authorizeRequestDoneeAccess(),
    getRequestAttachments
);

router.get(
    '/:requestId/attachments/:attachmentId',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    authorizeRequestDoneeAccess(),
    getRequestAttachment
);

router.post(
    `/:requestId/attachments`,
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    upload.single('file'),
    validateRequestAttachment,
    validateFileUpload,
    createRequestAttachment
);

router.get(
    '/:requestId/properties/matching',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS]),
    authorizeRequestDoneeAccess(),
    getMatchingPropertiesForRequest
);

router.post(
    '/:requestId/properties/add/:icn',
    authenticate,
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS], true),
    addMatchingPropertyToRequest
);

router.post(
    '/:requestId/properties/deny',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS], { isOnlySasp: true }),
    denyPropertiesInRequest
);

router.post(
    '/:requestId/properties/cancel',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    cancelPropertiesInRequest
);

router.put(
    '/:requestId/properties/un-cancel',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS], { isOnlySasp: true }),
    unCancelPropertiesInRequest
);

router.post(
    '/:requestId/properties/change-status',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS], { isOnlySasp: true }),
    updatePropertyStatusInRequest
);


router.put(
    '/:requestId/properties/:propertyId/update-quantity-justification',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    updatePropertyInRequest
);

// SASP-only: Update allocated quantity for an allocated property
router.put(
    '/:requestId/properties/:propertyId/update-allocated-quantity',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS], { isOnlySasp: true }),
    updateAllocatedQuantityInRequest
);

router.post(
    '/:requestId/properties/pickup',
    authenticate,
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS], true),
    markPropertiesAsPickedUpInRequest
);


router.post(
    '/:requestId/properties/pickup-approval',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS], { isOnlySasp: true }),
    pickupApproval
);

router.get(
    '/sasp/all',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS], { isOnlySasp: true, isAllRequest: true }),
    getRequestForSasp
);

router.get(
    '/sasp/counts',
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS], { isOnlySasp: true, isAllRequest: true }),
    getRequestCountsForSasp
);

// ------------------ INVOICES -----------------------------------------------

router.post(
    `/:requestId/generate-invoice`,
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    generateInvoice
);

router.post(
    `/:requestId/sign-invoice`,
    authenticate,
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS], true),
    sigInvoice
);

router.post(
    `/:requestId/report-invoice-payment`,
    authenticate,
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS], true),
    reportInvoicePayment
);

router.post(
    `/:requestId/cancel-invoice`,
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS], { isOnlySasp: true }),
    cancelInvoice
);


router.put(
    `/:requestId/update-invoice-memo`,
    authenticate,
    authorizeRequestSASPAccess([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeRequestDoneeAccess([UserPermissionsEnum.MANAGE_REQUESTS]),
    updateInvoiceMemo
);

router.get(
  '/:requestId/invoice/less-than-penny',
  authenticate,
  authorizeRequestSASPAccess([UserPermissionsEnum.SASP_VIEW_ALL_REQUESTS], { isOnlySasp: true }),
  checkInvoiceAmountLessThanPenny
);

export default router;
