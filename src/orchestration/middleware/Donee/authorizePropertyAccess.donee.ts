import DoneeAccount from '@/organization/models/DoneeAccount';
import Property from '@/properties/models/Property';
import { AppError } from '@/utils/response/appError';
import { sendError } from '@/utils/response/responseHelper';
import { Request, Response, NextFunction } from 'express';
import RequestModel from '@/properties/models/Request';
import { ScopeType } from '@/enums/scope.enum';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import Scope from '@/authz/models/Scope';
import { PermissionCheckMode } from '@/enums/permissionCheck.enum';
import { IUserPermissions } from '@/authz/interfaces/IUserPermission';

export const authorizePropertyDoneeAccess = (
    requiredPermissions?: (keyof IUserPermissions)[],
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

            const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope?.isActive === true);

            //If sasp scope is active then continue
            if (saspScope) {
                return next();
            }

            const propertyId = parseInt(req.params.propertyId);

            if (isNaN(propertyId)) {
                throw new AppError(400, 'Invalid property ID');
            }

            // Load the property with its full chain of associations
            const property = await Property.findByPk(propertyId, {
                include: [{
                    model: RequestModel,
                    as: 'request',
                    include: [{
                        model: DoneeAccount,
                        as: 'doneeAccount',
                        attributes: ['id', 'organizationId']
                    }]
                }]
            });

            if (!property || !property.request) {
                throw new AppError(404, 'Property or associated request not found');
            }

            const organizationId = property.request.doneeAccount?.organizationId;
            if (!organizationId) {
                throw new AppError(403, 'No organization found for this property', 'No organization found');
            }

            const doneeScope = (user.scopes as (Scope & IUserCorperate)[])
                .find(scope => scope.type === ScopeType.DONEE && organizationId === scope?.organizationId && scope.isActive === true);


            if (!doneeScope) {
                return sendError(req, res, new AppError(403, 'Organization does not exist or you do not have access to it.', 'Donee scope not found'));
            }

            //some times we might need permission for donees
            if (requiredPermissions) {
                const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => doneeScope.permissions?.[perm]);
                if (!hasAllPermissions) {
                    return sendError(req, res, new AppError(403, 'Property does not exist or you do not have access to it.', 'Donee scope does not have permissions'));
                }

            }

            // Access granted
            return next();
        } catch (error) {
            sendError(req, res, error);
        }
    };
