import { Request, Response, NextFunction } from 'express';
import { AuthService } from '@/authn/services/authentication';
import { sendError } from '@/utils/response/responseHelper';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
    try {
        // Validate token and get full user object
        const user = await AuthService.validateToken(req);

        // Assign user object to request
        req.user = user;
        next();
    } catch (error) {
        sendError(req, res, error);
    }
}
