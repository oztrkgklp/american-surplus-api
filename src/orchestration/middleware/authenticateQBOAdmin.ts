import { Request, Response, NextFunction } from 'express';
import { authenticate } from './authenticate';
import { sendError } from '@/utils/response/responseHelper';
import { AppError } from '@/utils/response/appError';
import config from '@/config/envvars';
import OrganizationUser from '@/organization/models/OrganizationUser';
import { getLogger } from '@/utils/logger';
const logger = getLogger('QBOAdminMiddleware');

/**
 * Middleware to authenticate user and verify they belong to the admin organization
 * This middleware must be used on all QBO-related endpoints
 * Only users from the admin organization can interact with QBO settings
 */
export async function authenticateQBOAdmin(req: Request, res: Response, next: NextFunction) {
    try {
        // First, authenticate the user
        await new Promise<void>((resolve, reject) => {
            authenticate(req, res, (err?: any) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const user = req.user;
        if (!user || !user.id) throw new AppError(401, 'User not authenticated');

        logger.info(`QBO admin check for user: ${user.id}`);

        // Get admin org ID from config
        const adminOrgId = config.admin.adminOrgId;
        if (!adminOrgId) {
            logger.error('ADMIN_ORG_ID not configured in environment');
            throw new AppError(500, 'Admin organization not configured');
        }

        // Find user's organization
        const organizationUser = await OrganizationUser.findOne({ where: { userId: user.id } });

        if (!organizationUser) {
            logger.warn(`User ${user.id} is not associated with any organization`);
            throw new AppError(403, 'User is not associated with any organization');
        }

        // Verify user belongs to admin organization
        if (organizationUser.organizationId !== adminOrgId) {
            logger.warn(`User ${user.id} attempted QBO access but belongs to org ${organizationUser.organizationId}, not admin org ${adminOrgId}`);
            throw new AppError(403, 'Only users from the admin organization can access QuickBooks settings');
        }

        // Attach organization ID to request for potential future use
        (req as any).adminOrgId = adminOrgId;

        logger.info(`QBO admin check passed for user: ${user.id}`);
        next();
    } catch (error) {
        logger.error('QBO admin authentication failed', { error });
        sendError(req, res, error);
    }
}
