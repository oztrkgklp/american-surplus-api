import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import Scope from '@/authz/models/Scope';
import { PermissionCheckMode } from '@/enums/permissionCheck.enum';
import { ScopeType } from '@/enums/scope.enum';
import { DoneeAccountService } from '@/organization/services/donee';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { AppError } from '@/utils/response/appError';
import { sendError } from '@/utils/response/responseHelper';
import { Request, Response, NextFunction } from 'express';

export const authorizeOrganizationSASPAccess = (
    requiredPermissions?: (keyof IUserPermissions)[],
    accessOptions?: { isOnlySasp?: boolean },
    mode: PermissionCheckMode = PermissionCheckMode.AND) => async (req: Request, res: Response, next: NextFunction) => {
        try {
            const organizationId = req.params.organizationId;
            const user = req.user;

            if (!user?.scopes) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'User does not have scope'));
            }

            const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive === true);

            //Is not sasp or not not active on sasp scope then go to the next middleware
            if (!saspScope) {

                //if no sasp scope exist but still only reachable by sasps then it should return error
                if (accessOptions?.isOnlySasp) {
                    return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'No Sasp Scope found for user'));
                }

                return next();
            }

            //if permission required and provided check it.
            if (requiredPermissions) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => saspScope.permissions?.[perm]);

                if (!hasAllPermissions) {
                    return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'The Sasp does not have permissions'));
                }
            }


            const organization = await OrganizationUserService.getOrganizationById(organizationId);
            const stateId = (saspScope as (Scope & IUserCorperate))?.stateId;
            const doneeAccounts = await DoneeAccountService.getDoneeAccounts(organizationId);

            const hasStateId = doneeAccounts.some((doneeAccount) => doneeAccount.state?.stateId === stateId);

            if (!hasStateId || !organization) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'The Sasp state does not match with Donee Account'));
            }
            return next();
        } catch (error) {
            sendError(req, res, error);
        }

    }