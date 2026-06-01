import { Request, Response, NextFunction } from 'express';
import { IUserPermissions } from "@/authz/interfaces/IUserPermission";
import { IUserCorperate } from "@/authz/interfaces/IUserScope";
import Scope from "@/authz/models/Scope";
import { PermissionCheckMode } from "@/enums/permissionCheck.enum";
import { ScopeType } from "@/enums/scope.enum";
import { AppError } from "@/utils/response/appError";
import { sendError } from "@/utils/response/responseHelper";
import { RequestService } from '@/properties/services/request';



export const authorizeRequestSASPAccess = (
    requiredPermissions?: (keyof IUserPermissions)[],
    accessOptions?: { isOnlySasp?: boolean, isAllRequest?: boolean },
    mode: PermissionCheckMode = PermissionCheckMode.AND) => async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.id; // user object is attached to the request by the auth middleware
            if (!userId) {
                throw new AppError(401, 'Unauthorized', 'User ID not found in request');
            }

            const user = req.user;

            if (!user?.scopes) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'User does not have scope'));
            }

            const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive === true);

            //If not sasp then continue
            if (!saspScope) {

                //if no sasp scope exist but still only reachable by sasps then it should return error
                if (accessOptions?.isOnlySasp) {
                    return sendError(req, res, new AppError(403, 'Request does not exist or you do not have access to it.', 'No Sasp Scope found for user'));
                }

                next();
                return;
            }

            if (accessOptions?.isAllRequest) {
                return next()
            }

            const requestId = Number(req.params.requestId);
            const request = await RequestService.getRequestById(requestId, false);
            req.request = request;
            const requestState = request?.doneeAccount?.stateId;

            if (saspScope.stateId !== requestState) {
                return sendError(req, res, new AppError(403, 'Request does not exist or you do not have access to it.', 'The Sasp state does not match with request state'));
            }

            //if permission required and provided check it.
            if (requiredPermissions) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => saspScope.permissions?.[perm]);

                if (!hasAllPermissions) {
                    return sendError(req, res, new AppError(403, 'Request does not exist or you do not have access to it.', 'The Donee does not have permissions'));
                }
            }

            next();
        } catch (error) {
            sendError(req, res, error);
        }
    };