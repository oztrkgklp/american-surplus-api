import { Request, Response, NextFunction } from 'express';
import { sendError } from '@/utils/response/responseHelper';
import { AppError } from '@/utils/response/appError';
import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import Scope from '@/authz/models/Scope';
import { ScopeType } from '@/enums/scope.enum';
import { PermissionCheckMode } from '@/enums/permissionCheck.enum';

/**
 * Middleware to authorize report access for SASP admins
 * Verifies if user has SASP scope for the requested state
 * @param requiredPermissions - Optional array of required permissions
 * @param mode - Permission check mode (AND/OR)
 */
export const authorizeSaspReports = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: PermissionCheckMode = PermissionCheckMode.AND
) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const stateId = Number(req.params.stateId) || Number(req.body.state_id);
        const user = req.user;

        if (isNaN(stateId) || !user?.id) return sendError(req, res, new AppError(403, 'Missing stateId or userId'));
        if (!user?.scopes) return sendError(req, res, new AppError(403, 'Access denied', 'User does not have SASP scope'));


        const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(
            (scope) => scope.type === ScopeType.SASP && scope.isActive === true
        );

        if (!saspScope) return sendError(req, res, new AppError(403, 'Access denied', 'No SASP scope found for user'));
        if (saspScope.stateId !== stateId) return sendError(req, res, new AppError(403, 'Access denied', 'User does not have access to this state'));


        // Check required permissions if provided
        if (requiredPermissions) {
            const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some'](
                (perm) => saspScope.permissions?.[perm]
            );

            if (!hasAllPermissions) return sendError(req, res, new AppError(403, 'Access denied', 'User does not have required permissions'));
        }

        (req as any).saspScope = saspScope;

        next();
    } catch (error) {
        console.error('SASP Authorization error:', error);
        sendError(req, res, error as any);
    }
};
