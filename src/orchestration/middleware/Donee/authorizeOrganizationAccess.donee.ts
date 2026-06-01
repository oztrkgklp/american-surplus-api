import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/utils/response/appError';
import { sendError } from '@/utils/response/responseHelper';
import Scope from '@/authz/models/Scope';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import { ScopeType } from '@/enums/scope.enum';
import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import { PermissionCheckMode } from '@/enums/permissionCheck.enum';

export const authorizeOrganizationDoneeAccess = (
    requiredPermissions?: (keyof IUserPermissions)[],
    accessOptions?: { isOnlyDonee?: boolean; permissionDeniedMessage?: string },
    mode: PermissionCheckMode = PermissionCheckMode.AND) => async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.id; // user object is attached to the request by the auth middleware
            if (!userId) {
                throw new AppError(401, 'Unauthorized', 'User ID not found in request');
            }

            const organizationId = req.params.organizationId;
            const user = req.user;

            if (!user?.scopes) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'User does not have scope'));
            }

            const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive);

            //If sasp scope is active then continue
            if (saspScope && !accessOptions?.isOnlyDonee) {
                return next();
            }

            //If not sasp 
            const organizationScope = (user.scopes as (Scope & IUserCorperate)[])
                .find(scope => scope.type === ScopeType.ORGANIZATION && organizationId === scope?.organizationId && scope.isActive === true);


            if (!organizationScope) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'Organization scope not found'));
            }

            //if permission required and provided check it.
            if (requiredPermissions && requiredPermissions.length > 0) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => organizationScope.permissions?.[perm]);

                if (!hasAllPermissions) {
                    return sendError(
                        req,
                        res,
                        new AppError(
                            403,
                            accessOptions?.permissionDeniedMessage || 'Property does not exist or you do not have access to it.',
                            'The Organization does not have permissions'
                        )
                    );
                }
            }

            return next();
        } catch (error) {
            sendError(req, res, error);
        }

    };