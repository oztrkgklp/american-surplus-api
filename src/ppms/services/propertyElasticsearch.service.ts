import {
  PropertySummarySearchOptions,
  propertyDetailsRepository,
} from '@/elasticsearch/repositories/propertyDetails.repository';
import { PropertySearchResult } from '@/ppms/types/summary';
import { PropertyDetailsToSearchResultMapper } from '@/ppms/mappers/propertyDetailsToSearchResult.mapper';
import { PaginatedResponse } from '@/utils/pagination/interfaces';
import { getLogger } from '@/utils/logger';
import { PropertyService } from '@/properties/services/property';
import { PropertyDataService } from '@/ppms/services/propertyData';
import { AppError } from '@/utils/response/appError';

const logger = getLogger('PropertyElasticsearchService');

/**
 * Service for Elasticsearch-based property search operations.
 * Uses the details index only; details entities are mapped to summary-like PropertySearchResult.
 */
export class PropertyElasticsearchService {
  /**
   * Search properties using the details index with multiple criteria.
   */
  static async searchProperties(page: number = 1, limit: number = 20, options?: PropertySummarySearchOptions, userId?: string): Promise<PaginatedResponse<PropertySearchResult>> {
    try {
      logger.info(`Searching properties with page: ${page}, limit: ${limit}, options: ${JSON.stringify(options)}`);

      const searchOptions: PropertySummarySearchOptions = {
        ...options,
        page,
        limit,
      };

      const result = await propertyDetailsRepository.searchPropertyDetails(searchOptions);
      const { entities, total } = result;

      logger.info(`Received ${entities.length} entities from details repository, total: ${total}`);

      let properties = entities.map((e) => PropertyDetailsToSearchResultMapper.toSearchResult(e));

      if (userId) {
        const requestedProperties = await PropertyService.getRequestByUserId(userId, ['property_control_number'], false);
        const requestedPropertyControlNumbers = new Set(requestedProperties.map((p: any) => p.property_control_number));

        properties = properties.map((item: PropertySearchResult) => {
          if (requestedPropertyControlNumbers.has(item.itemControlNumber)) { item.isRequestedByOrganization = true; }
          return item;
        });
      }

      const totalPages = Math.ceil(total / limit);
      return {
        items: properties,
        pagination: {
          totalItems: total,
          totalPages,
          currentPage: page,
          pageSize: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      };
    } catch (error) {
      logger.error(`Error searching properties: ${error}`);
      throw error;
    }
  }

  static async getCategories(): Promise<Array<{ categoryName: string; categoryCode: number; categoryCount: number }>> {
    return await propertyDetailsRepository.getCategories();
  }

  /**
   * Get property details by ICN (Item Control Number)
   * Returns property details in the format expected by the frontend
   * Falls back to filesystem if Elasticsearch returns no results
   */
  static async getPropertyDetailsByIcn(icn: string): Promise<any | null> {
    logger.info(`Fetching property details for ICN: ${icn}`);

    let entity = null;

    // Try Elasticsearch first
    try {
      entity = await propertyDetailsRepository.getPropertyDetailsByIcn(icn);
      if (entity) { logger.info(`Found property ${icn} in Elasticsearch`); }
    } catch (error) {
      logger.warn(`Elasticsearch lookup failed for ${icn}: ${error}. Attempting filesystem fallback.`);
    }

    // If not found in Elasticsearch, try filesystem
    if (!entity) {
      logger.info(`Property ${icn} not found in Elasticsearch, falling back to filesystem`);
      try {
        const propertyDetails = await PropertyDataService.getPropertyDetailsLegacy(icn);
        return propertyDetails;
      } catch (fsError) {
        logger.error(`Filesystem lookup also failed for ${icn}: ${fsError}`);
        throw new AppError(404, `Property with ICN '${icn}' not found in both Elasticsearch and filesystem`);
      }
    }

    // Convert PropertyDetailsEntity to frontend format
    const propertyData = entity.property_data;

    // Fetch images, flatFee, and summary data (for fscDescription and fileName) in parallel
    const [images, flatFee, summaryData] = await Promise.all([
      PropertyDataService.getPropertyImages(icn).catch(() => []),
      PropertyService.getFlatFeeIfExist(icn).catch(() => false),
      PropertyDataService.getPropertySummaryByICN(icn).catch(() => null),
    ]);

    const result: any = {
      propertyId: propertyData.propertyId,
      itemControlNumber: propertyData.itemControlNumber,
      itemName: propertyData.itemName,
      propertyDescription: propertyData.propertyDescription,
      quantity: propertyData.quantity,
      unitOfIssue: propertyData.unitOfIssue,
      totalAcquisitionCost: propertyData.totalAcquisitionCost,
      originalAcquisitionCost: propertyData.originalAcquisitionCost,
      conditionCode: propertyData.conditionCode,
      surplusReleaseDate:
        summaryData?.surplusReleaseDate ||
        propertyData.surplusReleaseDate ||
        '',
      categoryName: propertyData.categoryName,
      fscDescription: summaryData?.fscDescription || '',
      make: propertyData.make || '',
      model: propertyData.model || '',
      manufacturer: propertyData.manufacturer || '',
      propertyPOC: {
        firstName: propertyData.propertyPOC?.firstName || '',
        lastName: propertyData.propertyPOC?.lastName || '',
        phone: propertyData.propertyPOC?.phone?.toString() || '',
        email: propertyData.propertyPOC?.email || '',
      },
      propertyCustodian: {
        firstName: propertyData.propertyCustodian?.firstName || '',
        lastName: propertyData.propertyCustodian?.lastName || '',
        phone: propertyData.propertyCustodian?.phone?.toString() || '',
        email: propertyData.propertyCustodian?.email || '',
        reportingAgency: propertyData.agencyBureau || '',
      },
      submittedDate: propertyData.submittedDate || '',
      fileName: summaryData?.fileName || '',
      propertyLocation: {
        city: propertyData.propertyLocation?.city || '',
        stateCode: propertyData.propertyLocation?.stateCode || '',
        zip: propertyData.propertyLocation?.zip || '',
        line1: propertyData.propertyLocation?.line1 || '',
        line2: propertyData.propertyLocation?.line2 || '',
        line3: propertyData.propertyLocation?.line3 || '',
      },
      reportingAgencyAddress: {
        city: propertyData.reportingAgencyAddress?.city || '',
        stateCode: propertyData.reportingAgencyAddress?.stateCode || '',
        zip: propertyData.reportingAgencyAddress?.zip || '',
        line1: propertyData.reportingAgencyAddress?.line1 || '',
        line2: propertyData.reportingAgencyAddress?.line2 || '',
        line3: propertyData.reportingAgencyAddress?.line3 || '',
      },
      images: images || [],
      uploadItemList:
        propertyData.uploadItemList?.map((item: any) => ({
          id: item.id,
          itemType: item.itemType,
          name: item.name,
          uri: item.uri,
          attachmentOrder: item.attachmentOrder,
          deleted: item.deleted,
        })) || [],
      reimbursementRequired:
        propertyData.reimbursementRequiredFlag === 'N' ? 'N' : 'Y',
      isSubjectToCompliance: true, // Default value, adjust if needed
    };

    if (flatFee !== false && typeof flatFee === 'number')
      result.flatFee = flatFee;

    return result;
  }
}
