import { allocateRequestProperties } from '@/orchestration/controllers/request';
import type { Request, Response } from 'express';

jest.mock('@/utils/response/responseHelper', () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
}));

jest.mock('@/utils/validators', () => ({
  parseId: jest.fn((v: string | number) => Number(v)),
}));

jest.mock('@/utils/transactionalOperation', () => ({
  withTransaction: jest.fn(),
}));

jest.mock('@/properties/services/property', () => ({
  PropertyService: {
    getPropertyById: jest.fn(),
    updateProperty: jest.fn(),
    getAllPropertiesByRequestId: jest.fn(),
    getRequestAllocationStatus: jest.fn(),
  },
}));

jest.mock('@/properties/services/request', () => ({
  RequestService: {
    getRequestById: jest.fn(),
    updateRequest: jest.fn(),
    getUserByRequestId: jest.fn(),
  },
}));

jest.mock('@/ppms/services/propertyData', () => ({
  PropertyDataService: { getPropertyDetails: jest.fn() },
}));

jest.mock('@/utils/property', () => ({
  isPropertyVehicle: jest.fn(() => false),
  mapDiskPropertyToDbSchema: jest.fn(),
}));

jest.mock('@/utils/mail/render', () => ({ renderEmail: jest.fn(async () => '<html></html>') }));
jest.mock('@/utils/mail/emailQueue', () => ({ emailQueue: { add: jest.fn() } }));

jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: { createNotification: jest.fn() },
  NotificationType: { PROPERTIES_ALLOCATED: 'propertiesAllocated' },
}));

const { sendSuccess, sendError } = require('@/utils/response/responseHelper');
const { PropertyService } = require('@/properties/services/property');
const { RequestService } = require('@/properties/services/request');
const { withTransaction } = require('@/utils/transactionalOperation');

const createMockResponse = (): Response =>
  ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }) as unknown as Response;

const buildProperty = (overrides: Record<string, unknown>) => ({
  request_id: 850,
  is_cancelled: false,
  is_picked_up: false,
  property_status: 'pickup_ready',
  property_quantity: 1,
  property_original_value: 1000,
  property_control_number: 'PCN',
  property_name: 'Property',
  ...overrides,
});

/**
 * SDN-1379: re-allocating a request must not reset the status of a property that is
 * already picked up. Such a property is skipped instead of being re-written.
 */
describe('allocateRequestProperties — skips already-picked-up properties (SDN-1379)', () => {
  const requestId = 850;

  beforeEach(() => {
    jest.clearAllMocks();
    (withTransaction as jest.Mock).mockImplementation(async (fn: any) => await fn({}));
    RequestService.getRequestById.mockResolvedValue({
      id: requestId, tcn: 'FL-25-000001',
      doneeAccount: { name: 'Donee', state: { stateName: 'FL' }, organization: { name: 'Org' } },
    });
    RequestService.getUserByRequestId.mockResolvedValue({ name: 'User', email: 'ozturkgokalp000@gmail.com' });
    PropertyService.updateProperty.mockResolvedValue({});
    PropertyService.getAllPropertiesByRequestId.mockResolvedValue([]);
    PropertyService.getRequestAllocationStatus.mockReturnValue('allocated');
    RequestService.updateRequest.mockResolvedValue({});
  });

  it('does not re-allocate a picked-up property, processes the fresh one', async () => {
    const pickedUpId = 230;
    const freshId = 999;
    PropertyService.getPropertyById
      .mockResolvedValueOnce(buildProperty({ property_id: pickedUpId, is_picked_up: true, property_status: 'pickup_evidence_required' }))
      .mockResolvedValueOnce(buildProperty({ property_id: freshId }));

    const req = { params: { requestId: String(requestId) }, body: { allocations: [{ property_id: pickedUpId, allocated: 1 }, { property_id: freshId, allocated: 1 }] } } as unknown as Request;
    const res = createMockResponse();

    await allocateRequestProperties(req, res);

    expect(PropertyService.updateProperty).toHaveBeenCalledTimes(1);
    expect(PropertyService.updateProperty).toHaveBeenCalledWith(freshId, expect.any(Object), expect.anything());
    expect(PropertyService.updateProperty).not.toHaveBeenCalledWith(pickedUpId, expect.anything(), expect.anything());
    expect(sendSuccess).toHaveBeenCalled();
  });

  it('a batch of only picked-up properties updates nothing', async () => {
    PropertyService.getPropertyById.mockResolvedValue(buildProperty({ property_id: 230, is_picked_up: true, property_status: 'pickup_evidence_required' }));

    const req = { params: { requestId: String(requestId) }, body: { allocations: [{ property_id: 230, allocated: 1 }] } } as unknown as Request;
    const res = createMockResponse();

    await allocateRequestProperties(req, res);

    expect(PropertyService.updateProperty).not.toHaveBeenCalled();
    expect(sendError).not.toHaveBeenCalled();
  });
});
