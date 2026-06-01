import { updateRequestTcn, getAllRequests, updatePropertyInRequest, getAllRequestsCounts, getRequestById, allocateRequestProperties, generateLOAR, getRequestProperties, updateInvoiceMemo, sigInvoice, denyPropertiesInRequest, cancelPropertiesInRequest, getRequestCountsForSasp, getRequestForSasp, reportInvoicePayment } from '@/orchestration/controllers/request';
import { RequestService } from '@/properties/services/request';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import NotificationFactory from '@/notifications/services/notification-factory.service';

import type { Request, Response } from 'express';

// ---- Mock dependencies ---------------------------------------------------

jest.mock('@/utils/response/responseHelper', () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
}));

jest.mock('@/utils/validators', () => ({
  parseId: jest.fn((v: string | number) => Number(v)),
}));

jest.mock('@/properties/services/request', () => ({
  RequestService: {
    updateRequestTcn: jest.fn(),
    getAllRequestsByOrganizationId: jest.fn(),
    getAllRequestsCounts: jest.fn(),
    getRequestById: jest.fn(),
    updateRequest: jest.fn(),
    allocateRequestProperties: jest.fn(),
    generateLOAR: jest.fn(),
    updateInvoiceMemo: jest.fn(),
    denyPropertiesInRequest: jest.fn(),
    cancelPropertiesInRequest: jest.fn(),
    getUserByRequestId: jest.fn(),
    getRequestCountsByStatus: jest.fn(),
    getAllSaspRequest: jest.fn(),
    requestToMarkInvoiceAsPaid: jest.fn(),
    markInvoiceAsPaid: jest.fn(),
  },
}));

jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: {
    createNotification: jest.fn(),
  },
  NotificationType: {
    TCN_UPDATED: 'TCN_UPDATED',
    INVOICE_GENERATED: 'INVOICE_GENERATED',
    LOAR_GENERATED: 'LOAR_GENERATED',
    LOAR_SHIPPING_UPDATED: 'LOAR_SHIPPING_UPDATED',
    INVOICE_PAYMENT_REQUESTED: 'INVOICE_PAYMENT_REQUESTED',
    INVOICE_PAID: 'INVOICE_PAID',
  },
}));

// Mock Redis and BullMQ so no real TCP connections are opened during tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    duplicate: jest.fn().mockReturnThis(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn(),
  }));
});

jest.mock('bullmq', () => {
  class MockWorker {
    constructor() { }
    on() { return this; }
    close() { return Promise.resolve(); }
  }
  class MockQueue {
    constructor() { }
    on() { return this; }
    add() { return Promise.resolve(); }
  }
  class MockQueueScheduler {
    constructor() { }
    close() { return Promise.resolve(); }
  }
  return { Worker: MockWorker, Queue: MockQueue, QueueScheduler: MockQueueScheduler };
});

// Mock emailQueue used in deny/cancel controllers
jest.mock('@/utils/mail/emailQueue', () => ({
  emailQueue: {
    add: jest.fn().mockResolvedValue({}),
  },
}));

// Mock Property, PropertyData and transactional util used by updatePropertyInRequest
jest.mock('@/properties/services/property', () => ({
  PropertyService: {
    getPropertyById: jest.fn(),
    updateProperty: jest.fn(),
    getAllPropertiesByRequestId: jest.fn(),
    getPropertiesByRequestId: jest.fn(),
    getRequestAllocationStatus: jest.fn(),
    updateCompetingStatusAfterChange: jest.fn(),
    checkDuplicatePropertyByICN: jest.fn(),
    createProperty: jest.fn(),
  },
}));

jest.mock('@/ppms/services/propertyData', () => ({
  PropertyDataService: {
    getPropertyDetails: jest.fn(),
    getManyPropertyDetails: jest.fn(),
    getAllPropertiesSummary: jest.fn(),
  },
}));

jest.mock('@/loar/services/loar', () => ({
  LoarService: { generateLoar: jest.fn(), updateShipping: jest.fn() },
}));

jest.mock('@/utils/mail/emailQueue', () => ({ emailQueue: { add: jest.fn() } }));

jest.mock('@/utils/transactionalOperation', () => ({
  // default: execute callback immediately and await it to fully resolve so that async work inside is completed before controller returns
  withTransaction: jest.fn(async (fn: any) => {
    return await fn({});
  }),
}));

jest.mock('@/properties/services/requestAttachment', () => ({
  RequestAttachmentService: {
    createAttachment: jest.fn().mockResolvedValue({ id: 1, createdAt: new Date() }),
    updateAttachmentPath: jest.fn().mockResolvedValue({ id: 1, path: 'path/to/file' }),
    getAttachment: jest.fn(),
    getAttachments: jest.fn(),
  },
  RequestAttachmentTypeEnum: { LOAR: 'LOAR' },
}));

// Mock DocumentFactory for sigInvoice
jest.mock('@/documents/services/document-factory.service', () => ({
  __esModule: true,
  default: { handler: jest.fn() },
  DocumentActionType: { SIGN_INVOICE: 'SIGN_INVOICE', GENERATE_INVOICE: 'GENERATE_INVOICE' },
}));

// Mock email template renderer used in deny/cancel flows
jest.mock('@/utils/mail/render', () => ({
  renderEmail: jest.fn().mockResolvedValue('<html/>'),
}));

// Mock time helper for late-cancellation calculations
jest.mock('@/utils/timeHelper', () => ({
  calculateDayDifference: jest.fn(),
  convertUnixTime: jest.fn(),
}));

// Mock property schema for addMatchingPropertyToRequest
jest.mock('@/properties/validators/propertySchema', () => ({
  automaticPropertySchema: jest.fn(() => ({ validate: jest.fn().mockImplementation((v: any) => Promise.resolve(v)) })),
}));

// Mock PropertyDataService for addMatchingPropertyToRequest
jest.mock('@/ppms/services/propertyData', () => ({
  PropertyDataService: {
    getPropertyDetails: jest.fn(),
    getAllPropertiesSummary: jest.fn(),
    getManyPropertyDetails: jest.fn(),
  },
}));

// Mock DoneeAccountService for addMatchingPropertyToRequest
jest.mock('@/organization/services/donee', () => ({
  DoneeAccountService: { getDoneeAccountByRequestId: jest.fn() },
}));

// Mock mapDiskProperty for addMatchingPropertyToRequest
jest.mock('@/utils/property', () => ({
  mapDiskPropertyToDbSchema: jest.fn().mockReturnValue({ mapped: true }),
}));

// Mock storage utilities for createRequestAttachment
jest.mock('@/utils/storage/paths', () => ({
  StoragePaths: {
    private: {
      orgs: {
        org: (orgId: string) => ({
          donees: {
            donee: (doneeId: string) => ({
              requests: {
                request: (requestId: string) => ({ path: `/tmp/${orgId}/${doneeId}/${requestId}` }),
              },
            }),
          },
        }),
      },
    },
  },
}));

jest.mock('@/utils/storage/fileSystem', () => ({
  saveUploadedFile: jest.fn(),
  readFile: jest.fn(),
  fileExists: jest.fn(),
  getFileMimeType: jest.fn(),
}));

// Mock pagination utility
jest.mock('@/utils/pagination', () => ({
  paginateArray: jest.fn((arr: any, _page: number, _limit: number) => ({ total: arr.length, results: arr })),
}));

// Helper to stub Express Response
const createMockResponse = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

// ---- Tests ---------------------------------------------------------------

describe('Request controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { PropertyService } = require('@/properties/services/property');
    PropertyService.updateCompetingStatusAfterChange = jest.fn();
    const { withTransaction } = require('@/utils/transactionalOperation');
    (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
  });

  describe('updateRequestTcn', () => {
    const validTcn = 'AB-25-123456';
    const invalidTcn = 'AA-99-123'; // fails regex (year must be 2 digits)

    it('updates TCN when format is valid', async () => {

      // 1. Arrange – setup test data
      const req = {
        params: { requestId: '5' },
        body: { tcn: validTcn },
      } as unknown as Request;
      const res = createMockResponse();

      (RequestService.updateRequestTcn as jest.Mock).mockResolvedValue({ id: 5, tcn: validTcn });


      // 2. Act – call controller
      await updateRequestTcn(req, res);


      // 3. Assert – verify behaviour
      expect(RequestService.updateRequestTcn).toHaveBeenCalledWith(5, validTcn);
      expect((NotificationFactory.createNotification as jest.Mock).mock.calls.length).toBeGreaterThan(0);
      expect(sendSuccess).toHaveBeenCalledWith(res, { id: 5, tcn: validTcn });
      expect(sendError).not.toHaveBeenCalled();
    });

    it('returns error on invalid TCN', async () => {

      // 1. Arrange – invalid TCN input
      const req = {
        params: { requestId: '5' },
        body: { tcn: 'BADTCN' },
      } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await updateRequestTcn(req, res);

      // 3. Assert – ensure error path taken
      expect(RequestService.updateRequestTcn).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error on malformed TCN string', async () => {
      // 1. Arrange – invalid format
      const req = { params: { requestId: '5' }, body: { tcn: invalidTcn } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await updateRequestTcn(req, res);

      // 3. Assert – service never called, error sent
      expect(RequestService.updateRequestTcn).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when service fails (e.g., duplicate TCN)', async () => {
      // 1. Arrange – service rejection simulating DB conflict
      const req = {
        params: { requestId: '5' },
        body: { tcn: validTcn },
      } as unknown as Request;
      const res = createMockResponse();

      (RequestService.updateRequestTcn as jest.Mock).mockRejectedValue(new Error('duplicate'));

      // 2. Act – call controller
      await updateRequestTcn(req, res);

      // 3. Assert – ensure error path triggered
      expect(sendError).toHaveBeenCalled();
    });
  });

  describe('getAllRequests', () => {
    const orgId = 'org-42';

    it('applies default pagination', async () => {

      // 1. Arrange – no query params (defaults)
      const req = {
        params: { organizationId: orgId },
        query: {},
      } as unknown as Request;
      const res = createMockResponse();

      (RequestService.getAllRequestsByOrganizationId as jest.Mock).mockResolvedValue([]);

      // 2. Act – call controller
      await getAllRequests(req, res);

      // 3. Assert – verify defaults applied
      expect(RequestService.getAllRequestsByOrganizationId).toHaveBeenCalledWith(
        orgId,
        1,
        10,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(sendSuccess).toHaveBeenCalledWith(res, []);
    });

    it('forwards query params', async () => {
      // 1. Arrange – custom query params
      const req = {
        params: { organizationId: orgId },
        query: {
          page: '2',
          limit: '15',
          filterKey: 'STATUS',
          operator: 'eq',
          filterValue: 'PENDING',
          sortBy: 'createdAt',
          sortOrder: 'asc',
        },
      } as unknown as Request;
      const res = createMockResponse();

      (RequestService.getAllRequestsByOrganizationId as jest.Mock).mockResolvedValue(['req1']);

      // 2. Act – call controller
      await getAllRequests(req, res);

      // 3. Assert – verify params forwarded
      expect(RequestService.getAllRequestsByOrganizationId).toHaveBeenCalledWith(
        orgId,
        2,
        15,
        'STATUS',
        'eq',
        'PENDING',
        'createdAt',
        'asc',
      );
      expect(sendSuccess).toHaveBeenCalledWith(res, ['req1']);
    });

    it('returns error when service throws', async () => {
      // 1. Arrange – force service to throw
      const req = { params: { organizationId: orgId }, query: {} } as unknown as Request;
      const res = createMockResponse();

      (RequestService.getAllRequestsByOrganizationId as jest.Mock).mockRejectedValue(new Error('db error'));

      // 2. Act – call controller
      await getAllRequests(req, res);

      // 3. Assert – error propagated
      expect(sendError).toHaveBeenCalled();
    });
  });

  describe('getAllRequests', () => {
    const controller = require('./request');
    beforeEach(() => jest.clearAllMocks());

    it('returns paginated requests successfully', async () => {
      const { RequestService } = require('@/properties/services/request');
      const reqs = [{ id: 1 }, { id: 2 }];
      RequestService.getAllRequestsByOrganizationId.mockResolvedValue(reqs);

      const req = { params: { organizationId: '10' }, query: { page: '2', limit: '5', filterKey: 'STATUS', filterValue: 'PENDING', operator: 'eq', sortBy: 'createdAt', sortOrder: 'DESC' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getAllRequests(req, res);

      expect(RequestService.getAllRequestsByOrganizationId).toHaveBeenCalledWith('10', 2, 5, 'STATUS', 'eq', 'PENDING', 'createdAt', 'DESC');
      expect(sendSuccess).toHaveBeenCalledWith(res, reqs);
    });

    it('returns error on service failure', async () => {
      const { RequestService } = require('@/properties/services/request');
      RequestService.getAllRequestsByOrganizationId.mockRejectedValue(new Error('oops'));

      const req = { params: { organizationId: '10' }, query: {} } as unknown as Request;
      const res = createMockResponse();

      await controller.getAllRequests(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });

  // getAllRequestsCounts
  describe('getAllRequestsCounts', () => {
    const orgId = 'org-77';

    it('returns counts with correct params', async () => {
      // 1. Arrange – happy path
      const req = {
        params: { organizationId: orgId },
        query: { filterKey: 'STATUS', filterValue: 'PENDING', operator: 'eq' },
      } as unknown as Request;
      const res = createMockResponse();

      (RequestService.getAllRequestsCounts as jest.Mock).mockResolvedValue({ PENDING: 3 });

      // 2. Act
      await getAllRequestsCounts(req, res);

      // 3. Assert
      expect(RequestService.getAllRequestsCounts).toHaveBeenCalledWith(orgId, 'STATUS', 'eq', 'PENDING');
      expect(sendSuccess).toHaveBeenCalledWith(res, { PENDING: 3 });
    });

    it('omits operator when not supplied', async () => {
      // 1. Arrange – operator undefined
      const req = {
        params: { organizationId: orgId },
        query: { filterKey: 'STATUS', filterValue: 'PENDING' },
      } as unknown as Request;
      const res = createMockResponse();

      (RequestService.getAllRequestsCounts as jest.Mock).mockResolvedValue({ PENDING: 5 });

      // 2. Act
      await getAllRequestsCounts(req, res);

      // 3. Assert – service called with undefined operator and success returned
      expect(RequestService.getAllRequestsCounts).toHaveBeenCalledWith(orgId, 'STATUS', undefined, 'PENDING');
      expect(sendSuccess).toHaveBeenCalledWith(res, { PENDING: 5 });
    });

    it('returns error when service throws', async () => {
      // 1. Arrange – force service failure
      const req = { params: { organizationId: orgId }, query: {} } as unknown as Request;
      const res = createMockResponse();

      (RequestService.getAllRequestsCounts as jest.Mock).mockRejectedValue(new Error('db error'));

      // 2. Act – call controller
      await getAllRequestsCounts(req, res);

      // 3. Assert – error propagated
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when organizationId missing', async () => {
      // 1. Arrange – missing organizationId
      const req = { query: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await getAllRequestsCounts(req, res);

      // 3. Assert – error path
      expect(sendError).toHaveBeenCalled();
    });
  });


  // getRequestById
  describe('getRequestById', () => {
    it('returns request on success', async () => {
      // Arrange
      const { RequestService } = require('@/properties/services/request');
      const req = { params: { requestId: '42' } } as unknown as Request;
      const res = createMockResponse();

      RequestService.getRequestById.mockResolvedValue({ id: 42 });

      // Act
      await getRequestById(req, res);

      // Assert
      expect(RequestService.getRequestById).toHaveBeenCalledWith(42);
      expect(sendSuccess).toHaveBeenCalledWith(res, { id: 42 });
    });

    it('calls sendError when service throws', async () => {
      // Arrange
      const { RequestService } = require('@/properties/services/request');
      const req = { params: { requestId: '99' } } as unknown as Request;
      const res = createMockResponse();

      RequestService.getRequestById.mockRejectedValue(new Error('not found'));

      // Act
      await getRequestById(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // updatePropertyInRequest
  describe('updatePropertyInRequest', () => {
    const requestId = 10;
    const propertyId = 99;

    // Helper to create base request with correct enum status
    const createBaseReq = () => {
      const { RequestStatusEnum } = require('@/enums/request-property-status.enum');
      return {
        params: { requestId: String(requestId), propertyId: String(propertyId) },
        request: { status: RequestStatusEnum.PENDING },
      } as unknown as Request & { request: { status: string } };
    };

    beforeEach(() => {
      jest.clearAllMocks();
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.updateCompetingStatusAfterChange = jest.fn();
      const { withTransaction } = require('@/utils/transactionalOperation');
      (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    });

    it('updates property when quantity & justification are valid', async () => {

      // 1. Arrange – valid property & disk data

      const { PropertyService } = require('@/properties/services/property');
      const { PropertyDataService } = require('@/ppms/services/propertyData');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_control_number: 'ICN' });
      PropertyDataService.getPropertyDetails.mockResolvedValue({ data: { quantity: 100 } });
      PropertyService.updateProperty.mockResolvedValue({ id: propertyId, property_quantity: 5, property_justification: 'Valid' });

      const req = {
        ...createBaseReq(),
        body: { property_quantity: 5, property_justification: 'Valid' },
      } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await updatePropertyInRequest(req, res);

      // 3. Assert – verify update executed
      expect(PropertyService.updateProperty).toHaveBeenCalledWith(propertyId, { property_justification: 'Valid', property_quantity: 5 }, expect.anything());
      expect(sendSuccess).toHaveBeenCalled();
      expect(sendError).not.toHaveBeenCalled();
    });

    it('updates property with property_justification_extended when provided', async () => {
      const { PropertyService } = require('@/properties/services/property');
      const { PropertyDataService } = require('@/ppms/services/propertyData');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_control_number: 'ICN' });
      PropertyDataService.getPropertyDetails.mockResolvedValue({ data: { quantity: 100 } });
      PropertyService.updateProperty.mockResolvedValue({ id: propertyId, property_quantity: 1, property_justification: 'Short', property_justification_extended: 'Extended text' });

      const req = {
        ...createBaseReq(),
        body: { property_quantity: 1, property_justification: 'Short', property_justification_extended: 'Extended text' },
      } as unknown as Request;
      const res = createMockResponse();

      await updatePropertyInRequest(req, res);

      expect(PropertyService.updateProperty).toHaveBeenCalledWith(
        propertyId,
        { property_justification: 'Short', property_quantity: 1, property_justification_extended: 'Extended text' },
        expect.anything()
      );
      expect(sendSuccess).toHaveBeenCalled();
      expect(sendError).not.toHaveBeenCalled();
    });

    it('throws validation error when quantity exceeds available', async () => {

      // 1. Arrange – disk quantity lower than requested
      const { PropertyService } = require('@/properties/services/property');
      const { PropertyDataService } = require('@/ppms/services/propertyData');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_control_number: 'ICN' });
      PropertyDataService.getPropertyDetails.mockResolvedValue({ data: { quantity: 3 } });

      const req = {
        ...createBaseReq(),
        body: { property_quantity: 10 },
      } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await updatePropertyInRequest(req, res);

      // 3. Assert – ensure error path taken
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });

    it('throws validation error when quantity is non-integer', async () => {

      // 1. Arrange – quantity is 2.5 (invalid)
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_control_number: 'ICN' });

      const req = {
        ...createBaseReq(),
        body: { property_quantity: 2.5 },
      } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await updatePropertyInRequest(req, res);

      // 3. Assert – ensure validation error
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });

    it('throws validation error when justification is too short', async () => {

      // 1. Arrange – justification length 1 (invalid)
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_control_number: 'ICN' });

      const req = {
        ...createBaseReq(),
        body: { property_quantity: 1, property_justification: 'A' },
      } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await updatePropertyInRequest(req, res);

      // 3. Assert – ensure validation error
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });

    it('returns 404 when property is not part of this request', async () => {

      // 1. Arrange – property.request_id mismatched
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: 123, property_control_number: 'ICN' });

      const req = {
        ...createBaseReq(),
        body: { property_quantity: 1 },
      } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await updatePropertyInRequest(req, res);

      // 3. Assert – ensure not-found error
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when request status is not PENDING', async () => {

      // 1. Arrange – request status COMPLETED
      const { PropertyService } = require('@/properties/services/property');
      const { RequestStatusEnum } = require('@/enums/request-property-status.enum');
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_control_number: 'ICN' });

      const req = {
        params: { requestId: String(requestId), propertyId: String(propertyId) },
        request: { status: RequestStatusEnum.COMPLETED },
        body: { property_quantity: 1 },
      } as unknown as Request & { request: { status: string } };
      const res = createMockResponse();

      // 2. Act – call controller
      await updatePropertyInRequest(req, res);

      // 3. Assert – ensure error because of status
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when transaction fails', async () => {
      // 1. Arrange – withTransaction rejects
      const { PropertyService } = require('@/properties/services/property');
      const { withTransaction } = require('@/utils/transactionalOperation');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_quantity: 5, is_cancelled: false });
      (withTransaction as jest.Mock).mockImplementationOnce(async () => { throw new Error('tx fail'); });

      const req = { ...createBaseReq(), body: { property_quantity: 1 } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await updatePropertyInRequest(req, res);

      // 3. Assert – error returned
      expect(sendError).toHaveBeenCalled();
    });
  });


  // allocateRequestProperties
  describe('allocateRequestProperties', () => {
    const requestId = 50;
    const propertyId = 500;
    const allocationBody = { allocations: [{ property_id: propertyId, allocated: 2 }] };

    it('allocates properties successfully', async () => {
      const { PropertyService } = require('@/properties/services/property');
      const { RequestService } = require('@/properties/services/request');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_quantity: 3, is_cancelled: false });
      PropertyService.updateProperty.mockResolvedValue({});
      PropertyService.getAllPropertiesByRequestId.mockResolvedValue([]);
      PropertyService.getRequestAllocationStatus.mockReturnValue('ALLOCATED');
      RequestService.updateRequest.mockResolvedValue({ id: requestId, status: 'ALLOCATED' });

      const req = {
        params: { requestId: String(requestId) },
        body: allocationBody,
      } as unknown as Request;
      const res = createMockResponse();

      await allocateRequestProperties(req, res);

      expect(PropertyService.getPropertyById).toHaveBeenCalledWith(propertyId);
      expect(PropertyService.updateProperty).toHaveBeenCalled();
      expect(RequestService.updateRequest).toHaveBeenCalledWith(requestId, { status: 'ALLOCATED' }, expect.anything());
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('errors when property belongs to another request', async () => {
      const { PropertyService } = require('@/properties/services/property');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: 999, property_quantity: 3, is_cancelled: false });

      const req = {
        params: { requestId: String(requestId) },
        body: allocationBody,
      } as unknown as Request;
      const res = createMockResponse();

      await allocateRequestProperties(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('errors when allocated quantity exceeds available', async () => {
      // 1. Arrange –  requested allocation too high
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_quantity: 2, is_cancelled: false });

      const req = {
        params: { requestId: String(requestId) },
        body: { allocations: [{ property_id: propertyId, allocated: 5 }] },
      } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await allocateRequestProperties(req, res);

      // 3. Assert – over-allocation rejected
      expect(sendError).toHaveBeenCalled();
    });
  });

  describe('allocateRequestProperties – additional validations', () => {
    const requestId = 60;
    const propertyId = 600;
    const allocationBody = { allocations: [{ property_id: propertyId, allocated: 0 }] };

    it('fails when property is cancelled', async () => {
      const { PropertyService } = require('@/properties/services/property');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_quantity: 2, is_cancelled: true });

      const req = { params: { requestId: String(requestId) }, body: { allocations: [{ property_id: propertyId, allocated: 1 }] } } as unknown as Request;
      const res = createMockResponse();

      await allocateRequestProperties(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('fails when allocated quantity is zero', async () => {
      const { PropertyService } = require('@/properties/services/property');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, property_quantity: 2, is_cancelled: false });

      const req = { params: { requestId: String(requestId) }, body: allocationBody } as unknown as Request;
      const res = createMockResponse();

      await allocateRequestProperties(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });


  // generateLOAR
  describe('generateLOAR', () => {
    it('returns error when request lacks TCN', async () => {
      const { RequestService } = require('@/properties/services/request');
      const { PropertyService } = require('@/properties/services/property');

      RequestService.getRequestById.mockResolvedValue({ id: 77, tcn: '', status: 'PENDING', doneeAccount: {} });
      PropertyService.getPropertiesByRequestId.mockResolvedValue([{ property_allocated_quantity: 1, property_control_number: 'ICN', property_quantity: 1 }]);

      const req = { params: { requestId: '77' }, body: {}, user: {} } as unknown as Request;
      const res = createMockResponse();

      await generateLOAR(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });


  // generateLOAR extensive coverage
  describe('generateLOAR validation branches', () => {
    const { RequestService } = require('@/properties/services/request');
    const { PropertyService } = require('@/properties/services/property');
    const { PropertyDataService } = require('@/ppms/services/propertyData');
    const { LoarService } = require('@/loar/services/loar');
    const { RequestAttachmentService } = require('@/properties/services/requestAttachment');

    const baseRequest = { id: 80, tcn: 'AB-23-123456', status: 'PENDING', doneeAccount: {} };
    const allocatedProp = { property_allocated_quantity: 1, property_control_number: 'ICN1', property_quantity: 1 };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('404 when request not found', async () => {
      // 1. Arrange – request not found
      RequestService.getRequestById.mockResolvedValue(null);

      const req = { params: { requestId: '80' }, body: {}, user: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await generateLOAR(req, res);

      // 3. Assert – error returned
      expect(sendError).toHaveBeenCalled();
    });

    it('400 when request canceled', async () => {
      // 1. Arrange – request canceled
      RequestService.getRequestById.mockResolvedValue({ ...baseRequest, status: 'CANCELED' });

      const req = { params: { requestId: '80' }, body: {}, user: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await generateLOAR(req, res);

      // 3. Assert – error returned
      expect(sendError).toHaveBeenCalled();
    });

    it('400 when doneeAccount missing', async () => {
      // 1. Arrange – doneeAccount missing
      RequestService.getRequestById.mockResolvedValue({ ...baseRequest, doneeAccount: null });

      const req = { params: { requestId: '80' }, body: {}, user: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await generateLOAR(req, res);

      // 3. Assert – error returned
      expect(sendError).toHaveBeenCalled();
    });

    it('404 when no properties', async () => {
      // 1. Arrange – no properties on request
      RequestService.getRequestById.mockResolvedValue(baseRequest);
      PropertyService.getPropertiesByRequestId.mockResolvedValue([]);

      const req = { params: { requestId: '80' }, body: {}, user: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await generateLOAR(req, res);

      // 3. Assert – error returned
      expect(sendError).toHaveBeenCalled();
    });

    it('400 when all properties unallocated', async () => {
      // 1. Arrange – all properties unallocated
      RequestService.getRequestById.mockResolvedValue(baseRequest);
      PropertyService.getPropertiesByRequestId.mockResolvedValue([{ property_allocated_quantity: 0, property_control_number: 'ICN0', property_quantity: 1 }]);

      const req = { params: { requestId: '80' }, body: {}, user: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await generateLOAR(req, res);

      // 3. Assert – error returned
      expect(sendError).toHaveBeenCalled();
    });

    it('404 when property details empty', async () => {
      // 1. Arrange – property details empty
      RequestService.getRequestById.mockResolvedValue(baseRequest);
      PropertyService.getPropertiesByRequestId.mockResolvedValue([allocatedProp]);
      PropertyDataService.getManyPropertyDetails.mockResolvedValue([]);

      const req = { params: { requestId: '80' }, body: {}, user: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await generateLOAR(req, res);

      // 3. Assert – error returned
      expect(sendError).toHaveBeenCalled();
    });

    it('generates LOAR on happy path', async () => {
      // 1. Arrange – happy path
      RequestService.getRequestById.mockResolvedValue(baseRequest);
      PropertyService.getPropertiesByRequestId.mockResolvedValue([allocatedProp]);
      PropertyDataService.getManyPropertyDetails.mockResolvedValue([{ icn: 'ICN1' }]);

      const req = { params: { requestId: '80' }, body: { display_name: 'CustomName' }, user: { id: 1 } } as unknown as Request & { user: any };
      const res = createMockResponse();

      // 2. Act – call controller
      await generateLOAR(req, res);

      // 3. Assert – success path
      expect(RequestAttachmentService.createAttachment).toHaveBeenCalled();
      expect(LoarService.generateLoar).toHaveBeenCalled();
      expect(RequestAttachmentService.updateAttachmentPath).toHaveBeenCalled();
      expect((NotificationFactory.createNotification as jest.Mock).mock.calls.length).toBeGreaterThan(0);
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('returns error when LoarService fails', async () => {
      // 1. Arrange – Loar generation failure
      const { RequestService } = require('@/properties/services/request');
      const { PropertyService } = require('@/properties/services/property');
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      const { LoarService } = require('@/loar/services/loar');

      RequestService.getRequestById.mockResolvedValue({ id: 81, tcn: 'AB-23-123456', status: 'PENDING', doneeAccount: {} });
      PropertyService.getPropertiesByRequestId.mockResolvedValue([{ property_allocated_quantity: 1, property_control_number: 'ICN', property_quantity: 1 }]);
      PropertyDataService.getManyPropertyDetails.mockResolvedValue([{ icn: 'ICN' }]);
      LoarService.generateLoar.mockRejectedValue(new Error('pdf fail'));

      const req = { params: { requestId: '81' }, body: {}, user: { id: 1 } } as unknown as Request & { user: any };
      const res = createMockResponse();

      // 2. Act – call controller
      await generateLOAR(req, res);

      // 3. Assert – ensure error returned and success not sent
      expect(sendSuccess).not.toHaveBeenCalled();
      expect(sendError).toHaveBeenCalled();
    });
  });


  // getRequestProperties
  describe('getRequestProperties', () => {
    const requestId = 70;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('forwards params with defaults when no query provided', async () => {
      // 1. Arrange – mock service result
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertiesByRequestId.mockResolvedValue([{ id: 1 }]);

      const req = { params: { requestId: String(requestId) }, query: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await getRequestProperties(req, res);

      // 3. Assert – verify default paging/filters forwarded & success sent
      expect(PropertyService.getPropertiesByRequestId).toHaveBeenCalledWith(requestId, undefined, undefined, undefined, undefined, undefined);
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('returns error when service throws', async () => {
      // 1. Arrange – force service failure
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertiesByRequestId.mockRejectedValue(new Error('db fail'));

      const req = { params: { requestId: String(requestId) }, query: {} } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await getRequestProperties(req, res);

      // 3. Assert – error propagated
      expect(sendError).toHaveBeenCalled();
    });
  });


  // updateInvoiceMemo
  describe('updateInvoiceMemo', () => {
    const { RequestService } = require('@/properties/services/request');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('updates invoice memo successfully', async () => {
      // 1. Arrange – valid request & doneeAccount
      const controller = require('./request');
      const req = {
        request: { doneeAccount: {} },
        body: { requestAttachmentId: 5, memo_sasp: 'SASP', memo_organization: 'ORG' },
      } as unknown as Request & { request: any };
      const res = createMockResponse();

      RequestService.updateInvoiceMemo.mockResolvedValue({});

      // 2. Act – call controller
      await controller.updateInvoiceMemo(req, res);

      // 3. Assert – service called & success 201
      expect(RequestService.updateInvoiceMemo).toHaveBeenCalledWith(5, 'SASP', 'ORG');
      expect(sendSuccess).toHaveBeenCalledWith(res, {}, 201);
    });

    it('returns error when doneeAccount missing', async () => {
      // 1. Arrange – missing doneeAccount
      const controller = require('./request');
      const req = { request: { doneeAccount: null }, body: { requestAttachmentId: 1 } } as unknown as Request & { request: any };
      const res = createMockResponse();

      // 2. Act
      await controller.updateInvoiceMemo(req, res);

      // 3. Assert – error path
      expect(sendError).toHaveBeenCalled();
    });
  });


  // sigInvoice
  describe('sigInvoice', () => {
    const { RequestService } = require('@/properties/services/request');
    const { default: DocumentFactory } = require('@/documents/services/document-factory.service');

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('signs invoice successfully', async () => {
      // 1. Arrange – request with doneeAccount
      const { withTransaction } = require('@/utils/transactionalOperation');
      const controller = require('./request');

      const req = {
        request: { id: 88, doneeAccount: { stateId: 'TX' } },
        user: { id: 2 },
        body: { requestAttachmentId: 99 },
      } as unknown as Request & { request: any; user: any };
      const res = createMockResponse();

      DocumentFactory.handler.mockResolvedValue({});
      (NotificationFactory.createNotification as jest.Mock).mockResolvedValue({});

      // 2. Act – call controller
      await controller.sigInvoice(req, res);

      // 3. Assert – transactional handler + notification + success 201
      expect(DocumentFactory.handler).toHaveBeenCalled();
      expect((NotificationFactory.createNotification as jest.Mock).mock.calls.length).toBeGreaterThan(0);
      expect(sendSuccess).toHaveBeenCalledWith(res, {}, 201);
      // ensure default withTransaction executed
      expect((withTransaction as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    });

    it('returns error when doneeAccount missing', async () => {
      // 1. Arrange – doneeAccount null
      const controller = require('./request');
      const req = { request: { id: 90, doneeAccount: null }, body: { requestAttachmentId: 1 } } as unknown as Request & { request: any };
      const res = createMockResponse();

      // 2. Act
      await controller.sigInvoice(req, res);

      // 3. Assert – error
      expect(sendError).toHaveBeenCalled();
    });

    it('handles transaction failure', async () => {
      // 1. Arrange – withTransaction throws
      const { withTransaction } = require('@/utils/transactionalOperation');
      const controller = require('./request');
      const req = {
        request: { id: 91, doneeAccount: { stateId: 'CA' } },
        user: { id: 3 },
        body: { requestAttachmentId: 2 },
      } as unknown as Request & { request: any; user: any };
      const res = createMockResponse();

      (withTransaction as jest.Mock).mockImplementationOnce(async () => { throw new Error('tx error'); });

      // 2. Act
      await controller.sigInvoice(req, res);

      // 3. Assert – error path
      expect(sendError).toHaveBeenCalled();
    });
  });


  // denyPropertiesInRequest
  describe('denyPropertiesInRequest', () => {
    const controller = require('./request');
    const requestId = 300;
    const propertyId = 301;

    beforeEach(() => {
      jest.clearAllMocks();
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.updateCompetingStatusAfterChange = jest.fn();
      const { withTransaction } = require('@/utils/transactionalOperation');
      (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    });

    it('denies properties successfully with deny reason', async () => {
      // 1. Arrange – property eligible for denial
      const { PropertyService } = require('@/properties/services/property');
      const { RequestService } = require('@/properties/services/request');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, is_cancelled: false });
      PropertyService.updateProperty.mockResolvedValue({});
      PropertyService.getAllPropertiesByRequestId.mockResolvedValue([]);
      PropertyService.getRequestAllocationStatus.mockReturnValue('DENIED');
      RequestService.updateRequest.mockResolvedValue({ id: requestId, status: 'DENIED' });
      RequestService.getUserByRequestId.mockResolvedValue({ email: 'ozturkgokalp000@gmail.com', name: 'User' });

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId], denyReason: 'Property does not meet requirements' } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await controller.denyPropertiesInRequest(req, res);

      // 3. Assert – update called with deny reason and success sent
      expect(PropertyService.updateProperty).toHaveBeenCalledWith(
        propertyId,
        expect.objectContaining({
          is_denied: true,
          property_cancellation_reason: 'Property does not meet requirements'
        }),
        {}
      );
      expect(RequestService.updateRequest).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('returns error when deny reason is missing', async () => {
      // 1. Arrange – missing deny reason
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, is_cancelled: false });

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId] } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await controller.denyPropertiesInRequest(req, res);

      // 3. Assert – error path
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when deny reason is empty', async () => {
      // 1. Arrange – empty deny reason
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, is_cancelled: false });

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId], denyReason: '   ' } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await controller.denyPropertiesInRequest(req, res);

      // 3. Assert – error path
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when property not found', async () => {
      // 1. Arrange – property lookup fails
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue(null);

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [999], denyReason: 'Invalid property' } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await controller.denyPropertiesInRequest(req, res);

      // 3. Assert – error path
      expect(sendError).toHaveBeenCalled();
    });
  });


  // cancelPropertiesInRequest
  describe('cancelPropertiesInRequest', () => {
    const controller = require('./request');
    const requestId = 400;
    const propertyId = 401;

    beforeEach(() => {
      jest.clearAllMocks();
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.updateCompetingStatusAfterChange = jest.fn();
      const { withTransaction } = require('@/utils/transactionalOperation');
      (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    });

    it('cancels properties successfully', async () => {
      // 1. Arrange – property eligible for cancel
      const { PropertyService } = require('@/properties/services/property');
      const { RequestService } = require('@/properties/services/request');

      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, is_cancelled: false });
      PropertyService.updateProperty.mockResolvedValue({});
      PropertyService.getAllPropertiesByRequestId.mockResolvedValue([]);
      PropertyService.getRequestAllocationStatus.mockReturnValue('CANCELED');
      RequestService.updateRequest.mockResolvedValue({ id: requestId, status: 'CANCELED' });
      RequestService.getUserByRequestId.mockResolvedValue({ email: 'ozturkgokalp000@gmail.com', name: 'User' });

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId] } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act – call controller
      await controller.cancelPropertiesInRequest(req, res);

      // 3. Assert – update called and success sent
      expect(PropertyService.updateProperty).toHaveBeenCalled();
      expect(RequestService.updateRequest).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('sets is_late_cancelled when allocation date is >5 days ago', async () => {
      const { PropertyService } = require('@/properties/services/property');
      const { RequestService } = require('@/properties/services/request');
      const { calculateDayDifference } = require('@/utils/timeHelper');

      // 1. Arrange – late cancellation
      (calculateDayDifference as jest.Mock).mockReturnValue(10); // >5 days
      PropertyService.getPropertyById.mockResolvedValue({ id: propertyId, request_id: requestId, is_cancelled: false, property_control_number: 'ICN', property_allocated_date: Date.now() - 10 * 86400000 });
      PropertyService.updateProperty.mockResolvedValue({});
      PropertyService.getAllPropertiesByRequestId.mockResolvedValue([]);
      PropertyService.getRequestAllocationStatus.mockReturnValue('CANCELED');
      RequestService.updateRequest.mockResolvedValue({ id: requestId, status: 'CANCELED' });
      RequestService.getUserByRequestId.mockResolvedValue({ email: 'ozturkgokalp000@gmail.com', name: 'User' });

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId] } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await controller.cancelPropertiesInRequest(req, res);

      // 3. Assert – update includes is_late_cancelled true
      expect(PropertyService.updateProperty).toHaveBeenCalledWith(
        propertyId,
        expect.objectContaining({ is_late_cancelled: true }),
        expect.anything(),
      );
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('errors when at least one property in list is invalid', async () => {
      const { PropertyService } = require('@/properties/services/property');
      const { RequestService } = require('@/properties/services/request');

      // property 1 valid, property 2 invalid
      PropertyService.getPropertyById
        .mockResolvedValueOnce({ id: propertyId, request_id: requestId, is_cancelled: false, property_control_number: 'ICN' })
        .mockResolvedValueOnce(null);

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId, 999] } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await controller.cancelPropertiesInRequest(req, res);

      // 3. Assert – overall failure
      expect(sendError).toHaveBeenCalled();
      // ensure no request status update occurred
      expect(RequestService.updateRequest).not.toHaveBeenCalled();
    });

    it('returns error when service throws', async () => {
      // 1. Arrange – force update throw
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockRejectedValue(new Error('db err'));

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId] } } as unknown as Request;
      const res = createMockResponse();

      // 2. Act
      await controller.cancelPropertiesInRequest(req, res);

      // 3. Assert – error propagated
      expect(sendError).toHaveBeenCalled();
    });
  });


  // getRequestCountsForSasp
  describe('getRequestCountsForSasp', () => {
    const controller = require('./request');
    beforeEach(() => jest.clearAllMocks());

    it('returns counts successfully', async () => {
      const { RequestService } = require('@/properties/services/request');
      const countsMock = { PENDING: 2, COMPLETED: 1 };
      RequestService.getRequestCountsByStatus.mockResolvedValue(countsMock);

      const req = { query: { stateId: '5', filterKey: undefined, filterValue: undefined, operator: undefined } } as unknown as Request;
      const res = createMockResponse();

      await controller.getRequestCountsForSasp(req, res);

      expect(RequestService.getRequestCountsByStatus).toHaveBeenCalledWith(5, undefined, undefined, undefined);
      expect(sendSuccess).toHaveBeenCalledWith(res, countsMock);
    });

    it('returns error when service throws', async () => {
      const { RequestService } = require('@/properties/services/request');
      RequestService.getRequestCountsByStatus.mockRejectedValue(new Error('db down'));

      const req = { query: { stateId: '5' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getRequestCountsForSasp(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when stateId missing', async () => {
      const req = { query: {} } as unknown as Request;
      const res = createMockResponse();

      await controller.getRequestCountsForSasp(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });

  // getRequestForSasp
  describe('getRequestForSasp', () => {
    const controller = require('./request');
    beforeEach(() => jest.clearAllMocks());

    it('returns requests for sasp successfully', async () => {
      const { RequestService } = require('@/properties/services/request');
      const mockReqs = [{ id: 1 }];
      RequestService.getAllSaspRequest.mockResolvedValue(mockReqs);

      const req = { user: { id: 77 }, query: { page: '3', limit: '20', filterKey: 'STATUS', operator: 'eq', filterValue: 'PENDING', sortBy: 'createdAt', sortOrder: 'ASC' } } as unknown as Request;
      const res = createMockResponse();

      await controller.getRequestForSasp(req, res);

      expect(RequestService.getAllSaspRequest).toHaveBeenCalledWith(77, 3, 20, 'STATUS', 'eq', 'PENDING', 'createdAt', 'ASC');
      expect(sendSuccess).toHaveBeenCalledWith(res, mockReqs);
    });

    it('handles service error', async () => {
      const { RequestService } = require('@/properties/services/request');
      RequestService.getAllSaspRequest.mockRejectedValue(new Error('fail'));

      const req = { user: { id: 77 }, query: {} } as unknown as Request;
      const res = createMockResponse();

      await controller.getRequestForSasp(req, res);

      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when userId missing', async () => {
      const req = { query: {} } as unknown as Request;
      const res = createMockResponse();

      await controller.getRequestForSasp(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });


  // pickupApproval
  describe('pickupApproval', () => {
    const controller = require('./request');
    const requestId = 900;
    const propertyId1 = 901;
    const propertyId2 = 902;

    beforeEach(() => {
      jest.clearAllMocks();
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.updateCompetingStatusAfterChange = jest.fn();
      const { withTransaction } = require('@/utils/transactionalOperation');
      (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    });

    it('approves pickup successfully and updates request status', async () => {
      const { PropertyService } = require('@/properties/services/property');
      const { RequestService } = require('@/properties/services/request');
      const { RequestStatusEnum } = require('@/enums/request-property-status.enum');
      const { PropertyStatusEnum } = require('@/enums/request-property-status.enum');

      // Arrange
      PropertyService.getPropertyById
        .mockResolvedValue({ id: propertyId1, request_id: requestId, is_cancelled: false, property_allocated_date: Date.now() });
      PropertyService.updateProperty.mockResolvedValue({});
      PropertyService.getAllPropertiesByRequestId.mockResolvedValue([{ property_status: PropertyStatusEnum.PICKUP_APPROVED }]); // no evidence required => updateRequest
      RequestService.updateRequest.mockResolvedValue({ id: requestId, status: RequestStatusEnum.INVOICE_REQUIRED });

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId1] } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.pickupApproval(req, res);

      // Assert
      expect(PropertyService.updateProperty).toHaveBeenCalledWith(propertyId1, expect.any(Object), expect.anything());
      expect(RequestService.updateRequest).toHaveBeenCalledWith(requestId, { status: RequestStatusEnum.INVOICE_REQUIRED }, expect.anything());
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('errors when any property does not belong to request', async () => {
      const { PropertyService } = require('@/properties/services/property');

      PropertyService.getPropertyById
        .mockResolvedValueOnce({ id: propertyId1, request_id: requestId, is_cancelled: false, property_allocated_date: Date.now() })
        .mockResolvedValueOnce({ id: propertyId2, request_id: 999, is_cancelled: false, property_allocated_date: Date.now() });

      const req = { params: { requestId: String(requestId) }, body: { propertyIds: [propertyId1, propertyId2] } } as unknown as Request;
      const res = createMockResponse();

      await controller.pickupApproval(req, res);

      expect(sendError).toHaveBeenCalled();
    });
  });


  // markPropertiesAsPickedUpInRequest
  describe('markPropertiesAsPickedUpInRequest', () => {
    const controller = require('./request');
    const requestId = 850;
    const propertyId = 851;
    const attachmentId = 99;

    beforeEach(() => {
      jest.clearAllMocks();
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.updateCompetingStatusAfterChange = jest.fn();
      const { withTransaction } = require('@/utils/transactionalOperation');
      (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    });

    it('updates properties and sets awaiting_pickup_approval status', async () => {
      const { PropertyService } = require('@/properties/services/property');
      const { RequestService } = require('@/properties/services/request');
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      const { RequestStatusEnum, PropertyStatusEnum } = require('@/enums/request-property-status.enum');

      // Arrange
      PropertyService.getPropertyById.mockResolvedValue({ property_id: propertyId, request_id: requestId, is_picked_up: false, is_cancelled: false, property_status: PropertyStatusEnum.PICKUP_EVIDENCE_REQUIRED, property_allocated_date: Date.now() });
      RequestAttachmentService.getAttachment.mockResolvedValue({ id: attachmentId, file_path: '/path/evidence.jpg' });
      PropertyService.updateProperty.mockResolvedValue({});
      PropertyService.getAllPropertiesByRequestId.mockResolvedValue([
        { property_status: PropertyStatusEnum.PICKUP_EVIDENCE_SUBMITTED, is_cancelled: false, is_denied: false },
      ]);
      RequestService.updateRequest.mockResolvedValue({ id: requestId, status: RequestStatusEnum.AWATING_PICKUP_APPROVAL });

      const req = { params: { requestId: String(requestId) }, body: { properties: [{ property_id: propertyId, attachment_id: attachmentId }] } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.markPropertiesAsPickedUpInRequest(req, res);

      // Assert
      expect(PropertyService.updateProperty).toHaveBeenCalledWith(propertyId, expect.objectContaining({ is_picked_up: true }), expect.anything());
      expect(RequestService.updateRequest).toHaveBeenCalledWith(requestId, { status: RequestStatusEnum.AWATING_PICKUP_APPROVAL }, expect.anything());
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('returns error when LOAR is missing', async () => {
      const { PropertyService } = require('@/properties/services/property');
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');

      PropertyService.getPropertyById.mockResolvedValue({ property_id: propertyId, request_id: requestId, is_picked_up: false, is_cancelled: false, property_status: 'pickup_evidence_required', property_allocated_date: Date.now() });
      RequestAttachmentService.getAttachment.mockResolvedValue(null); // attachment missing

      const req = { params: { requestId: String(requestId) }, body: { properties: [{ property_id: propertyId, attachment_id: attachmentId }] } } as unknown as Request;
      const res = createMockResponse();

      await controller.markPropertiesAsPickedUpInRequest(req, res);

      expect(sendError).toHaveBeenCalled();
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
    });
  });


  // updatePropertyStatusInRequest
  describe('updatePropertyStatusInRequest', () => {
    const controller = require('./request');
    const requestId = 760;
    const propertyId1 = 761;
    const { PropertyStatusEnum } = require('@/enums/request-property-status.enum');

    beforeEach(() => {
      jest.clearAllMocks();
      const { withTransaction } = require('@/utils/transactionalOperation');
      (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    });

    it('updates allowed property statuses successfully', async () => {
      const { PropertyService } = require('@/properties/services/property');

      // Arrange mocks: property belongs to request and not cancelled
      PropertyService.getPropertyById.mockResolvedValue({ property_id: propertyId1, request_id: requestId, property_status: 'competing' });
      PropertyService.updateProperty.mockResolvedValue({});

      const req = {
        params: { requestId: String(requestId) },
        body: { properties: [{ property_id: propertyId1, status: PropertyStatusEnum.CANNIBALIZE }] },
      } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.updatePropertyStatusInRequest(req, res);

      // Assert
      expect(PropertyService.updateProperty).toHaveBeenCalledWith(propertyId1, { property_status: PropertyStatusEnum.CANNIBALIZE }, expect.anything());
      expect(sendSuccess).toHaveBeenCalledWith(res, { message: 'Properties updated successfuly' });
    });

    it('errors when property does not belong to request', async () => {
      // Arrange
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ property_id: propertyId1, request_id: 999, property_status: 'competing' });

      const req = { params: { requestId: String(requestId) }, body: { properties: [{ property_id: propertyId1, status: PropertyStatusEnum.COMPETING }] } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.updatePropertyStatusInRequest(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
    });

    it('errors when status not allowed', async () => {
      // Arrange
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ property_id: propertyId1, request_id: requestId, property_status: 'competing' });

      const req = { params: { requestId: String(requestId) }, body: { properties: [{ property_id: propertyId1, status: 'invalid_status' }] } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.updatePropertyStatusInRequest(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('errors when property already canceled', async () => {
      // Arrange
      const { PropertyService } = require('@/properties/services/property');
      PropertyService.getPropertyById.mockResolvedValue({ property_id: propertyId1, request_id: requestId, property_status: PropertyStatusEnum.CANCELED });

      const req = { params: { requestId: String(requestId) }, body: { properties: [{ property_id: propertyId1, status: PropertyStatusEnum.ABANDONN_AND_DESTROY }] } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.updatePropertyStatusInRequest(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
      expect(PropertyService.updateProperty).not.toHaveBeenCalled();
    });
  });


  // addMatchingPropertyToRequest
  describe('addMatchingPropertyToRequest', () => {
    const controller = require('./request');
    const requestId = 880;
    const icn = 'NY123456789';
    const { automaticPropertySchema } = require('@/properties/validators/propertySchema');

    beforeEach(() => {
      jest.clearAllMocks();
      const { withTransaction } = require('@/utils/transactionalOperation');
      (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    });

    it('adds property successfully', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      const { DoneeAccountService } = require('@/organization/services/donee');
      const { PropertyService } = require('@/properties/services/property');
      const { mapDiskPropertyToDbSchema } = require('@/utils/property');
      const { NotificationType } = require('@/notifications/services/notification-factory.service');
      const diskProp = { data: { quantity: 5, surplusReleaseDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString() } };

      PropertyDataService.getPropertyDetails.mockResolvedValue(diskProp);
      DoneeAccountService.getDoneeAccountByRequestId.mockResolvedValue({ id: 10 });
      PropertyService.checkDuplicatePropertyByICN = jest.fn().mockResolvedValue(undefined);
      PropertyService.createProperty = jest.fn().mockResolvedValue({ id: 7 });

      const req = { params: { requestId: String(requestId), icn }, body: { property_quantity: 2, property_justification: 'Need' } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.addMatchingPropertyToRequest(req, res);

      // Assert
      expect(automaticPropertySchema).toHaveBeenCalled();
      expect(PropertyDataService.getPropertyDetails).toHaveBeenCalledWith(icn);
      expect(mapDiskPropertyToDbSchema).toHaveBeenCalled();
      expect(PropertyService.createProperty).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('errors when quantity exceeds available', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValue({ data: { quantity: 1, surplusReleaseDate: new Date(Date.now() + 24 * 3600 * 1000).toISOString() } });

      const req = { params: { requestId: String(requestId), icn }, body: { property_quantity: 10, property_justification: 'Need' } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.addMatchingPropertyToRequest(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('errors when surplus release date passed', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValue({ data: { quantity: 5, surplusReleaseDate: new Date(Date.now() - 24 * 3600 * 1000).toISOString() } });

      const req = { params: { requestId: String(requestId), icn }, body: { property_quantity: 1, property_justification: 'Need' } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.addMatchingPropertyToRequest(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // createRequestAttachment
  describe('createRequestAttachment', () => {
    const controller = require('./request');
    beforeEach(() => jest.clearAllMocks());

    it('uploads attachment successfully', async () => {
      // Arrange
      const { saveUploadedFile } = require('@/utils/storage/fileSystem');
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      const { NotificationType } = require('@/notifications/services/notification-factory.service');

      (saveUploadedFile as jest.Mock).mockResolvedValue('/tmp/path/file.txt');
      RequestAttachmentService.createAttachment.mockResolvedValue({ id: 1 });

      const req = {
        params: { requestId: '10' },
        file: { buffer: Buffer.from('data'), originalname: 'file.txt' },
        body: { display_name: 'File', attachment_type: 'OTHER' },
        user: { name: 'Tester' },
        request: {
          doneeAccount: { id: 3, organization: { id: 4 } },
          organization: { id: 4 },
        },
      } as unknown as Request & { file: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.createRequestAttachment(req, res);

      // Assert
      expect(saveUploadedFile).toHaveBeenCalled();
      expect(RequestAttachmentService.createAttachment).toHaveBeenCalledWith(10, req.user, '/tmp/path/file.txt', 'OTHER', 'File');
      expect(sendSuccess).toHaveBeenCalledWith(res, {}, 201);
    });

    it('returns error when doneeAccount missing', async () => {
      // Arrange
      const req = {
        params: { requestId: '10' },
        file: { buffer: Buffer.from('data'), originalname: 'file.txt' },
        body: { display_name: 'File', attachment_type: 'OTHER' },
        request: { doneeAccount: null },
      } as unknown as Request & { file: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.createRequestAttachment(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when invalid requestId', async () => {
      // Arrange
      const req = {
        params: { requestId: 'abc' },
        file: { buffer: Buffer.from('data'), originalname: 'file.txt' },
        body: { display_name: 'File', attachment_type: 'OTHER' },
        request: { doneeAccount: { id: 1, organization: { id: 2 } } },
      } as unknown as Request & { file: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.createRequestAttachment(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when organization missing', async () => {
      // Arrange
      const req = {
        params: { requestId: '10' },
        file: { buffer: Buffer.from('data'), originalname: 'file.txt' },
        body: { display_name: 'File', attachment_type: 'OTHER' },
        request: { doneeAccount: { id: 1, organization: null } },
      } as unknown as Request & { file: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.createRequestAttachment(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // getMatchingPropertiesForRequest
  describe('getMatchingPropertiesForRequest', () => {
    const controller = require('./request');
    beforeEach(() => jest.clearAllMocks());

    it('returns matching properties successfully', async () => {
      // Arrange
      const { PropertyService } = require('@/properties/services/property');
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      const { convertUnixTime } = require('@/utils/timeHelper');

      const propertyMock = {
        property_control_number: 'NY123456',
        property_surplus_release_date: Date.now(),
        property_location_city: 'NYC',
        property_location_region_state: 'NY',
        property_location_postal_code: '10001',
      };

      PropertyService.getPropertiesByRequestId.mockResolvedValue([propertyMock]);
      (convertUnixTime as jest.Mock).mockReturnValue('07/22/2025');
      PropertyDataService.getAllPropertiesSummary.mockResolvedValue({ results: [] });

      const req = { params: { requestId: '5' }, query: {} } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.getMatchingPropertiesForRequest(req, res);

      // Assert
      expect(PropertyDataService.getAllPropertiesSummary).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('returns 404 when no properties found', async () => {
      // Arrange
      const { PropertyService } = require('@/properties/services/property');

      PropertyService.getPropertiesByRequestId.mockResolvedValue([]);

      const req = { params: { requestId: '5' }, query: {} } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.getMatchingPropertiesForRequest(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // getRequestAttachments
  describe('getRequestAttachments', () => {
    const controller = require('./request');
    beforeEach(() => jest.clearAllMocks());

    it('returns paginated attachments', async () => {
      // Arrange
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      const { paginateArray } = require('@/utils/pagination');
      RequestAttachmentService.getAttachments.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const req = { params: { requestId: '20' }, query: { page: '1', limit: '10' } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.getRequestAttachments(req, res);

      // Assert
      expect(RequestAttachmentService.getAttachments).toHaveBeenCalledWith({ request_id: 20 });
      expect(paginateArray).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('returns error when service throws', async () => {
      // Arrange
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      RequestAttachmentService.getAttachments.mockRejectedValue(new Error('db err'));

      const req = { params: { requestId: '20' }, query: {} } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.getRequestAttachments(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // getRequestAttachment
  describe('getRequestAttachment', () => {
    const controller = require('./request');
    beforeEach(() => jest.clearAllMocks());

    it('streams attachment successfully', async () => {
      // Arrange
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      const { fileExists, getFileMimeType, readFile } = require('@/utils/storage/fileSystem');

      RequestAttachmentService.getAttachment.mockResolvedValue({ file_path: '/tmp/file.pdf' });
      (fileExists as jest.Mock).mockResolvedValue(true);
      (getFileMimeType as jest.Mock).mockReturnValue('application/pdf');
      (readFile as jest.Mock).mockResolvedValue(Buffer.from('pdfdata'));

      const req = { params: { requestId: '20', attachmentId: '2' } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.getRequestAttachment(req, res);

      // Assert
      expect(RequestAttachmentService.getAttachment).toHaveBeenCalledWith({ id: 2, request_id: 20 });
      expect(fileExists).toHaveBeenCalledWith('/tmp/file.pdf');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalled();
    });

    it('returns 404 when attachment missing', async () => {
      // Arrange
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      RequestAttachmentService.getAttachment.mockResolvedValue(null);

      const req = { params: { requestId: '20', attachmentId: '99' } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.getRequestAttachment(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('returns 404 when file not found', async () => {
      // Arrange
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      const { fileExists } = require('@/utils/storage/fileSystem');
      RequestAttachmentService.getAttachment.mockResolvedValue({ file_path: '/missing/file' });
      (fileExists as jest.Mock).mockResolvedValue(false);

      const req = { params: { requestId: '20', attachmentId: '2' } } as unknown as Request;
      const res = createMockResponse();

      // Act
      await controller.getRequestAttachment(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // updateLoarShipping
  describe('updateLoarShipping', () => {
    const controller = require('./request');
    const requestId = 99;
    const attachmentId = 5;
    const user = { id: 1 };

    beforeEach(() => jest.clearAllMocks());

    it('updates shipping info successfully', async () => {
      // Arrange
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      const { PropertyService } = require('@/properties/services/property');
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      const { RequestService } = require('@/properties/services/request');
      const { LoarService } = require('@/loar/services/loar');

      RequestAttachmentService.getAttachment.mockResolvedValue({ id: attachmentId, file_path: '/loar.pdf' });
      PropertyService.getPropertiesByRequestId.mockResolvedValue([{ property_allocated_quantity: 1, property_control_number: 'ICN1' }]);
      PropertyDataService.getManyPropertyDetails.mockResolvedValue([{ icn: 'ICN1' }]);
      RequestService.getRequestById.mockResolvedValue({ id: requestId });

      const req = {
        params: { requestId: String(requestId), attachmentId: String(attachmentId) },
        body: { shipping_name: 'FedEx' },
        user,
      } as unknown as Request & { user: any };
      const res = createMockResponse();

      // Act
      await controller.updateLoarShipping(req, res);

      // Assert
      expect(LoarService.updateShipping).toHaveBeenCalled();
      expect(sendSuccess).toHaveBeenCalled();
    });

    it('returns error when shipping_name missing', async () => {
      // Arrange
      const req = {
        params: { requestId: String(requestId), attachmentId: String(attachmentId) },
        body: {},
        user,
      } as unknown as Request & { user: any };
      const res = createMockResponse();

      // Act
      await controller.updateLoarShipping(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when requestId missing', async () => {
      // Arrange
      const req = { params: { attachmentId: String(attachmentId) }, body: { shipping_name: 'A' }, user } as unknown as Request & { user: any };
      const res = createMockResponse();

      // Act
      await controller.updateLoarShipping(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when attachmentId missing', async () => {
      // Arrange
      const req = { params: { requestId: String(requestId) }, body: { shipping_name: 'A' }, user } as unknown as Request & { user: any };
      const res = createMockResponse();

      // Act
      await controller.updateLoarShipping(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });

    it('returns error when loarAttachment not found', async () => {
      // Arrange
      const { RequestAttachmentService } = require('@/properties/services/requestAttachment');
      RequestAttachmentService.getAttachment.mockResolvedValue(null);

      const req = { params: { requestId: String(requestId), attachmentId: String(attachmentId) }, body: { shipping_name: 'FedEx' }, user } as unknown as Request & { user: any };
      const res = createMockResponse();

      // Act
      await controller.updateLoarShipping(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // generateInvoice
  describe('generateInvoice', () => {
    const controller = require('./request');
    const requestId = 200;
    const user = { id: 2 };

    beforeEach(() => jest.clearAllMocks());

    it('generates invoice successfully', async () => {
      // Arrange
      const { RequestService } = require('@/properties/services/request');
      const { DocumentActionType } = require('@/documents/services/document-factory.service');
      const DocFactory = require('@/documents/services/document-factory.service').default;

      const doneeAccount = { id: 7, organization: { id: 8 } };
      const mockRequest = { id: requestId, doneeAccount, update: jest.fn() };
      const req = { params: { requestId: String(requestId) }, body: { invoiceSerie: 'SERIE1' }, user, request: mockRequest } as unknown as Request & { user: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.generateInvoice(req, res);

      // Assert
      expect(DocFactory.handler).toHaveBeenCalledWith(DocumentActionType.GENERATE_INVOICE, { request: mockRequest, createdBy: user, invoiceSerie: 'SERIE1' }, expect.anything());
      expect(sendSuccess).toHaveBeenCalledWith(res, {}, 201);
    });

    it('returns error when doneeAccount missing', async () => {
      // Arrange
      const mockRequest = { id: requestId, doneeAccount: null };
      const req = { params: { requestId: String(requestId) }, body: {}, user, request: mockRequest } as unknown as Request & { user: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.generateInvoice(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });


  // reportInvoicePayment
  describe('reportInvoicePayment', () => {
    const controller = require('./request');
    const requestId = 3000;
    const requestAttachmentId = 55;
    const user = { id: 9 };

    beforeEach(() => jest.clearAllMocks());

    it('reports invoice payment successfully', async () => {
      // Arrange
      const { RequestService } = require('@/properties/services/request');
      const { NotificationType } = require('@/notifications/services/notification-factory.service');
      const NotifFactory = require('@/notifications/services/notification-factory.service').default;

      RequestService.requestToMarkInvoiceAsPaid.mockResolvedValue({});

      const req = {
        params: { requestId: String(requestId) },
        body: { requestAttachmentId, memo: 'Paid via ACH' },
        user,
        request: { id: requestId, doneeAccount: {}, update: jest.fn() },
      } as unknown as Request & { user: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.reportInvoicePayment(req, res);

      // Assert
      expect(RequestService.requestToMarkInvoiceAsPaid).toHaveBeenCalledWith({ requestAttachmentId, signedBy: user, memo: 'Paid via ACH' }, expect.anything());
      expect(NotifFactory.createNotification).toHaveBeenCalledWith(NotificationType.INVOICE_PAYMENT_REQUESTED, { request: expect.any(Object) });
      expect(sendSuccess).toHaveBeenCalledWith(res, {}, 201);
    });

    it('returns error when doneeAccount missing', async () => {
      // Arrange
      const req = { params: { requestId: String(requestId) }, body: { requestAttachmentId, memo: '' }, user, request: { id: requestId, doneeAccount: null } } as unknown as Request & { user: any; request: any };
      const res = createMockResponse();

      // Act
      await controller.reportInvoicePayment(req, res);

      // Assert
      expect(sendError).toHaveBeenCalled();
    });
  });
});
