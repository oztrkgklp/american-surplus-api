import { Request, Response, NextFunction } from 'express';
import { IUserPermissions } from "@/authz/interfaces/IUserPermission";
import { IUserCorperate } from "@/authz/interfaces/IUserScope";
import Scope from "@/authz/models/Scope";
import { PermissionCheckMode } from "@/enums/permissionCheck.enum";
import { ScopeType } from "@/enums/scope.enum";
import { AppError } from "@/utils/response/appError";
import { sendError } from "@/utils/response/responseHelper";
import DoneeAccount from '@/organization/models/DoneeAccount';
import State from '@/states/models/State';

export const authorizeDoneeOnRequestAccess = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: PermissionCheckMode = PermissionCheckMode.AND) => async (req: Request, res: Response, next: NextFunction) => {
        try {
            const userId = req.user?.id; // user object is attached to the request by the auth middleware
            if (!userId) {
                throw new AppError(401, 'Unauthorized', 'User ID not found in request');
            }

            const user = req.user;
            const doneeAccountId = req.body.donee_account;

            if (!user?.scopes) {
                return sendError(req, res, new AppError(403, 'Donee Account does not exist or you do not have access to it.', 'User does not have scope'));
            }

            const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP);

            //If sasp scope is active then restrict access on request
            if (saspScope && saspScope.isActive) {
                return sendError(req, res, new AppError(403, 'Only Donee can request properties.',));
            }

            const doneeScope = (user.scopes as (Scope & IUserCorperate)[])
                .find(scope => scope.type === ScopeType.DONEE && doneeAccountId === scope?.doneeAccountId && scope?.isActive === true);


            if (!doneeScope) return sendError(req, res, new AppError(403, 'Donee Account does not exist or you do not have access to it.', 'User scope not found'));

            const state = await State.findOne({ where: { stateId: doneeScope.stateId, }, });

            //TO DO ???????? IS IT RIGHT PLACE TO PUT THIS CHECK AFTER SASP TOGGLES IT ? 
            if (!state || !state.allow_request) return sendError(req, res, new AppError(403, 'State is not allowing requests at the moment please try again later', 'State is not allowing requests'));

            if (requiredPermissions) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => doneeScope.permissions?.[perm]);

                if (!hasAllPermissions) {
                    return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'The Donee does not have permissions'));
                }
            }

            const doneeAccount = await DoneeAccount.findOne({
                where: {
                    id: doneeAccountId,
                    isActive: true,
                    organizationId: doneeScope.organizationId
                }
            });

            //if this one is not exist you probably have serious data issues.
            if (!doneeAccount) {
                throw new AppError(403, 'Invalid or unauthorized donee account');
            }

            req.doneeAccount = doneeAccount;

            return next();
        } catch (error) {
            sendError(req, res, error);
        }

    };