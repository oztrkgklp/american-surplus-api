import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import Scope from '@/authz/models/Scope';
import { ScopeType } from '@/enums/scope.enum';
import DoneeAccount from '@/organization/models/DoneeAccount';
import Property from '@/properties/models/Property';
import { AppError } from '@/utils/response/appError';
import { sendError } from '@/utils/response/responseHelper';
import RequestModel from '@/properties/models/Request';
import { Request, Response, NextFunction } from 'express';
import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import { PermissionCheckMode } from '@/enums/permissionCheck.enum';


export const authorizePropertySASPAccess = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: PermissionCheckMode = PermissionCheckMode.AND) => async (req: Request, res: Response, next: NextFunction) => {
        try {
            const propertyId = parseInt(req.params.propertyId);
            const user = req.user;

            if (!user?.scopes) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'User does not have scope'));
            }

            const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive === true);

            // If not SASP skip
            if (!saspScope) {
                return next();
            }

            //if permission required and provided check it.
            if (requiredPermissions) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => saspScope.permissions?.[perm]);

                if (!hasAllPermissions) {
                    return sendError(req, res, new AppError(403, 'Property does not exist or you do not have access to it.', 'The Sasp does not have permissions'));
                }
            }

            const property = await Property.findByPk(propertyId, {
                include: [
                    {
                        model: RequestModel,
                        as: 'request',
                        include: [
                            {
                                model: DoneeAccount,
                                as: 'doneeAccount',
                                attributes: ['id', 'stateId'],
                            },
                        ],
                    },
                ],
            });

            if (!property || !property.request || !property.request?.doneeAccount) {
                throw new AppError(404, 'Property or associated request not found');
            }

            const stateId = saspScope.stateId;
            const doneeState = property.request?.doneeAccount?.stateId;

            if (stateId !== doneeState) {
                return sendError(req, res, new AppError(403, 'Property does not exist or you do not have access to it.', 'The Sasp state does not match with Donee Account State'));
            }

            return next();
        } catch (error) {

        }

    };
