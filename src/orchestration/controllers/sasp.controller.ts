import { DoneeAccountService } from '@/organization/services/donee';
import SaspService from '@/sasp/services/sasp.service';
import { AppError } from '@/utils/response/appError';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { withTransaction } from '@/utils/transactionalOperation';
import { Request, Response } from 'express';
import { Activity } from '@/sasp/models/SaspAuditLogs.entity';
import SaspAuditLog from '@/sasp/models/SaspAuditLogs.entity';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import DisposalCondition from '@/metadata/models/DisposalCondition';
import { UserFilterKeys } from '@/enums/userFilterKeys.enum';
import { InvitationFilterKeys } from '@/enums/invitationFilterKeys.enum';


export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || parseInt(req.query.pageSize as string) || 10;
        const filterKey = req.query.filterKey as string | undefined;
        const filterValue = req.query.filterValue as string | undefined;
        const operator = (req.query.operator as string) || 'contains';
        const sortBy = req.query.sortBy as string | undefined;
        const sortOrder = req.query.sortOrder as string | undefined;

        const result = await SaspService.listUsersPaginated(
            Number(stateId),
            page,
            limit,
            filterKey as UserFilterKeys,
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

export const getUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { userId } = req.body;
        const saspUsers = await SaspService.getUser(Number(stateId), userId);
        sendSuccess(res, saspUsers);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const inviteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const invited_by = req.user?.id;
        const { invited_user_id, role } = req.body;

        await withTransaction(async (transaction) => {
            const invitation = await SaspService.inviteUser(Number(stateId), invited_user_id, invited_by, role, transaction);
            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: Activity.INVITATION_SENT,
                metadata: { invited_user_id: invited_user_id, role: role },
            }, { transaction });
            sendSuccess(res, { invitation });
        });
    } catch (err) {
        sendError(req, res, err);
    }
}


export const cancelInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { invited_user_id } = req.body;

        await withTransaction(async (transaction) => {
            await SaspService.cancelInvitation(Number(stateId), invited_user_id, transaction);
            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: Activity.INVITATION_CANCELED,
                metadata: { invitedUserId: invited_user_id },
            }, { transaction });
            sendSuccess(res, { message: 'Invitation cancelled successfully' });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const resendInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { invited_user_id } = req.body;

        await SaspService.resendInvitation(Number(stateId), invited_user_id);
        await SaspAuditLog.create({
            state_id: Number(stateId),
            activator: req.user?.id,
            activity: Activity.INVITATION_RESENT,
            metadata: { invitedUserId: invited_user_id },
        });
        sendSuccess(res, { message: 'Invitation resent successfully' });
    } catch (err) {
        sendError(req, res, err);
    }
};



export const respondInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { userId, isAccepted } = req.body;
        if (req.user?.id !== userId) throw new Error('Authenticated user does not match the userId provided in the request');

        await withTransaction(async (transaction) => {
            const response = await SaspService.respondInvitation(isAccepted, Number(stateId), userId, transaction)
            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: isAccepted ? Activity.INVITATION_ACCEPTED : Activity.INVITATION_REJECTED,
                metadata: { userId: userId },
            }, { transaction });
            sendSuccess(res, { response });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};


export const activation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { userId, isActive } = req.body;

        await withTransaction(async (transaction) => {
            const response = await SaspService.setActiveStatus(isActive, Number(stateId), userId, transaction)
            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: isActive ? Activity.USER_ACTIVATED : Activity.USER_DEACTIVATED,
                metadata: { userId: userId },
            }, { transaction });
            sendSuccess(res, { response });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const updateUserDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { userId, title } = req.body;

        if (typeof userId !== 'string' || !userId) {
            throw new AppError(400, 'userId is required');
        }

        await withTransaction(async (transaction) => {
            const response = await SaspService.updateUserDetails(
                Number(stateId),
                userId,
                { title },
                transaction,
            );

            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: Activity.USER_INFO_UPDATED,
                metadata: {
                    userId,
                    title: response.title ?? null,
                },
            }, { transaction });

            sendSuccess(res, { user: response });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const assignRoleToUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { userId, role_name } = req.body;

        const saspUser = await SaspService.getUser(Number(stateId), userId);
        if (!saspUser) throw new AppError(404, 'SASP user not found');

        await withTransaction(async (transaction) => {
            const payload = { sasp_user_id: saspUser.id, userId, role_name };
            const response = await SaspService.assignRoleToSaspUser(payload, transaction);

            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: Activity.ROLE_CHANGED,
                metadata: {
                    saspUserId: saspUser.id,
                    userId: userId,
                    role: role_name,
                },
            }, { transaction });

            sendSuccess(res, { response });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const listAllInvitations = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || parseInt(req.query.pageSize as string) || 10;
        const filterKey = req.query.filterKey as InvitationFilterKeys | undefined;
        const filterValue = req.query.filterValue as string | undefined;
        const operator = (req.query.operator as string) || 'contains';
        const sortBy = req.query.sortBy as string | undefined;
        const sortOrder = req.query.sortOrder as string | undefined;

        const result = await SaspService.listInvitationsPaginated(
            Number(stateId),
            page,
            limit,
            filterKey,
            operator,
            filterValue,
            sortBy,
            sortOrder
        );
        sendSuccess(res, { invitations: result.items, totalItems: result.pagination.totalItems, pagination: result.pagination });
    } catch (err) {
        sendError(req, res, err);
    }
}

export const getDoneeAccounts = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const doneeAccounts = await DoneeAccountService.getDoneeAccountsByState(Number(stateId));
        sendSuccess(res, { doneeAccounts });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const getDoneeAccount = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId, organizationId } = req.params;
        const doneeAccount =
          await DoneeAccountService.getDoneeAccountByStateAndOrganization(
            Number(stateId),
            organizationId
          );
        sendSuccess(res, doneeAccount);
    } catch (err) {
        sendError(req, res, err);
    }
};


export const changeDoneeAccountActivation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { doneeAccountId, stateId } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') throw new AppError(400, 'isActive must be a boolean');


        await withTransaction(async (transaction) => {
            isActive
                ? await DoneeAccountService.activateDoneeAccount(Number(doneeAccountId), transaction)
                : await DoneeAccountService.deactivateDoneeAccount(Number(doneeAccountId), transaction)

            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: isActive ? Activity.DONE_ACCOUNT_ACTIVATED : Activity.DONE_ACCOUNT_DEACTIVATED,
                metadata: { doneeAccountId: doneeAccountId },
            }, { transaction });
            sendSuccess(res, { message: `Donee account ${isActive ? 'activated' : 'deactivated'} successfully` });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const getStateDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const stateDetails = await SaspService.fetchStateDetails(Number(stateId));
        sendSuccess(res, { stateDetails });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const updateStateDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { addressLine1, addressLine2, city, zip, phone, allow_request } = req.body;

        await withTransaction(async (transaction) => {
            await SaspService.updateStateDetails(Number(stateId), { addressLine1, addressLine2, city, zip, phone, allow_request }, transaction);
            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: Activity.STATE_DETAILS_UPDATED,
                metadata: { addressLine1, addressLine2, city, zip, phone, allow_request },
            }, { transaction });
            sendSuccess(res, { message: 'State details updated successfully' });
        });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const getStateDisposalFees = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const disposalFees = await SaspService.fetchDisposalFeesByState(Number(stateId));
        sendSuccess(res, { disposalFees });
    } catch (err) {
        sendError(req, res, err);
    }
};

export const updateStateDisposalFees = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId } = req.params;
        const { fees, effectiveDate } = req.body;

        if (!Array.isArray(fees) || fees.some(fee => typeof fee.disposalConditionId !== 'number' || typeof fee.fee !== 'number')) {
            throw new AppError(400, 'Invalid fees format. Each fee must have a disposalConditionId and a fee as numbers.');
        }

        if (typeof effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
            throw new AppError(400, 'Invalid effectiveDate format. Expected YYYY-MM-DD.');
        }

        await withTransaction(async (transaction) => {
            await SaspService.updateDisposalFees(Number(stateId), fees, effectiveDate, transaction);
            await SaspAuditLog.create({
                state_id: Number(stateId),
                activator: req.user?.id,
                activity: Activity.DISPOSAL_FEES_UPDATED,
                metadata: { fees },
            }, { transaction });
            sendSuccess(res, { message: 'Disposal fees updated successfully' });
        });

        // Check if effective date is in the future and send notifications to donees
        const effectiveDateObj = new Date(effectiveDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (effectiveDateObj > today) {
            const disposalConditions = await DisposalCondition.findAll({
                where: {
                    id: fees.map(fee => fee.disposalConditionId)
                }
            });

            const feesWithDetails = fees.map(fee => {
                const condition = disposalConditions.find(dc => dc.id === fee.disposalConditionId);
                return {
                    disposalConditionCode: condition?.code || '',
                    disposalConditionName: condition?.name || '',
                    fee: fee.fee
                };
            });

            // Send notification to all donees in the state
            await NotificationFactory.createNotification(
                NotificationType.FEE_CHANGE_NOTIFICATION,
                {
                    stateId: Number(stateId),
                    effectiveDate,
                    fees: feesWithDetails
                }
            );
        }
    } catch (err) {
        sendError(req, res, err);
    }
};


