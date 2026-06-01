import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { PermissionService } from '@/authz/services/permission';
import { parseId } from '@/utils/validators';

export const getPermissions = async (req: Request, res: Response): Promise<void> => {
    try {
        const permissions = await PermissionService.getPermissions();
        sendSuccess(res, permissions);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getPermissionById = async (req: Request, res: Response): Promise<void> => {
    try {
        const id = parseId(req.params.id);
        const permission = await PermissionService.getPermissionById(id);
        sendSuccess(res, permission);
    } catch (error) {
        sendError(req, res, error);
    }
};
