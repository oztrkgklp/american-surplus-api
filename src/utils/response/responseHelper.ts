import { Request, Response } from 'express';
import { ValidationError } from 'yup';

import { ApiResponse } from '@/utils/response/ApiResponse';
import { AppError } from '@/utils/response/appError';
import { getLogger } from '@/utils/logger';

const logger = getLogger('responseHelper');

/**
 * Sends a success response.
 * @param res - The Express response object.
 * @param data - The data to include in the response.
 * @param statusCode - The HTTP status code (default: 200).
 */
export function sendSuccess<T>(res: Response, data?: T, statusCode = 200): void {
    const response: ApiResponse<T> = {
        success: true,
        ...(data !== undefined && { data }),
    };

    res.status(statusCode).send(response);
}

/**
 * Sends an error response, delegating error handling to `handleServiceError`.
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param error - The error object or message.
 */
export function sendError(req: Request, res: Response, error: unknown): void {
    let response: ApiResponse<null> = {
        success: false,
        error: "Internal server error",
    };
    let statusCode = 500;

    // Extract request details for better logging
    const requestInfo = {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        userId: req.user ? req.user.id : 'unauthenticated', // If using authentication middleware
    };

    if (error instanceof AppError) {
        // Handle known application-specific errors
        response.error = error.message;
        statusCode = error.statusCode;

        logger.error(`[${statusCode}] ${error.internalMessage || error.message}`, {
            ...requestInfo,
            stack: error.stack,
        });
    } else if (error !== null && typeof error === "object" && "statusCode" in error && "message" in error) {
        // Handle generic errors with status code
        const genericError = error as { statusCode: number; message: string; stack?: string };
        response.error = genericError.message;
        statusCode = genericError.statusCode;

        logger.error(`[${statusCode}] ${genericError.message}`, {
            ...requestInfo,
            stack: genericError.stack || 'No stack trace',
        });
    } else if (error instanceof ValidationError) {
        // Flatten all validation errors into a single message
        const messages = error.inner.map(e => `${e.message}`);
        response.error = messages.join('; ');
        statusCode = 400;

        logger.error(`[${statusCode}] Validation error`, {
            ...requestInfo,
            errors: messages,
        })
    } else {
        // Log unexpected errors
        logger.error(`[500] Unexpected error`, {
            ...requestInfo,
            error: (error as Error).message,
            stack: (error as Error).stack || 'No stack trace',
        });
    }

    res.status(statusCode).send(response);
    logger.debug("Response sent:", response);
}