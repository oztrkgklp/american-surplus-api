import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/response/appError";
import { sendError } from "@/utils/response/responseHelper";
import LegacyPropertyData from "@/data-migration/models/LegacyPropertyData.model";
import Scope from "@/authz/models/Scope";
import { ScopeType } from "@/enums/scope.enum";
import { IUserCorperate } from "@/authz/interfaces/IUserScope";
import DoneeAccount from "@/organization/models/DoneeAccount";
import { IUserPermissions } from "@/authz/interfaces/IUserPermission";
import { PermissionCheckMode } from "@/enums/permissionCheck.enum";

export const authorizeMigrationDonee = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: 'AND' | 'OR' = 'AND'
) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const legacyPropertyId = Number(req.params.legacyPropertyId);
        const doneeAccountId = Number(req.params.doneeAccountId);
        const user = req.user;

        if (!user?.scopes) return sendError(req, res, new AppError(403, 'User does not have scopes'));

        // Find user's active Donee scope
        const doneeScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.DONEE && scope.isActive === true && scope.doneeAccountId === doneeAccountId);
        if (!doneeScope) return sendError(req, res, new AppError(403, 'No active Donee scope for this account'));


        // Permission check if requiredPermissions is provided
        if (requiredPermissions) {
            const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => doneeScope.permissions?.[perm]);
            if (!hasAllPermissions) return sendError(req, res, new AppError(403, 'Property does not exist or you do not have access to it.', 'Donee scope does not have permissions'));
        }

        // Fetch legacy property and donee account
        const [legacyProperty, doneeAccount] = await Promise.all([
            LegacyPropertyData.findByPk(legacyPropertyId),
            DoneeAccount.findByPk(doneeAccountId)
        ]);

        if (!legacyProperty) return sendError(req, res, new AppError(404, 'Legacy property record not found'));
        if (!doneeAccount) return sendError(req, res, new AppError(404, 'Donee account not found'));

        // Check if donee account numbers match
        if (legacyProperty.donee_account_number !== doneeAccount.name) return sendError(req, res, new AppError(403, 'Donee account number does not match legacy property'));

        // Attach to request for controller use if needed
        (req as any).legacyProperty = legacyProperty;
        (req as any).doneeAccount = doneeAccount;

        return next();
    } catch (error) {
        return sendError(req, res, new AppError(500, 'Internal server error'));
    }
};