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

export const authorizeMigrationsDonee = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: 'AND' | 'OR' = 'AND'
) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { doneeAccountId } = req.query;
        const user = req.user;

        if (!user?.scopes) return sendError(req, res, new AppError(403, 'User does not have scopes'));

        const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP);

        //If sasp scope is active then continue
        if (saspScope && saspScope.isActive) {
            return next()
        }

        // Find user's active Donee scope
        const doneeScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.DONEE && scope.isActive === true && scope.doneeAccountId === Number(doneeAccountId));
        if (!doneeScope) return sendError(req, res, new AppError(403, 'No active Donee scope for this account'));


        // Permission check if requiredPermissions is provided
        if (requiredPermissions) {
            const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => doneeScope.permissions?.[perm]);
            if (!hasAllPermissions) return sendError(req, res, new AppError(403, 'Property does not exist or you do not have access to it.', 'Donee scope does not have permissions'));
        }

        // Fetch legacy property and donee account
        const doneeAccount = await DoneeAccount.findByPk(String(doneeAccountId));

        if (!doneeAccount) return sendError(req, res, new AppError(404, 'Donee account not found'));

        // Attach to request for controller use if needed
        (req as any).doneeAccount = doneeAccount;

        return next();
    } catch (error) {
        return sendError(req, res, new AppError(500, 'Internal server error'));
    }
};