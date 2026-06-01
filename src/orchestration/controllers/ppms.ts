import { Request, Response } from 'express';

import { PropertyDataService } from '@/ppms/services/propertyData';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { PropertyService } from '@/properties/services/property';
import { PropertySearchResult, SummarySearchOptions } from '@/ppms/types/summary';
import Property from '@/properties/models/Property';

/**
 * Handles retrieving paginated property summaries.
 * Loads from memory (Redis) or disk, and slices in-memory for pagination.
 */
export const getPropertySummaries = async (req: Request, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 25;
        const categoryCode = parseInt(req.query.categoryCode as string);
        const itemName = req.query.itemName as string;
        const description = req.query.description as string;
        const sortOrder = req.query.sortOrder as 'ASC' | 'DESC';
        const futureSurplusReleaseDate = req.query.futureSurplusReleaseDate === 'true';
        const withImagesOnly = req.query.withImagesOnly === 'true';
        let options: Partial<SummarySearchOptions> = { categoryCode, itemName, description, sortOrder, futureSurplusReleaseDate, withImagesOnly };

        if (itemName && (itemName.match(/-/g)?.length ?? 0) > 1) {
            const icn = itemName.replace(/-/g, '');
            options = { categoryCode, icn, sortOrder, futureSurplusReleaseDate, withImagesOnly }
        }

        let result = await PropertyDataService.getAllPropertiesSummary(
            page,
            limit,
            options,
        );

        const requestedProperties = await PropertyService.getRequestByUserId(req.user.id, ['property_control_number'], false);

        result.items = result.items.map((item: PropertySearchResult & { isRequestedByOrganization?: boolean }) => {
            const requestedProperty = requestedProperties.find((p: Property) => p.property_control_number === item.itemControlNumber);
            if (requestedProperty) {
                item.isRequestedByOrganization = true;
            }
            return item;
        });

        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Returns detailed property data by ICN, including available image filenames.
 * Uses Summary dataset as primary source of truth for surplusReleaseDate.
 */
export const getPropertyByICN = async (req: Request, res: Response): Promise<void> => {
    try {
        const icn = req.params.icn;

        const [details, images, summaryData] = await Promise.all([
            (await PropertyDataService.getPropertyDetails(icn)).data,
            PropertyDataService.getPropertyImages(icn),
            PropertyDataService.getPropertySummaryByICN(icn),
        ]);

        // Remove uploadItemList from details before sending. Attachments are handled separately.
        delete (details as { uploadItemList?: unknown }).uploadItemList;
        const response = { 
            ...details, 
            images,
            // Override with Summary surplus release date 
            surplusReleaseDate: summaryData?.surplusReleaseDate || details.surplusReleaseDate
        };

        const flatFee = await PropertyService.getFlatFeeIfExist(details.itemControlNumber);
        if (flatFee !== false) (response as any).flatFee = flatFee;

        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Returns a property image by ICN and image name.
 */
export const getPropertyImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { icn, imageName } = req.params;

        const { buffer, mimeType } = await PropertyDataService.getPropertyImageBuffer(icn, imageName);

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(buffer);
    } catch (error) {
        sendError(req, res, error);
    }
};
