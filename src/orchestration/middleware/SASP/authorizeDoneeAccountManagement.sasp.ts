import { IUserPermissions } from "@/authz/interfaces/IUserPermission";
import { NextFunction } from "express";
import { PermissionCheckMode } from "../checkPermission";
import { Request, Response } from "express";
import { sendError } from "@/utils/response/responseHelper";
import { AppError } from "@/utils/response/appError";
import { IUserCorperate } from "@/authz/interfaces/IUserScope";
import Scope from "@/authz/models/Scope";
import { ScopeType } from "@/enums/scope.enum";
import DoneeAccount from "@/organization/models/DoneeAccount";

export const authorizeDoneeAccountManagement = (
    requiredPermissions?: (keyof IUserPermissions)[],
    mode: PermissionCheckMode = PermissionCheckMode.AND
) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        const stateId = Number(req.params.stateId);
        const doneeAccountId = Number(req.params.doneeAccountId);
        const user = req.user;

        if (isNaN(Number(stateId)) || !doneeAccountId || !user.id) return sendError(req, res, new AppError(403, "Missing stateId, doneeAccountId, or userId"));

        if (!user?.scopes) return sendError(req, res, new AppError(403, 'DoneeAccount does not exist or you do not have access to it.', 'User does not have scope'));


        const doneeAccount = await DoneeAccount.findByPk(doneeAccountId);
        if (!doneeAccount) return sendError(req, res, new AppError(404, "DoneeAccount not found"));


        if (doneeAccount.stateId !== stateId) return sendError(req, res, new AppError(403, "DoneeAccount state does not match the state in parameters"));

        const saspScope = (user.scopes as (Scope & IUserCorperate)[]).find(scope => scope.type === ScopeType.SASP && scope.isActive === true);
        if (!saspScope) return sendError(req, res, new AppError(403, 'Sasp does not exist or you do not have access to it.', 'No Sasp Scope found for user'));


        if (saspScope.stateId !== stateId) return sendError(req, res, new AppError(403, "User does not have access to this state"));


        if (requiredPermissions) {
            const hasAllPermissions = requiredPermissions[mode === PermissionCheckMode.AND ? 'every' : 'some']((perm) => saspScope.permissions?.[perm]);

            if (!hasAllPermissions) {
                return sendError(req, res, new AppError(403, 'Sasp does not exist or you do not have access to it.', 'The Sasp does not have permissions'));
            }
        }

        next();
    } catch (error) {
        console.error("Authorization error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};