import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to capture raw request body before JSON parsing
 * This is needed for webhook signature verification where we need
 * the exact original body string to compute HMAC hash
 */
export const captureRawBody = (req: Request, res: Response, next: NextFunction): void => {
    let data = '';

    req.setEncoding('utf8');

    req.on('data', (chunk: string) => {
        data += chunk;
    });

    req.on('end', () => {
        (req as any).rawBody = data;
        next();
    });
};
