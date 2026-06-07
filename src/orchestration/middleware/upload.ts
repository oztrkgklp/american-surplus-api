import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

import { AppError } from '@/utils/response/appError';
import { allowedMimeTypes } from '@/utils/storage/fileTypes';
import { sendError } from '@/utils/response/responseHelper';

export const upload = multer({
    storage: multer.memoryStorage(), // no disk usage
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB limit
});

export const validateFileUpload = (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = req.file;

        if (!file) {
            throw new AppError(400, 'File is required');
        }

        if (!allowedMimeTypes.includes(file.mimetype)) {
            throw new AppError(400, `Invalid file type: ${file.mimetype}`);
        }

        next();
    } catch (err) {
        sendError(req, res, err);
    }
};

const avatarMimeTypes = ['image/jpeg', 'image/png'];

export const validateAvatarUpload = (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = req.file;

        if (!file) {
            throw new AppError(400, 'Avatar file is required');
        }

        if (!avatarMimeTypes.includes(file.mimetype)) {
            throw new AppError(400, 'Avatar must be a PNG or JPEG image');
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new AppError(400, 'Avatar must be 5 MB or smaller');
        }

        next();
    } catch (err) {
        sendError(req, res, err);
    }
};

export const validatePickupFiles = (req: Request, res: Response, next: NextFunction) => {
    try {
        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) throw new AppError(400, 'At least one evidence file is required');

        for (const file of files) {
            if (!allowedMimeTypes.includes(file.mimetype))throw new AppError(400, `Invalid file type: ${file.mimetype}`);
        }
        next();
    } catch (err) {
        sendError(req, res, err);
    }
};
