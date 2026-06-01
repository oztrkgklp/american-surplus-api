import { Request, Response, NextFunction } from 'express';

import { AppError } from '@/utils/response/appError';
import { sendError } from '@/utils/response/responseHelper';

import { RequestAttachmentTypeEnum } from '@/properties/enums/requestAttachmentTypes';

export const validateRequestAttachment = (req: Request, res: Response, next: NextFunction) => {
    try {
        const { display_name, attachment_type } = req.body;

        if (!display_name?.trim()) {
            throw new AppError(400, 'Display name is required');
        }

        if (!attachment_type || !(attachment_type in RequestAttachmentTypeEnum)) {
            throw new AppError(400, 'Invalid attachment type');
        }

        next();
    } catch (error) {
        sendError(req, res, error);
    }
};