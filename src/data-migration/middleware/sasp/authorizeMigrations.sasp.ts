import { Request, Response, NextFunction } from "express";
import { AppError } from "@/utils/response/appError";
import { sendError } from "@/utils/response/responseHelper";
import LegacyPropertyData from "@/data-migration/models/LegacyPropertyData.model";
import Scope from "@/authz/models/Scope";
import { ScopeType } from "@/enums/scope.enum";
import { IUserPermissions } from "@/authz/interfaces/IUserPermission";
import { PermissionCheckMode } from "../../../orchestration/middleware/checkPermission";
import { IUserCorperate } from "@/authz/interfaces/IUserScope";

export const authorizeMigrationsSasp = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: PermissionCheckMode = PermissionCheckMode.AND
) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = req.user;

        if (!user?.scopes) return sendError(req, res, new AppError(403, 'User does not have scope'));

        const nonSaspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type !== ScopeType.SASP && scope.isActive === true);
        const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive === true);
        
        // If not SASP skip
        if (nonSaspScope) {
            return next();
        }
        
        if (!saspScope) {
            return sendError(req, res, new AppError(403, 'No active SASP scope found for user'));
        }

        // Permission check if requiredPermissions are provided
        if (requiredPermissions && requiredPermissions.length > 0) {
            const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => saspScope.permissions?.[perm]);
            if (!hasAllPermissions) return sendError(req, res, new AppError(403, 'Insufficient permissions'));
        }

        return next();
    } catch (error) {
        return sendError(req, res, new AppError(500, 'Internal server error'));
    }
};