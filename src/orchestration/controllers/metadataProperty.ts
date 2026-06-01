import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { PropertyMetadataService } from '@/metadata/services/property';

export const getDemilConditions = async (req: Request, res: Response): Promise<void> => {
    try {
        const demilConditions = await PropertyMetadataService.getDemilConditions();
        sendSuccess(res, demilConditions);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getDisposalConditions = async (req: Request, res: Response): Promise<void> => {
    try {
        const disposalConditions = await PropertyMetadataService.getDisposalConditions();
        sendSuccess(res, disposalConditions);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getPropertyTypes = async (req: Request, res: Response): Promise<void> => {
    try {
        const propertyTypes = await PropertyMetadataService.getPropertyTypes();
        sendSuccess(res, propertyTypes);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getSupplyConditions = async (req: Request, res: Response): Promise<void> => {
    try {
        const supplyConditionNames = await PropertyMetadataService.getSupplyConditions();
        sendSuccess(res, supplyConditionNames);
    } catch (error) {
        sendError(req, res, error);
    }
};



