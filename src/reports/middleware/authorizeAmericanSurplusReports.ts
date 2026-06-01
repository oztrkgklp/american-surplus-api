import { Request, Response, NextFunction } from 'express';
import { sendError } from '@/utils/response/responseHelper';
import { AppError } from '@/utils/response/appError';
import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import { PermissionCheckMode } from '@/enums/permissionCheck.enum';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import Scope from '@/authz/models/Scope';
import { ScopeType } from '@/enums/scope.enum';

/**
 * Middleware to authorize report access for American Surplus admins.
 */
export const authorizeAmericanSurplusReports = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: PermissionCheckMode = PermissionCheckMode.AND
) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const user = req.user;

        if (!user?.id) {
            return sendError(req, res, new AppError(401, 'Unauthorized', 'User not authenticated'));
        }

        if ((req as any).saspScope) {
            return next();
        }

        if (!(user as any).isAdmin) {
            return sendError(
                req,
                res,
                new AppError(403, 'Access denied', 'User is not American Surplus admin')
            );
        }

        if (requiredPermissions && user?.scopes) {
            const userScopes = user.scopes as (Scope & IUserCorperate)[];
            const adminScope = userScopes.find(
                (scope) => scope.type === ScopeType.ORGANIZATION && scope.isActive === true
            );

            if (adminScope && requiredPermissions) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some'](
                    (perm) => adminScope.permissions?.[perm]
                );

                if (!hasAllPermissions) {
                    return sendError(req, res, new AppError(403, 'Access denied', 'User does not have required permissions'));
                }
            }
        }

        next();
    } catch (error) {
        console.error('American Surplus authorization error:', error);
        sendError(req, res, error as any);
    }
};
