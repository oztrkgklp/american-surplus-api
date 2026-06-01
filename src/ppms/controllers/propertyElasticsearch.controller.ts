import { Request, Response } from 'express';
import { PropertyElasticsearchService } from '@/ppms/services/propertyElasticsearch.service';
import { PropertySummarySearchOptions } from '@/elasticsearch/repositories/propertyDetails.repository';
import { AppError } from '@/utils/response/appError';
import { getLogger } from '@/utils/logger';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';

const logger = getLogger('PropertyElasticsearchController');

/**
 * Controller for Elasticsearch-based property search operations
 *
 * This controller provides endpoints for advanced property search using Elasticsearch
 * with all the requested filtering capabilities.
 */
export class PropertyElasticsearchController {
  /**
   * Property search with multiple criteria
   * GET /api/properties/elasticsearch/search
   */
  static async searchProperties(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        // General search
        search,
        // Text search fields
        itemName,
        fscDescription,
        categoryName,
        make,
        model,
        manufacturer,
        // Filter fields
        reimbursementRequired,
        conditionCode,
        stateCode,
        categoryCode,
        agencyBureau,
        isInternal,
        withImagesOnly,
        // Geographic search
        latitude,
        longitude,
        radiusMiles,
        // Date filters
        submittedDateFrom,
        submittedDateTo,
        surplusReleaseDateFrom,
        surplusReleaseDateTo,
        // Sorting
        sortField,
        sortOrder = 'DESC',
      } = req.query;

      // Helper function to parse array parameters (supports comma-separated or multiple values)
      const parseArrayParam = (param: any): string[] | undefined => {
        if (!param) return undefined;
        if (Array.isArray(param)) return param as string[];
        if (typeof param === 'string') {
          // Handle comma-separated values
          return param.includes(',')
            ? param.split(',').map((v) => v.trim())
            : [param];
        }
        return undefined;
      };

      // Helper function to parse array of numbers (for categoryCode)
      const parseNumberArrayParam = (param: any): number[] | undefined => {
        if (!param) return undefined;
        if (Array.isArray(param)) {
          return param
            .map((v) => parseInt(v as string))
            .filter((v) => !isNaN(v));
        }
        if (typeof param === 'string') {
          // Handle comma-separated values
          return param.includes(',')
            ? param
                .split(',')
                .map((v) => parseInt(v.trim()))
                .filter((v) => !isNaN(v))
            : [parseInt(param)].filter((v) => !isNaN(v));
        }
        return undefined;
      };

      // Helper function to parse boolean parameter (only set if explicitly provided)
      const parseBooleanParam = (param: any): boolean | undefined => {
        if (param === undefined || param === null || param === '')
          return undefined;
        if (typeof param === 'string') {
          if (param === 'true') return true;
          if (param === 'false') return false;
          return undefined;
        }
        return undefined;
      };

      const searchOptions: PropertySummarySearchOptions = {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        search: search as string,
        itemName: itemName as string,
        fscDescription: fscDescription as string,
        categoryName: categoryName as string,
        make: make as string,
        model: model as string,
        manufacturer: manufacturer as string,
        reimbursementRequired: parseBooleanParam(reimbursementRequired),
        conditionCode: parseArrayParam(conditionCode),
        stateCode: parseArrayParam(stateCode),
        categoryCode: parseNumberArrayParam(categoryCode),
        agencyBureau: agencyBureau as string,
        isInternal: isInternal === 'true',
        withImagesOnly: withImagesOnly === 'true',
        latitude: latitude ? parseFloat(latitude as string) : undefined,
        longitude: longitude ? parseFloat(longitude as string) : undefined,
        radiusMiles: radiusMiles
          ? parseFloat(radiusMiles as string)
          : undefined,
        submittedDateFrom: submittedDateFrom as string,
        submittedDateTo: submittedDateTo as string,
        surplusReleaseDateFrom: surplusReleaseDateFrom as string,
        surplusReleaseDateTo: surplusReleaseDateTo as string,
        sortField: sortField as string,
        sortOrder: sortOrder as 'ASC' | 'DESC',
      };

      // Remove undefined values
      Object.keys(searchOptions).forEach((key) => {
        if (
          searchOptions[key as keyof PropertySummarySearchOptions] === undefined
        ) {
          delete searchOptions[key as keyof PropertySummarySearchOptions];
        }
      });

      const result = await PropertyElasticsearchService.searchProperties(
        searchOptions.page || 1,
        searchOptions.limit || 20,
        searchOptions,
        req.user?.id
      );

      sendSuccess(res, result);
    } catch (error) {
      logger.error(`Error in searchProperties: ${error}`);
      sendError(req, res, new AppError(500, `Error searching properties.`));
    }
  }

  /**
   * Get property details by ICN (Item Control Number)
   * GET /api/properties/elasticsearch/details/:icn
   */
  static async getPropertyDetailsByIcn(req: Request, res: Response): Promise<void> {
    try {
      const { icn } = req.params;
      if (!icn) throw new AppError(400, 'ICN parameter is required');

      const propertyDetails = await PropertyElasticsearchService.getPropertyDetailsByIcn(icn);
      if (!propertyDetails) throw new AppError(404, `Property with ICN '${icn}' not found`)
      
      const propertyData = propertyDetails?.data ?? propertyDetails;  
      return sendSuccess(res, propertyData);
    } catch (error) {
      logger.error(`Error in getPropertyDetailsByIcn: ${error}`);
      return sendError(req, res, error);
    }
  }
}
