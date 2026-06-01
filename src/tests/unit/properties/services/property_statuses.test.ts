import { PropertyService } from '@/properties/services/property';
import Property from '@/properties/models/Property';
import { PropertyStatusEnum } from '@/enums/request-property-status.enum';
import { PropertyDataService } from '@/ppms/services/propertyData';

jest.mock('log4js', () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    addContext: jest.fn(),
  }),
  configure: jest.fn(),
}));

jest.mock('@/utils/cache', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    deleteSmart: jest.fn().mockResolvedValue(undefined),
  },
  cacheKeys: {
    doneeProperty: {
      key: (id: string) => `/properties/donee/${id}`,
    },
  },
}));

jest.mock('@/utils/database', () => ({
  database: {
    close: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/properties/models/Property', () => {
  class MockProperty {
    static create = jest.fn();
    static update = jest.fn();
    static findByPk = jest.fn();
    static findAll = jest.fn();
  }
  return { __esModule: true, default: MockProperty };
});

jest.mock('@/ppms/services/propertyData');

// Stub other sequelize models that PropertyService imports to avoid init errors
jest.mock('@/organization/models/DoneeAccount', () => ({ 
  __esModule: true, 
  default: { init: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() }
}));
jest.mock('@/properties/models/Request', () => ({ 
  __esModule: true, 
  default: { init: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() }
}));
jest.mock('@/authn/models/User', () => ({ 
  __esModule: true, 
  default: { init: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() }
}));
jest.mock('@/states/models/State', () => ({ 
  __esModule: true, 
  default: { init: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() }
}));
jest.mock('@/organization/models/Organization', () => ({ 
  __esModule: true, 
  default: { init: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() }
}));
jest.mock('@/organization/models/OrganizationUser', () => ({ 
  __esModule: true, 
  default: { init: jest.fn(), findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), update: jest.fn() }
}));

describe('PropertyService - Property Status Logic', () => {
    const mockedPropertyModel = Property as jest.Mocked<typeof Property>;
    const mockedPropertyDataService = PropertyDataService as jest.Mocked<typeof PropertyDataService>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createProperty', () => {
        const sampleProperty = {
            property_id: 1,
            property_control_number: 'ICN123',
            property_quantity: 5,
        } as any;

        it('should set property status to COMPETING when isCompeting returns true', async () => {
            // Arrange
            mockedPropertyModel.create.mockResolvedValue(sampleProperty);
            jest.spyOn(PropertyService, 'isCompeting').mockResolvedValue(true);

            // Act
            await PropertyService.createProperty(sampleProperty as any);

            // Assert
            expect(mockedPropertyModel.update).toHaveBeenCalledWith(
                { property_status: PropertyStatusEnum.COMPETING },
                expect.objectContaining({ where: expect.any(Object) }),
            );
        });

        it('should NOT set property status when isCompeting returns false', async () => {
            // Arrange
            mockedPropertyModel.create.mockResolvedValue(sampleProperty);
            jest.spyOn(PropertyService, 'isCompeting').mockResolvedValue(false);

            // Act
            await PropertyService.createProperty(sampleProperty as any);

            // Assert
            expect(mockedPropertyModel.update).not.toHaveBeenCalled();
        });
    });

    describe('updateCompetingStatusAfterChange', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should not make any changes when property is not found', async () => {
            const propertyId = 999;
            
            // Setup: Property doesn't exist
            mockedPropertyModel.findByPk.mockResolvedValue(null);
            
            // Act
            await PropertyService.updateCompetingStatusAfterChange(propertyId);
            
            // Assert: No database updates should occur
            expect(mockedPropertyModel.findAll).not.toHaveBeenCalled();
            expect(mockedPropertyDataService.getPropertyDetails).not.toHaveBeenCalled();
            expect(mockedPropertyModel.update).not.toHaveBeenCalled();
        });

        it('should not make any changes when property is not competing', async () => {
            const propertyId = 1;
            const propertyRecord: any = {
                property_id: propertyId,
                property_control_number: 'ICN123',
                property_status: PropertyStatusEnum.CANCELED, // Not competing
                is_cancelled: false,
            };

            // Setup: Property exists but is not competing
            mockedPropertyModel.findByPk.mockResolvedValue(propertyRecord);
            
            // Act
            await PropertyService.updateCompetingStatusAfterChange(propertyId);
            
            // Assert: No further database calls should occur
            expect(mockedPropertyModel.findAll).not.toHaveBeenCalled();
            expect(mockedPropertyDataService.getPropertyDetails).not.toHaveBeenCalled();
            expect(mockedPropertyModel.update).not.toHaveBeenCalled();
        });

        it('should not make any changes when competition continues after change', async () => {
            const propertyId = 1;
            const propertyRecord: any = {
                property_id: propertyId,
                property_control_number: 'ICN456',
                property_status: PropertyStatusEnum.COMPETING,
                is_cancelled: false,
                property_denied_quantity: 0,
            };

            // Setup: Competition continues (requested > available)
            mockedPropertyModel.findByPk.mockResolvedValue(propertyRecord);
            mockedPropertyModel.findAll.mockResolvedValue([
                { property_id: 2, property_quantity: 8, property_denied_quantity: 0 },
                { property_id: 3, property_quantity: 5, property_denied_quantity: 0 },
            ] as any);
            mockedPropertyDataService.getPropertyDetails.mockResolvedValue({ 
                data: { quantity: 10 } // Total requested (13) > available (10)
            } as any);
            
            // Act
            await PropertyService.updateCompetingStatusAfterChange(propertyId);
            
            // Assert: No status update should occur since competition continues
            expect(mockedPropertyModel.findAll).toHaveBeenCalledWith({
                where: {
                    property_control_number: 'ICN456',
                    is_cancelled: false,
                },
                transaction: undefined,
            });
            expect(mockedPropertyDataService.getPropertyDetails).toHaveBeenCalledWith('ICN456');
            expect(mockedPropertyModel.update).not.toHaveBeenCalled();
        });

        it('should reset competing status when competition is resolved', async () => {
            const propertyId = 1;
            const propertyRecord: any = {
                property_id: propertyId,
                property_control_number: 'ICN789',
                property_status: PropertyStatusEnum.COMPETING,
                is_cancelled: false,
            };

            // Setup: Competition resolved (requested < available)
            mockedPropertyModel.findByPk.mockResolvedValue(propertyRecord);
            mockedPropertyModel.findAll.mockResolvedValue([
                { property_id: 2, property_quantity: 3, property_denied_quantity: 0 },
                { property_id: 3, property_quantity: 2, property_denied_quantity: 0 },
            ] as any);
            mockedPropertyDataService.getPropertyDetails.mockResolvedValue({ 
                data: { quantity: 10 } // Total requested (5) < available (10)
            } as any);
            
            // Act
            await PropertyService.updateCompetingStatusAfterChange(propertyId);
            
            // Assert: Status should be reset for all non-cancelled, non-denied properties
            expect(mockedPropertyModel.update).toHaveBeenCalledWith(
                { property_status: undefined },
                {
                    where: {
                        property_control_number: 'ICN789',
                        is_cancelled: false,
                        is_denied: false,
                    },
                    transaction: undefined,
                }
            );
        });

        it('should handle denied quantities correctly in calculation', async () => {
            const propertyId = 1;
            const propertyRecord: any = {
                property_id: propertyId,
                property_control_number: 'ICN101',
                property_status: PropertyStatusEnum.COMPETING,
                is_cancelled: false,
                property_denied_quantity: 2,
            };

            // Setup: Include denied quantities in calculation
            mockedPropertyModel.findByPk.mockResolvedValue(propertyRecord);
            mockedPropertyModel.findAll.mockResolvedValue([
                { property_id: 2, property_quantity: 8, property_denied_quantity: 3 }, // Effective: 5
                { property_id: 3, property_quantity: 4, property_denied_quantity: 1 }, // Effective: 3
            ] as any);
            mockedPropertyDataService.getPropertyDetails.mockResolvedValue({ 
                data: { quantity: 10 } // Total effective requested (8) < available (10)
            } as any);
            
            // Act
            await PropertyService.updateCompetingStatusAfterChange(propertyId);
            
            // Assert: Should reset status since competition is resolved after accounting for denied quantities
            expect(mockedPropertyModel.update).toHaveBeenCalledWith(
                { property_status: undefined },
                {
                    where: {
                        property_control_number: 'ICN101',
                        is_cancelled: false,
                        is_denied: false,
                    },
                    transaction: undefined,
                }
            );
        });

        it('should pass transaction parameter through all database calls', async () => {
            const propertyId = 1;
            const transaction = { id: 'test-transaction' } as any;
            const propertyRecord: any = {
                property_id: propertyId,
                property_control_number: 'ICN202',
                property_status: PropertyStatusEnum.COMPETING,
                is_cancelled: false,
            };

            // Setup
            mockedPropertyModel.findByPk.mockResolvedValue(propertyRecord);
            mockedPropertyModel.findAll.mockResolvedValue([
                { property_id: 2, property_quantity: 2, property_denied_quantity: 0 },
            ] as any);
            mockedPropertyDataService.getPropertyDetails.mockResolvedValue({ 
                data: { quantity: 10 }
            } as any);
            
            // Act
            await PropertyService.updateCompetingStatusAfterChange(propertyId, transaction);
            
            // Assert: Transaction should be passed to all database calls
            expect(mockedPropertyModel.findByPk).toHaveBeenCalledWith(propertyId, { transaction });
            expect(mockedPropertyModel.findAll).toHaveBeenCalledWith({
                where: {
                    property_control_number: 'ICN202',
                    is_cancelled: false,
                },
                transaction,
            });
            expect(mockedPropertyModel.update).toHaveBeenCalledWith(
                { property_status: undefined },
                {
                    where: {
                        property_control_number: 'ICN202',
                        is_cancelled: false,
                        is_denied: false,
                    },
                    transaction,
                }
            );
        });

        it('should handle edge case with zero quantities', async () => {
            const propertyId = 1;
            const propertyRecord: any = {
                property_id: propertyId,
                property_control_number: 'ICN303',
                property_status: PropertyStatusEnum.COMPETING,
                is_cancelled: false,
            };

            // Setup: Properties with zero or null quantities
            mockedPropertyModel.findByPk.mockResolvedValue(propertyRecord);
            mockedPropertyModel.findAll.mockResolvedValue([
                { property_id: 2, property_quantity: 0, property_denied_quantity: 0 },
                { property_id: 3, property_quantity: null, property_denied_quantity: null },
            ] as any);
            mockedPropertyDataService.getPropertyDetails.mockResolvedValue({ 
                data: { quantity: 5 }
            } as any);
            
            // Act
            await PropertyService.updateCompetingStatusAfterChange(propertyId);
            
            // Assert: Should handle zero/null quantities gracefully and reset status
            expect(mockedPropertyModel.update).toHaveBeenCalledWith(
                { property_status: undefined },
                {
                    where: {
                        property_control_number: 'ICN303',
                        is_cancelled: false,
                        is_denied: false,
                    },
                    transaction: undefined,
                }
            );
        });
    });

    describe('error paths', () => {
        it('should propagate errors when DB update fails during createProperty', async () => {
            const sampleProperty = {
                property_id: 1,
                property_control_number: 'ICN_ERR',
                property_quantity: 1,
            } as any;

            mockedPropertyModel.create.mockResolvedValue(sampleProperty);
            jest.spyOn(PropertyService, 'isCompeting').mockResolvedValue(true);
            mockedPropertyModel.update.mockRejectedValue(new Error('db failure'));

            await expect(PropertyService.createProperty(sampleProperty as any)).rejects.toThrow('db failure');
        });
    });

    describe('getRequestAllocationStatus', () => {
        const makeProp = (overrides: Partial<any>) => ({
            is_cancelled: false,
            property_quantity: 10,
            property_allocated_quantity: 0,
            property_denied_quantity: 0,
            ...overrides,
        });

        it('returns CANCELED when all properties are cancelled', () => {
            const props = [makeProp({ is_cancelled: true }), makeProp({ is_cancelled: true })];
            expect(PropertyService.getRequestAllocationStatus(props as any)).toBe('canceled');
        });

        it('returns ALLOCATED when allocated equals total quantity', () => {
            const props = [makeProp({ property_allocated_quantity: 10 })];
            expect(PropertyService.getRequestAllocationStatus(props as any)).toBe('allocated');
        });

        it('returns DENIED when denied equals total quantity', () => {
            const props = [makeProp({ property_denied_quantity: 10 })];
            expect(PropertyService.getRequestAllocationStatus(props as any)).toBe('denied');
        });

        it('returns PARTIALLY_ALLOCATED when mix of allocated and denied', () => {
            const props = [
                makeProp({ property_allocated_quantity: 5 }),
                makeProp({ property_denied_quantity: 5 }),
            ];
            expect(PropertyService.getRequestAllocationStatus(props as any)).toBe('partially_allocated');
        });

        it('returns undefined when no allocation or denial yet', () => {
            const props = [makeProp({})];
            expect(PropertyService.getRequestAllocationStatus(props as any)).toBeUndefined();
        });
    });
});

afterAll(async () => {
  // Ensure any mocked DB connections are closed to prevent Jest open-handle warning
  const { database } = await import('@/utils/database');
  const closeFn = (database as any).close;
  if (typeof closeFn === 'function') await closeFn();
});