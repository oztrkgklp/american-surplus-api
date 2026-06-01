import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { withTransaction } from '@/utils/transactionalOperation';
import { AppError } from '@/utils/response/appError';
import { UserFilterKeys } from '@/enums/userFilterKeys.enum';

/**
 * Handles fetching organization users with optional pagination, filter and sort.
 * Query params: page, limit (or pageSize), filterKey, filterValue, operator, sortBy, sortOrder.
 */
export const getOrganizationUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.organizationId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || parseInt(req.query.pageSize as string) || 10;
        const filterKey = req.query.filterKey as UserFilterKeys | undefined;
        const filterValue = req.query.filterValue as string | undefined;
        const operator = (req.query.operator as string) || 'contains';
        const sortBy = req.query.sortBy as string | undefined;
        const sortOrder = req.query.sortOrder as string | undefined;

        const result = await OrganizationUserService.getOrganizationUsersPaginated(
            orgId,
            page,
            limit,
            filterKey,
            operator,
            filterValue,
            sortBy,
            sortOrder
        );
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Handles adding a user to an organization.
 */
export const addUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const orgId = req.params.orgId; // Extract `orgId` from the request
        const userId = req.body.userId; // Extract `userId` from the request body
        const newOrganizationUser = await OrganizationUserService.addUser(orgId, userId, false); // Add user to the organization
        sendSuccess(res, newOrganizationUser, 201);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const activation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const { userId, isActive } = req.body;

        await withTransaction(async (transaction) => {
            const updatedOrganizationUser = await OrganizationUserService.setActivateStatus(isActive, organizationId, userId, transaction)
            sendSuccess(res, { organizationUser: updatedOrganizationUser });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Handles fetching a specific organization user record.
 */
export const getOrganizationUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params; // Extract `organizationId` from the request params
        const { userId } = req.body; // Extract `userId` from the request body

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(organizationId, userId);
        if (!organizationUser) throw new AppError(404, 'Organization user not found');

        sendSuccess(res, organizationUser);
    } catch (error) {
        sendError(req, res, error);
    }
};



/**
 * Handles assigning a role to an organization user.
 */
export const assignRoleToOrganizationUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { organizationId } = req.params;
        const { userId, role_name } = req.body;

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(organizationId, userId);
        if (!organizationUser) throw new AppError(404, 'Organization user not found');

        await withTransaction(async (transaction) => {
            const updatedOrganizationUser = await OrganizationUserService.assignRoleToOrganizationUser(
                {
                    organizationUserId: organizationUser.id,
                    userId,
                    role_name,
                },
                transaction
            );

            sendSuccess(res, { organizationUser: updatedOrganizationUser });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};