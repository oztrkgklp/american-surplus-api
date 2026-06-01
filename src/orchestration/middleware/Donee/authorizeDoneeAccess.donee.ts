import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import Scope from '@/authz/models/Scope';
import { PermissionCheckMode } from '@/enums/permissionCheck.enum';
import { ScopeType } from '@/enums/scope.enum';
import { AppError } from '@/utils/response/appError';
import { sendError } from '@/utils/response/responseHelper';
import { Request, Response, NextFunction } from 'express';


export const authorizeOrganizationDoneeAccess = (
    requiredPermissions?: (keyof IUserPermissions)[],
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

            const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP);

            //If sasp scope is active then continue
            if (saspScope && saspScope.isActive) {
                return next();
            }

            const doneeScope = (user.scopes as (Scope & IUserCorperate)[])
                .find(scope => scope.type === ScopeType.DONEE && organizationId === scope?.organizationId && scope.isActive === true);


            if (!doneeScope) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'Organization scope not found'));
            }

            if (requiredPermissions) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => doneeScope.permissions?.[perm]);

                if (!hasAllPermissions) {
                    return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'The Donee does not have permissions'));
                }
            }

            return next();
        } catch (error) {
            sendError(req, res, error);
        }

    };