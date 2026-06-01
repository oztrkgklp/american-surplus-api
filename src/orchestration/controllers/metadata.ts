import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { getAllMetadata } from '@/metadata/services/metadata';

export const getAll = async (req: Request, res: Response): Promise<void> => {
    try {
        const metadata = await getAllMetadata();
        sendSuccess(res, metadata);
    } catch (error) {
        sendError(req, res, error);
    }
};