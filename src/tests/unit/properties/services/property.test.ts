// Mock BullMQ Worker to prevent Redis connection attempts
jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn(),
  })),
}));

import { PropertyService } from '@/properties/services/property';
import Property, { PropertyCreationAttributes } from '@/properties/models/Property';
import Request from '@/properties/models/Request';
import { AppError } from '@/utils/response/appError';
import { getSequelizeCondition } from '@/utils/filteringOperations';
import { RequestStatusEnum, PropertyStatusEnum } from '@/enums/request-property-status.enum';
import { PropertyFilterKeys } from '@/enums/propertyFilterKeys.enum';
import { PaginatedResponse } from '@/utils/pagination/interfaces';
import { PropertyFees } from '@/enums/propertyFees.enum';
import { PropertyFSCCode } from '@/enums/property-fsc-code.enum';

// Mock database FIRST before any model imports
jest.mock('@/utils/database', () => ({
  __esModule: true,
  database: {
    sequelize: {
      define: jest.fn(() => ({})),
      sync: jest.fn(),
      authenticate: jest.fn(),
      query: jest.fn(),
      transaction: jest.fn(),
      close: jest.fn(),
      col: jest.fn(),
      fn: jest.fn(),
      DataTypes: {
        INTEGER: 'INTEGER',
        STRING: 'STRING',
        BOOLEAN: 'BOOLEAN',
        DATE: 'DATE',
        TEXT: 'TEXT',
        DECIMAL: 'DECIMAL',
        ENUM: 'ENUM',
        JSON: 'JSON',
      },
    },
  },
}));

// Mock sequelize with Op
jest.mock('sequelize', () => ({
  DataTypes: {
    STRING: jest.fn(() => 'STRING'),
    BOOLEAN: jest.fn(() => 'BOOLEAN'),
    INTEGER: jest.fn(() => 'INTEGER'),
    DATE: jest.fn(() => 'DATE'),
    TEXT: jest.fn(() => 'TEXT'),
    DECIMAL: jest.fn(() => 'DECIMAL'),
    ENUM: jest.fn(() => 'ENUM'),
    JSON: jest.fn(() => 'JSON'),
  },
  Op: {
    eq: 'eq',
    ne: 'ne',
    like: 'like',
    notIn: 'notIn',
    in: 'in',
    gt: 'gt',
    lt: 'lt',
    gte: 'gte',
    lte: 'lte',
  },
  Model: class MockModel {
    static init = jest.fn();
    static belongsTo = jest.fn();
    static hasMany = jest.fn();
    static findAll = jest.fn();
    static findByPk = jest.fn();
    static create = jest.fn();
    static update = jest.fn();
    static findOne = jest.fn();
  },
  Optional: jest.fn(),
}));

const { Op } = require('sequelize');

// Mock Property model
jest.mock('@/properties/models/Property', () => ({
  __esModule: true,
  default: {
    create: jest.fn(),
    update: jest.fn(),
    findByPk: jest.fn(),
    init: jest.fn(),
    belongsTo: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
}));

// Mock other dependencies
jest.mock('@/properties/models/Request');
jest.mock('@/utils/pagination', () => ({
  paginateSequelize: jest.fn(),
}));
jest.mock('@/utils/filteringOperations', () => {
  const actual = jest.requireActual('@/utils/filteringOperations');
  return {
    ...actual,
    getSequelizeCondition: jest.fn(),
  };
});
jest.mock('@/utils/cache', () => ({
  __esModule: true,
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    deleteSmart: jest.fn(),
  },
}));
jest.mock('@/utils/cache/keys', () => ({
  __esModule: true,
  cacheKeys: {
    doneeProperty: { key: (id: string) => `doneeProperty:${id}` },
  },
}));

// Mock PropertyDataService used for quantity and fee calculations
jest.mock('@/ppms/services/propertyData', () => ({
  PropertyDataService: {
    getPropertyDetails: jest.fn(),
  },
}));

describe('PropertyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPaginatedPropertiesByRequestId', () => {
    it('should return paginated properties for valid requestId', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_name: 'Test Property 1' },
        { property_id: 2, request_id: requestId, property_name: 'Test Property 2' }
      ] as unknown as Property[];

      const mockPaginatedResponse: PaginatedResponse<Property> = {
        items: mockProperties,
        pagination: {
          totalItems: 2,
          totalPages: 1,
          currentPage: 1,
          pageSize: 10,
          hasNextPage: false,
          hasPrevPage: false
        }
      };

      const { paginateSequelize } = require('@/utils/pagination');
      paginateSequelize.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await PropertyService.getPaginatedPropertiesByRequestId(requestId, 1, 10);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(paginateSequelize).toHaveBeenCalledWith(
        Property,
        1,
        10,
        { where: { request_id: requestId } }
      );
    });

    it('should throw AppError when no properties found', async () => {
      // Arrange
      const requestId = 999;
      const emptyResponse: PaginatedResponse<Property> = {
        items: [],
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: 1,
          pageSize: 10,
          hasNextPage: false,
          hasPrevPage: false
        }
      };

      const { paginateSequelize } = require('@/utils/pagination');
      paginateSequelize.mockResolvedValue(emptyResponse);

      // Act & Assert
      await expect(PropertyService.getPaginatedPropertiesByRequestId(requestId))
        .rejects.toThrow(AppError);
      await expect(PropertyService.getPaginatedPropertiesByRequestId(requestId))
        .rejects.toThrow('No properties found for this request');
    });
  });

  describe('getPropertyById', () => {
    it('should return cached property when available', async () => {
      // Arrange
      const propertyId = 1;
      const mockProperty = {
        property_id: propertyId,
        property_name: 'Cached Property',
        request_id: 123
      } as unknown as Property;

      const { cache } = require('@/utils/cache');
      cache.get.mockResolvedValue(mockProperty);

      // Act
      const result = await PropertyService.getPropertyById(propertyId);

      // Assert
      expect(result).toEqual(mockProperty);
      expect(cache.get).toHaveBeenCalled();
      expect(Property.findByPk).not.toHaveBeenCalled();
    });

    it('should fetch from database and cache when not in cache', async () => {
      // Arrange
      const propertyId = 1;
      const mockProperty = {
        property_id: propertyId,
        property_name: 'DB Property',
        request_id: 123
      } as unknown as Property;

      const { cache } = require('@/utils/cache');
      cache.get.mockResolvedValue(null);
      cache.set.mockResolvedValue(undefined);
      (Property.findByPk as jest.Mock).mockResolvedValue(mockProperty);

      // Act
      const result = await PropertyService.getPropertyById(propertyId);

      // Assert
      expect(result).toEqual(mockProperty);
      expect(Property.findByPk).toHaveBeenCalledWith(propertyId);
      expect(cache.set).toHaveBeenCalled();
    });

    it('should throw AppError when property not found', async () => {
      // Arrange
      const propertyId = 999;
      const { cache } = require('@/utils/cache');
      cache.get.mockResolvedValue(null);
      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(PropertyService.getPropertyById(propertyId))
        .rejects.toThrow(AppError);
      await expect(PropertyService.getPropertyById(propertyId))
        .rejects.toThrow('Property not found');
    });
  });

  describe('createProperty', () => {
    it('should create property and handle competing status logic', async () => {
      // Arrange
      const propertyData: PropertyCreationAttributes = {
        request_id: 1,
        property_control_number: 'ICN-123',
        property_name: 'Test Property',
        property_quantity: 5,
        property_reimbursable: true,
        property_surplus_release_date: Date.now(),
        property_type: 'Equipment',
        property_description: 'Test description',
        property_justification: 'Test justification',
        property_justification_extended: 'Test justification extended',
        property_allocated_quantity: 0,
        property_denied_quantity: 0,
        property_original_value: 1000,
        property_total_value: 1000,
        is_denied: false,
        is_cancelled: false,
        is_picked_up: false,
        is_late_cancelled: false,
      };

      const mockCreatedProperty = {
        property_id: 1,
        ...propertyData
      } as unknown as Property;

      (Property.create as jest.Mock).mockResolvedValue(mockCreatedProperty);
      (Property.update as jest.Mock).mockResolvedValue([1]);
      jest.spyOn(PropertyService, 'isCompeting').mockResolvedValue(true);

      const { cache } = require('@/utils/cache');
      cache.set.mockResolvedValue(undefined);

      // Act
      const result = await PropertyService.createProperty(propertyData);

      // Assert
      expect(result).toEqual(mockCreatedProperty);
      expect(Property.create).toHaveBeenCalledWith(propertyData, expect.anything());
      expect(PropertyService.isCompeting).toHaveBeenCalledWith('ICN-123');
      // Should update competing status when isCompeting returns true
      expect(Property.update).toHaveBeenCalledWith(
        { property_status: 'competing' },
        expect.objectContaining({
          where: {
            property_control_number: 'ICN-123',
            is_cancelled: false,
            is_denied: false,
          }
        })
      );
    });

    it('should not update competing status when not competing', async () => {
      // Arrange
      const propertyData: PropertyCreationAttributes = {
        request_id: 1,
        property_control_number: 'ICN-456',
        property_name: 'Non-competing Property',
        property_quantity: 2,
        property_reimbursable: false,
        property_surplus_release_date: Date.now(),
        property_type: 'Equipment',
        property_description: 'Test description',
        property_justification: 'Test justification',
        property_justification_extended: 'Test justification extended',
        property_allocated_quantity: 0,
        property_denied_quantity: 0,
        property_original_value: 500,
        property_total_value: 500,
        is_denied: false,
        is_cancelled: false,
        is_picked_up: false,
        is_late_cancelled: false,
      };

      const mockCreatedProperty = {
        property_id: 2,
        ...propertyData
      } as unknown as Property;

      (Property.create as jest.Mock).mockResolvedValue(mockCreatedProperty);
      jest.spyOn(PropertyService, 'isCompeting').mockResolvedValue(false);

      const { cache } = require('@/utils/cache');
      cache.set.mockResolvedValue(undefined);

      // Act
      const result = await PropertyService.createProperty(propertyData);

      // Assert
      expect(result).toEqual(mockCreatedProperty);
      expect(PropertyService.isCompeting).toHaveBeenCalledWith('ICN-456');
      expect(Property.update).not.toHaveBeenCalled();
    });
  });

  describe('updateProperty', () => {
    it('should update property and invalidate cache', async () => {
      // Arrange
      const propertyId = 1;
      const updates = {
        property_name: 'Updated Property Name',
        property_quantity: 10
      };

      const mockUpdatedProperty = {
        property_id: propertyId,
        property_name: 'Updated Property Name',
        property_quantity: 10,
        request_id: 123
      } as unknown as Property;

      (Property.update as jest.Mock).mockResolvedValue([1]);
      (Property.findByPk as jest.Mock).mockResolvedValue(mockUpdatedProperty);

      const { cache } = require('@/utils/cache');
      cache.deleteSmart.mockResolvedValue(undefined);

      // Act
      const result = await PropertyService.updateProperty(propertyId, updates);

      // Assert
      expect(result).toEqual(mockUpdatedProperty);
      expect(Property.update).toHaveBeenCalledWith(
        updates,
        expect.objectContaining({ where: { property_id: propertyId } })
      );
      expect(Property.findByPk).toHaveBeenCalledWith(propertyId, expect.anything());
      expect(cache.deleteSmart).toHaveBeenCalled();
    });

    it('should throw error when property not found after update', async () => {
      // Arrange
      const propertyId = 999;
      const updates = { property_name: 'Non-existent' };

      (Property.update as jest.Mock).mockResolvedValue([0]);
      (Property.findByPk as jest.Mock).mockResolvedValue(null);

      // Act & Assert
      await expect(PropertyService.updateProperty(propertyId, updates))
        .rejects.toThrow(AppError);
      await expect(PropertyService.updateProperty(propertyId, updates))
        .rejects.toThrow('Updated property not found');
    });
  });

  describe('getRequestAllocationStatus', () => {
    it('should return CANCELED when all properties are cancelled', () => {
      // Arrange
      const properties = [
        { is_cancelled: true, property_quantity: 5 },
        { is_cancelled: true, property_quantity: 3 }
      ] as unknown as Property[];

      // Act
      const result = PropertyService.getRequestAllocationStatus(properties);

      // Assert
      expect(result).toBe(RequestStatusEnum.CANCELED);
    });

    it('should return ALLOCATED when all quantities are allocated', () => {
      // Arrange
      const properties = [
        {
          is_cancelled: false,
          property_quantity: 5,
          property_allocated_quantity: 5,
          property_denied_quantity: 0
        },
        {
          is_cancelled: false,
          property_quantity: 3,
          property_allocated_quantity: 3,
          property_denied_quantity: 0
        }
      ] as unknown as Property[];

      // Act
      const result = PropertyService.getRequestAllocationStatus(properties);

      // Assert
      expect(result).toBe(RequestStatusEnum.ALLOCATED);
    });

    it('should return DENIED when all quantities are denied', () => {
      // Arrange
      const properties = [
        {
          is_cancelled: false,
          property_quantity: 5,
          property_allocated_quantity: 0,
          property_denied_quantity: 5
        },
        {
          is_cancelled: false,
          property_quantity: 3,
          property_allocated_quantity: 0,
          property_denied_quantity: 3
        }
      ] as unknown as Property[];

      // Act
      const result = PropertyService.getRequestAllocationStatus(properties);

      // Assert
      expect(result).toBe(RequestStatusEnum.DENIED);
    });

    it('should return PARTIALLY_ALLOCATED for mixed allocation status', () => {
      // Arrange
      const properties = [
        {
          is_cancelled: false,
          property_quantity: 10,
          property_allocated_quantity: 5,
          property_denied_quantity: 2
        }
      ] as unknown as Property[];

      // Act
      const result = PropertyService.getRequestAllocationStatus(properties);

      // Assert
      expect(result).toBe(RequestStatusEnum.PARTIALLY_ALLOCATED);
    });

    it('should handle null/undefined quantities gracefully', () => {
      // Arrange
      const properties = [
        {
          is_cancelled: false,
          property_quantity: null,
          property_allocated_quantity: undefined,
          property_denied_quantity: 0
        }
      ] as unknown as Property[];

      // Act
      const result = PropertyService.getRequestAllocationStatus(properties);

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe('getAllPropertiesByRequestId', () => {
    it('should return all properties for a request without options', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_name: 'Property 1' },
        { property_id: 2, request_id: requestId, property_name: 'Property 2' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getAllPropertiesByRequestId(requestId);

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: { request_id: requestId },
        transaction: undefined,
      });
    });

    it('should exclude specified property IDs when excludeIds option provided', async () => {
      // Arrange
      const requestId = 123;
      const excludeIds = [1, 3];
      const mockProperties = [
        { property_id: 2, request_id: requestId, property_name: 'Property 2' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getAllPropertiesByRequestId(requestId, { excludeIds });

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_id: { [Op.notIn]: excludeIds }
        },
        transaction: undefined,
      });
    });

    it('should filter by allocation status when allocation option is true', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_allocated_date: '2023-01-01' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getAllPropertiesByRequestId(requestId, { allocation: true });

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_allocated_date: { [Op.ne]: null }
        },
        transaction: undefined,
      });
    });

    it('should filter by allocation status when allocation option is false', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_allocated_date: null }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getAllPropertiesByRequestId(requestId, { allocation: false });

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_allocated_date: { [Op.eq]: null }
        },
        transaction: undefined,
      });
    });

    it('should filter by canceled status when isCanceled option is true', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, is_cancelled: true }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getAllPropertiesByRequestId(requestId, { isCanceled: true });

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          is_cancelled: { [Op.eq]: true }
        },
        transaction: undefined,
      });
    });

    it('should filter by denied status when isDenied option is true', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, is_denied: true }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getAllPropertiesByRequestId(requestId, { isDenied: true });

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          is_denied: { [Op.eq]: true }
        },
        transaction: undefined,
      });
    });

    it('should combine multiple filter options correctly', async () => {
      // Arrange
      const requestId = 123;
      const options = {
        excludeIds: [1, 2],
        allocation: true,
        isCanceled: false,
        isDenied: false
      };
      const mockProperties = [
        { property_id: 3, request_id: requestId, property_allocated_date: '2023-01-01', is_cancelled: false, is_denied: false }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getAllPropertiesByRequestId(requestId, options);

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_id: { [Op.notIn]: [1, 2] },
          property_allocated_date: { [Op.ne]: null },
          is_cancelled: { [Op.ne]: true },
          is_denied: { [Op.ne]: true }
        },
        transaction: undefined,
      });
    });
  });

  describe('getPropertiesByRequestId', () => {
    it('should return properties without filtering or sorting', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_name: 'Property 1' },
        { property_id: 2, request_id: requestId, property_name: 'Property 2' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getPropertiesByRequestId(requestId);

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: { request_id: requestId },
        order: undefined
      });
    });

    it('should apply sorting when sortBy and sortOrder are provided', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_name: 'Property A' },
        { property_id: 2, request_id: requestId, property_name: 'Property B' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getPropertiesByRequestId(requestId, 'property_name', 'desc');

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: { request_id: requestId },
        order: [['property_name', 'DESC']]
      });
    });

    it('should filter by PROPERTY_QUANTITY with numeric value', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_quantity: 5 }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.eq]: '5' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'exact', PropertyFilterKeys.PROPERTY_QUANTITY, '5'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('exact', '5');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_quantity: { [Op.eq]: '5' }
        },
        order: undefined
      });
    });

    it('should filter by REQUEST_ID', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: 456, property_name: 'Property 1' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.eq]: '456' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'exact', PropertyFilterKeys.REQUEST_ID, '456'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('exact', '456');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: { [Op.eq]: '456' }
        },
        order: undefined
      });
    });

    it('should filter by PROPERTY_CONTROL_NUMBER', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_control_number: 'CTRL123' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.like]: '%ctrl123%' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'contains', PropertyFilterKeys.PROPERTY_CONTROL_NUMBER, 'CTRL123'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('contains', 'ctrl123');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_control_number: { [Op.like]: '%ctrl123%' }
        },
        order: undefined
      });
    });

    it('should filter by PROPERTY_ID with contains operator', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 123, request_id: requestId, property_name: 'Property 123' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.like]: '%123%' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'contains', PropertyFilterKeys.PROPERTY_ID, '123'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('contains', '123');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_id: { [Op.like]: '%123%' }
        },
        order: undefined
      });
    });

    it('should filter by PROPERTY_ORIGINAL_VALUE', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_original_value: 1000 }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.eq]: '1000' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'exact', PropertyFilterKeys.PROPERTY_ORIGINAL_VALUE, '1000'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('exact', '1000');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_original_value: { [Op.eq]: '1000' }
        },
        order: undefined
      });
    });

    it('should filter by PROPERTY_TOTAL_VALUE with greater than operator', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_total_value: 2500 }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.gt]: '2000' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'greaterThan', PropertyFilterKeys.PROPERTY_TOTAL_VALUE, '2000'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('greaterThan', '2000');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_total_value: { [Op.gt]: '2000' }
        },
        order: undefined
      });
    });

    it('should filter by multiple filter keys (PROPERTY_STATUS)', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_status: 'ACTIVE' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.eq]: 'active' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'exact', PropertyFilterKeys.PROPERTY_STATUS, 'ACTIVE'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('exact', 'active');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_status: { [Op.eq]: 'active' }
        },
        order: undefined
      });
    });

    it('should throw AppError when no properties found', async () => {
      // Arrange
      const requestId = 999;
      (Property.findAll as jest.Mock).mockResolvedValue([]);

      // Act & Assert
      await expect(PropertyService.getPropertiesByRequestId(requestId))
        .rejects
        .toThrow(new AppError(404, 'No properties found for this request'));
    });

    it('should handle default case in filter switch statement', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_name: 'Property 1' }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act - using an invalid filter key to trigger default case
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'contains', 'INVALID_KEY' as PropertyFilterKeys, 'test'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: { request_id: requestId },
        order: undefined
      });
    });

    it('should combine filtering and sorting', async () => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, property_name: 'Test Property', property_quantity: 10 }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.like]: '%test%' });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, 'property_quantity', 'asc', 'contains', PropertyFilterKeys.PROPERTY_NAME, 'Test'
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('contains', 'test');
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          property_name: { [Op.like]: '%test%' }
        },
        order: [['property_quantity', 'ASC']]
      });
    });

    it.each([
      [PropertyFilterKeys.PROPERTY_DESCRIPTION, 'property_description', 'A sample description'],
      [PropertyFilterKeys.PROPERTY_JUSTIFICATION, 'property_justification', 'important justification'],
      [PropertyFilterKeys.PROPERTY_CANCELLATION_DATE, 'property_cancellation_date', '2025-01-01'],
      [PropertyFilterKeys.PROPERTY_DENIAL_DATE, 'property_denial_date', '2025-02-02'],
      [PropertyFilterKeys.PROPERTY_PICKUP_DATE, 'property_pickup_date', '2025-03-03'],
      [PropertyFilterKeys.PROPERTY_ALLOCATED_DATE, 'property_allocated_date', '2025-04-04'],
      [PropertyFilterKeys.UPDATED_AT, 'property_updated_date', '2025-05-05'],
      [PropertyFilterKeys.CREATED_AT, 'createdAt', '2025-06-06'],
    ])('should filter by %s', async (filterKey, fieldName, value) => {
      // Arrange
      const requestId = 123;
      const mockProperties = [
        { property_id: 1, request_id: requestId, [fieldName]: value }
      ] as unknown as Property[];

      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);
      (getSequelizeCondition as jest.Mock).mockReturnValue({ [Op.eq]: value.toLowerCase ? value.toLowerCase() : value });

      // Act
      const result = await PropertyService.getPropertiesByRequestId(
        requestId, undefined, undefined, 'exact', filterKey as PropertyFilterKeys, value
      );

      // Assert
      expect(result).toEqual(mockProperties);
      expect(getSequelizeCondition).toHaveBeenCalledWith('exact', value.toLowerCase ? value.toLowerCase() : value);
      expect(Property.findAll).toHaveBeenCalledWith({
        where: {
          request_id: requestId,
          [fieldName]: { [Op.eq]: value.toLowerCase ? value.toLowerCase() : value }
        },
        order: undefined
      });
    });
  });



  // Tests for property competition detection logic - determines if multiple requests exceed available quantity
  describe('isCompeting', () => {
    // Restore any previous spies on isCompeting set in earlier tests (e.g., createProperty)
    beforeAll(() => {
      if ((PropertyService.isCompeting as jest.Mock).mockRestore) {
        (PropertyService.isCompeting as jest.Mock).mockRestore();
      } else {
        jest.restoreAllMocks();
      }
    });

    it('should return true when requested quantity exceeds available quantity', async () => {
      // Arrange
      const icn = 'ICN-123';
      // Mock properties so their total requested quantity (9) exceeds available quantity (7)
      (Property.findAll as jest.Mock).mockResolvedValueOnce([
        { property_quantity: 5 },
        { property_quantity: 4 },
      ]);
      // Mock PPMS property details with smaller available quantity
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        data: { quantity: 7 },
      });

      // Act
      const result = await PropertyService.isCompeting(icn);

      // Assert
      expect(result).toBe(true);
      expect(Property.findAll).toHaveBeenCalled();
      const findAllArgs = (Property.findAll as jest.Mock).mock.calls[0][0];
      expect(findAllArgs.where).toEqual({ property_control_number: icn, is_cancelled: false, is_denied: false });
      expect(PropertyDataService.getPropertyDetails).toHaveBeenCalledWith(icn);
    });

    it('should return false when requested quantity does not exceed available quantity', async () => {
      // Arrange
      const icn = 'ICN-456';
      (Property.findAll as jest.Mock).mockResolvedValueOnce([
        { property_quantity: 2 },
        { property_quantity: 3 },
      ]);
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        data: { quantity: 10 },
      });

      // Act
      const result = await PropertyService.isCompeting(icn);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false when no properties found', async () => {
      // Arrange
      const icn = 'ICN-789';
      (Property.findAll as jest.Mock).mockResolvedValueOnce(undefined);
      const { PropertyDataService } = require('@/ppms/services/propertyData');

      // Act
      const result = await PropertyService.isCompeting(icn);

      // Assert
      expect(result).toBe(false);
      expect(Property.findAll).toHaveBeenCalled();
      const findAllArgs = (Property.findAll as jest.Mock).mock.calls[0][0];
      expect(findAllArgs.where).toEqual({ property_control_number: icn, is_cancelled: false, is_denied: false });
      expect(PropertyDataService.getPropertyDetails).not.toHaveBeenCalled();
    });
  });

  // Tests for fetching properties by user ID - retrieves property control numbers for a specific user
  describe('getRequestByUserId', () => {
    it('should fetch properties requested by userId with the correct query structure', async () => {
      // Arrange
      const userId = 'user-123';
      const mockProperties = [{ property_control_number: 'ICN-789' }];
      (Property.findAll as jest.Mock).mockResolvedValue(mockProperties);

      // Act
      const result = await PropertyService.getRequestByUserId(userId);

      // Assert
      expect(result).toEqual(mockProperties);
      expect(Property.findAll).toHaveBeenCalled();
      // Verify query structure includes correct userId filter
      const queryArg = (Property.findAll as jest.Mock).mock.calls[0][0];
      expect(queryArg.attributes).toEqual(['property_control_number']);
      const userFilter = queryArg.include[0].include[0].include[0].include[0].where;
      expect(userFilter).toEqual({ userId });
    });
  });

  // Tests for updating competing status after property changes - resets competing status when no longer competing
  describe('updateCompetingStatusAfterChange', () => {
    it('should reset competing status when competition no longer exists', async () => {
      // Arrange
      const propertyId = 1;
      const icn = 'ICN-123';
      (Property.findByPk as jest.Mock).mockResolvedValueOnce({
        property_id: propertyId,
        property_status: PropertyStatusEnum.COMPETING,
        property_control_number: icn,
        property_quantity: 4,
        property_denied_quantity: 0,
      });
      (Property.findAll as jest.Mock).mockResolvedValueOnce([
        { property_id: 1, property_quantity: 4, property_denied_quantity: 0 },
        { property_id: 2, property_quantity: 1, property_denied_quantity: 0 },
      ]);
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        data: { quantity: 10 },
      });

      // Act
      await PropertyService.updateCompetingStatusAfterChange(propertyId);

      // Assert
      expect(Property.update).toHaveBeenCalledWith(
        { property_status: undefined },
        expect.objectContaining({
          where: {
            property_control_number: icn,
            is_cancelled: false,
            is_denied: false,
          },
        }),
      );
    });

    it('should do nothing when property is not found', async () => {
      // Arrange
      (Property.findByPk as jest.Mock).mockResolvedValueOnce(null);

      // Act
      await PropertyService.updateCompetingStatusAfterChange(999);

      // Assert
      expect(Property.update).not.toHaveBeenCalled();
    });

    it('should do nothing when property is not competing', async () => {
      // Arrange
      (Property.findByPk as jest.Mock).mockResolvedValueOnce({
        property_id: 1,
        property_status: PropertyStatusEnum.CANCELED,
      });

      // Act
      await PropertyService.updateCompetingStatusAfterChange(1);

      // Assert
      expect(Property.update).not.toHaveBeenCalled();
    });
  });

  // Tests for checking duplicate property requests by ICN - prevents duplicate property requests within organization
  describe('checkDuplicatePropertyByICN', () => {
    it('should not throw when no duplicate exists', async () => {
      // Arrange
      ((Property as unknown) as { findOne: jest.Mock }).findOne.mockResolvedValueOnce(null);
      const doneeAccount = { id: 1, organizationId: 'org1' } as any;

      // Act & Assert
      await expect(PropertyService.checkDuplicatePropertyByICN('ICN-111', doneeAccount, {} as any)).resolves.not.toThrow();
    });

    it('should throw error when duplicate exists in same donee account', async () => {
      // Arrange
      ((Property as unknown) as { findOne: jest.Mock }).findOne.mockResolvedValueOnce({
        request: { donee_account: 1 },
      });
      const doneeAccount = { id: 1, organizationId: 'org1' } as any;

      // Act & Assert
      await expect(PropertyService.checkDuplicatePropertyByICN('ICN-111', doneeAccount, {} as any))
        .rejects.toThrow('You have already submitted a request for this property in this donee account.');
    });

    it('should throw error when duplicate exists in different donee account', async () => {
      // Arrange
      ((Property as unknown) as { findOne: jest.Mock }).findOne.mockResolvedValueOnce({
        request: { donee_account: 2 },
      });
      const doneeAccount = { id: 1, organizationId: 'org1' } as any;

      // Act & Assert
      await expect(PropertyService.checkDuplicatePropertyByICN('ICN-111', doneeAccount, {} as any))
        .rejects.toThrow('This property has already been requested by another donee account in your organization.');
    });
  });

  // Tests for calculating flat fees based on property details - determines aircraft fees based on condition codes
  describe('getFlatFeeIfExist', () => {
    const baseDetail = {
      data: {
        categoryCode: 2,
        fscCode: '1234',
        propertyPOC: { email: 'ozturkgokalp000@gmail.com' },
        propertyCustodian: { email: 'ozturkgokalp000@gmail.com' },
        propertyLocation: { line1: '', line2: '' },
        reportingAgencyAddress: { line1: '', line2: '' },
        conditionCode: 'N',
        quantity: 5,
      },
    };

    it('should return correct fee for NEW_UNUSED_AIRCRAFT', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        ...baseDetail,
        data: { ...baseDetail.data, conditionCode: 'N' },
      });

      // Act
      const fee = await PropertyService.getFlatFeeIfExist('ICN-AAA');

      // Assert
      expect(fee).toBe(PropertyFees.NEW_UNUSED_AIRCRAFT);
    });

    it('should return false when category is not aircraft', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        ...baseDetail,
        data: { ...baseDetail.data, categoryCode: 1 },
      });

      // Act
      const fee = await PropertyService.getFlatFeeIfExist('ICN-AAA');

      // Assert
      expect(fee).toBe(false);
    });

    it('should return false when FSC code corresponds to drones', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        ...baseDetail,
        data: { ...baseDetail.data, fscCode: PropertyFSCCode.DRONES },
      });

      // Act
      const fee = await PropertyService.getFlatFeeIfExist('ICN-AAA');

      // Assert
      expect(fee).toBe(false);
    });

    it('should return false when asset is NASA related', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        ...baseDetail,
        data: { ...baseDetail.data, propertyPOC: { email: 'ozturkgokalp000@gmail.com' } },
      });

      // Act
      const fee = await PropertyService.getFlatFeeIfExist('ICN-AAA');

      // Assert
      expect(fee).toBe(false);
    });

    it('should return false when property location contains NASA keyword', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        data: {
          categoryCode: 2,
          fscCode: '1234',
          propertyPOC: { email: 'ozturkgokalp000@gmail.com' },
          propertyCustodian: { email: 'ozturkgokalp000@gmail.com' },
          propertyLocation: { line1: 'National Aeronautics Space Adm Hangar', line2: '' },
          reportingAgencyAddress: { line1: '', line2: '' },
          conditionCode: 'N',
          quantity: 1,
        },
      });

      // Act
      const fee = await PropertyService.getFlatFeeIfExist('ICN-NASA');

      // Assert
      expect(fee).toBe(false);
    });
  });

  // Tests for additional aircraft condition codes - validates fee calculation for different aircraft conditions
  describe('getFlatFeeIfExist - additional condition codes', () => {
    const baseDetail = {
      data: {
        categoryCode: 2,
        fscCode: '1234',
        propertyPOC: { email: 'ozturkgokalp000@gmail.com' },
        propertyCustodian: { email: 'ozturkgokalp000@gmail.com' },
        propertyLocation: { line1: '', line2: '' },
        reportingAgencyAddress: { line1: '', line2: '' },
        quantity: 3,
      },
    };

    const cases: Array<[string, string, PropertyFees]> = [
      ['U', 'USABLE_AIRCRAFT', PropertyFees.USABLE_AIRCRAFT],
      ['R', 'REPAIRABLE_AIRCRAFT', PropertyFees.REPAIRABLE_AIRCRAFT],
      ['X', 'SALVAGE_AIRCRAFT', PropertyFees.SALVAGE_AIRCRAFT],
      ['S', 'SCRAP_AIRCRAFT', PropertyFees.SCRAP_AIRCRAFT],
    ];

    it.each(cases)('should return %s fee constant when condition code is %s', async (code, _label, expectedFee) => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValueOnce({
        ...baseDetail,
        data: { ...baseDetail.data, conditionCode: code },
      });

      // Act
      const fee = await PropertyService.getFlatFeeIfExist('ICN-FFF');

      // Assert
      expect(fee).toBe(expectedFee);
    });
  });

  // Tests for finding matching property requests - locates existing pending requests for similar properties
  describe('geRequestIdFortMatchingProperty', () => {
    it('should return existing pending request id when matching property found', async () => {
      // Arrange
      const icn = 'ICN123456789';
      const doneeAccountId = 42;
      const surplusReleaseDate = 20240101;
      const city = 'Austin';
      const region = 'TX';
      const postal = '73301';
      (Property.findOne as jest.Mock).mockResolvedValue({ request: { id: 555 } });

      // Act
      const result = await PropertyService.geRequestIdFortMatchingProperty(icn, doneeAccountId, surplusReleaseDate, city, region, postal);

      // Assert
      expect(result).toBe(555);
      expect(Property.findOne).toHaveBeenCalled();
      const args = (Property.findOne as jest.Mock).mock.calls[0][0];
      expect(args.where.property_control_number[Op.like]).toBe(`${icn.substring(0, 6)}%`);
      expect(args.where.property_surplus_release_date).toBe(surplusReleaseDate);
      expect(args.include[0].where).toEqual({ donee_account: doneeAccountId, status: RequestStatusEnum.PENDING });
    });

    it('should return null when no matching property found', async () => {
      // Arrange
      (Property.findOne as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await PropertyService.geRequestIdFortMatchingProperty('ICN987654', 1, 20240101, 'A', 'B', 'C');

      // Assert
      expect(result).toBeNull();
    });
  });

  // Tests for retrieving properties by organization and state - validates query building for filtered property retrieval
  describe('getAllPropertiesByOrganizationId / StateId', () => {
    it('should build correct query for organization filtering and sorting', async () => {
      // Arrange
      const { paginateSequelize } = require('@/utils/pagination');
      const { getSequelizeCondition } = require('@/utils/filteringOperations');

      paginateSequelize.mockResolvedValue({ items: [], pagination: {} });
      getSequelizeCondition.mockReturnValue({ [Op.like]: '%plane%' });
      const organizationId = 'org-123';

      // Act
      await PropertyService.getAllPropertiesByOrganizationId(
        organizationId,
        1,
        10,
        PropertyFilterKeys.PROPERTY_NAME,
        'contains',
        'Plane',
        'property_name',
        'ASC',
      );

      expect(paginateSequelize).toHaveBeenCalledWith(
        Property,
        1,
        10,
        expect.objectContaining({
          where: expect.objectContaining({ '$request.doneeAccount.organizationId$': organizationId, property_name: { [Op.like]: '%plane%' } }),
          order: expect.any(Array),
        }),
      );
    });

    it('should build correct query for state filtering', async () => {
      const { paginateSequelize } = require('@/utils/pagination');
      const stateId = 99;
      paginateSequelize.mockResolvedValue({ items: [], pagination: {} });

      await PropertyService.getAllPropertiesByStateId(stateId, 2, 5);

      const query = paginateSequelize.mock.calls[0][3];
      expect(query.where['$request.doneeAccount.stateId$']).toBe(stateId);
    });
  });

  // Tests for property count aggregation - always returns unfiltered counts
  describe('Property Count Methods', () => {
    const buildRow = (status: string, count: number) => ({
      getDataValue: (key: string) => (key === 'status' ? status : count.toString()),
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('getAllPropertyCountsByOrganizationId should return unfiltered counts', async () => {
      // Arrange
      (Property.findAll as jest.Mock).mockResolvedValue([]);

      // Act
      await PropertyService.getAllPropertyCountsByOrganizationId('org-123');

      // Assert - only organizationId in where clause, no other filters
      const where = (Property.findAll as jest.Mock).mock.calls[0][0].where;
      expect(where['$request.doneeAccount.organizationId$']).toBe('org-123');
      expect(Object.keys(where).length).toBe(1);
    });

    it('getAllPropertyCountsByStateId should aggregate counts and fill missing statuses', async () => {
      // Arrange
      const stateId = 99;
      const allocatedRow = buildRow('allocated', 2);
      const pendingRow = buildRow('pending', 3);

      (Property.findAll as jest.Mock).mockResolvedValue([allocatedRow, pendingRow]);

      // Act
      const result = await PropertyService.getAllPropertyCountsByStateId(stateId);

      // Assert
      expect(Property.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ '$request.doneeAccount.stateId$': stateId }),
        }),
      );

      expect(result.allocated).toBe(2);
      expect(result.pending).toBe(3);

      // All RequestStatusEnum keys should exist
      const { RequestStatusEnum } = require('@/enums/request-property-status.enum');
      Object.values(RequestStatusEnum).forEach(status => {
        expect(result).toHaveProperty(status as string);
      });
    });
  });

  // Tests for default branch in fee calculation - handles unrecognized condition codes
  describe('getFlatFeeIfExist - default branch', () => {
    it('should return false for unrecognized condition code', async () => {
      // Arrange
      const { PropertyDataService } = require('@/ppms/services/propertyData');
      PropertyDataService.getPropertyDetails.mockResolvedValue({
        data: {
          categoryCode: 2,
          fscCode: '1234',
          propertyPOC: { email: 'ozturkgokalp000@gmail.com' },
          propertyCustodian: { email: 'ozturkgokalp000@gmail.com' },
          propertyLocation: { line1: '', line2: '' },
          reportingAgencyAddress: { line1: '', line2: '' },
          conditionCode: 'Z', // unknown code to hit default case
          quantity: 1,
        },
      });

      // Act
      const fee = await PropertyService.getFlatFeeIfExist('ICN-UNKNOWN');

      // Assert
      expect(fee).toBe(false);
    });
  });

  // Tests for additional property filtering functionality - validates filtering by various property attributes
  describe('getAllPropertiesWithFiltering - additional filter keys', () => {
    it('should filter by PROPERTY_TYPE using getSequelizeCondition', async () => {
      // Arrange
      const { paginateSequelize } = require('@/utils/pagination');
      const { getSequelizeCondition } = require('@/utils/filteringOperations');

      paginateSequelize.mockResolvedValue({ items: [], pagination: {} });
      getSequelizeCondition.mockReturnValue({ [Op.like]: '%equipment%' });

      // Act
      await PropertyService.getAllPropertiesByOrganizationId(
        'org-789',
        1,
        10,
        PropertyFilterKeys.PROPERTY_TYPE,
        'contains',
        'Equipment',
      );

      // Assert
      const query = paginateSequelize.mock.calls[0][3];
      expect(query.where.property_type).toEqual({ [Op.like]: '%equipment%' });
    });

    it('should handle REQUEST_STATUS "allocated" with special logic', async () => {
      // Arrange
      const { paginateSequelize } = require('@/utils/pagination');
      const { getSequelizeCondition } = require('@/utils/filteringOperations');

      paginateSequelize.mockResolvedValue({ items: [], pagination: {} });
      getSequelizeCondition.mockReturnValue({ [Op.like]: '%allocated%' });

      // Act
      await PropertyService.getAllPropertiesByStateId(
        55,
        1,
        10,
        PropertyFilterKeys.REQUEST_STATUS,
        'exact',
        'allocated',
      );

      // Assert
      const query = paginateSequelize.mock.calls[0][3];
      expect(query.where['$request.status$']).toBe('allocated');
      // getSequelizeCondition should NOT have been called for allocated
      expect(getSequelizeCondition).not.toHaveBeenCalled();
    });

    it('should use getSequelizeCondition for REQUEST_STATUS other than allocated', async () => {
      // Arrange
      const { paginateSequelize } = require('@/utils/pagination');
      const { getSequelizeCondition } = require('@/utils/filteringOperations');

      paginateSequelize.mockResolvedValue({ items: [], pagination: {} });
      getSequelizeCondition.mockReturnValue({ [Op.eq]: 'pending' });

      // Act
      await PropertyService.getAllPropertiesByStateId(
        55,
        1,
        10,
        PropertyFilterKeys.REQUEST_STATUS,
        'exact',
        'pending',
      );

      // Assert
      const query = paginateSequelize.mock.calls[0][3];
      expect(query.where['$request.status$']).toEqual({ [Op.eq]: 'pending' });
      expect(getSequelizeCondition).toHaveBeenCalledWith('exact', 'pending');
    });
  });

  // Tests for property query generation - validates where clause building for different filter keys
  describe('generatePropertiesQuery', () => {
    // Additional parameterized tests to cover remaining filter keys
    const additionalFilterCases: Array<[PropertyFilterKeys, string | number, string]> = [
      [PropertyFilterKeys.PROPERTY_STATUS, 'active', 'property_status'],
      [PropertyFilterKeys.PROPERTY_CONTROL_NUMBER, 'ICN123', 'property_control_number'],
      [PropertyFilterKeys.ORGANIZATION, 'Acme Org', '$request.doneeAccount.organization.name$'],
      [PropertyFilterKeys.DONEE_ACCOUNT, 'Donee 1', '$request.doneeAccount.name$'],
      [PropertyFilterKeys.REQUESTOR, 'John Doe', '$request.requestorUser.name$'],
      [PropertyFilterKeys.REQUEST_TCN, 'TCN456', '$request.tcn$'],
      [PropertyFilterKeys.PROPERTY_QUANTITY, 5, 'property_quantity'],
      [PropertyFilterKeys.PROPERTY_TOTAL_VALUE, 1000, 'property_total_value'],
      [PropertyFilterKeys.PROPERTY_LOCATION_CITY, 'Austin', 'property_location_city'],
      [PropertyFilterKeys.PROPERTY_LOCATION_REGION_STATE, 'TX', 'property_location_region_state'],
      [PropertyFilterKeys.CREATED_AT, '2025-01-01', 'createdAt'],
      [PropertyFilterKeys.UPDATED_AT, '2025-02-01', 'updatedAt'],
    ];

    it.each(additionalFilterCases)(
      'should build correct where clause for %s',
      async (filterKey, filterValue, expectedPath) => {
        // Arrange
        const { paginateSequelize } = require('@/utils/pagination');
        const { getSequelizeCondition } = require('@/utils/filteringOperations');

        const mockCondition = { mock: 'cond' };
        paginateSequelize.mockClear();
        getSequelizeCondition.mockClear();

        paginateSequelize.mockResolvedValue({ items: [], pagination: {} });
        getSequelizeCondition.mockReturnValue(mockCondition);

        // Act
        await PropertyService.getAllPropertiesByOrganizationId(
          'org-test',
          1,
          10,
          filterKey,
          'exact',
          filterValue as any,
        );

        // Assert
        expect(paginateSequelize).toHaveBeenCalled();
        const where = paginateSequelize.mock.calls[0][3].where;
        expect(where[expectedPath]).toBe(mockCondition);

        // getSequelizeCondition should be invoked (except for numeric filter values it still runs but value not lowered)
        expect(getSequelizeCondition).toHaveBeenCalledWith('exact',
          typeof filterValue === 'string' ? filterValue.toLowerCase() : filterValue,
        );
      },
    );
  });
});
