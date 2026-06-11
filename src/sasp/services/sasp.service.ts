import Role from "@/authz/models/Role";
import { AppError } from "@/utils/response/appError";
import { withTransaction } from "@/utils/transactionalOperation";
import { Op, Transaction, where } from "sequelize";
import SaspInvitation from "../models/SaspInvitations.entity";
import SaspUser from "../models/SaspUsers.entity";
import { SaspInvitationStatuses } from "@/enums/saspInvitation.enum";
import User from "@/authn/models/User";
import { PredefinedRoles } from "@/enums/predefinedRoles.enum";
import { ScopeType } from "@/enums/scope.enum";
import Scope from "@/authz/models/Scope";
import UserScope from "@/authz/models/UserScope";
import State from "@/states/models/State";
import StateDisposalFees from "@/states/models/StateDisposalFees";
import DisposalCondition from "@/metadata/models/DisposalCondition";
import { TemplateEnum } from "@/enums/mailEnum";
import { renderEmail } from "@/utils/mail/render";
import { emailQueue } from "@/utils/mail/emailQueue";
import { UserType } from "@/enums/userType";
import { paginateSequelize } from "@/utils/pagination";
import { PaginatedResponse } from "@/utils/pagination/interfaces";
import { UserFilterKeys } from "@/enums/userFilterKeys.enum";
import { InvitationFilterKeys } from "@/enums/invitationFilterKeys.enum";
import { getSequelizeCondition, getSequelizeDateCondition, shouldApplyFilter, } from '@/utils/filteringOperations';


export default class SaspService {
    /**
     * List all SASP users in a state
     */
    static async listUsers(stateId: number): Promise<{ saspUser: SaspUser, user: User | undefined }[]> {
        const users = await SaspUser.findAll({ where: { stateId } });
        const userDetails = await User.findAll({ where: { id: users.map(user => user.userId) } });

        return users.map(user => ({
            saspUser: user,
            user: userDetails.find(detail => detail.id === user.userId)
        }));
    }

    /**
     * List SASP users in a state with pagination, filter and sort.
     */
    static async listUsersPaginated(
        stateId: number,
        page: number,
        limit: number,
        filterKey?: UserFilterKeys,
        operator: string = 'contains',
        filterValue?: string,
        sortBy?: string,
        sortOrder?: string
    ): Promise<PaginatedResponse<{ saspUser: SaspUser; user: User | undefined }>> {
        const whereClause: Record<string, unknown> = { stateId };

        if (filterKey && shouldApplyFilter(operator, filterValue)) {
            const condition = getSequelizeCondition(operator, filterValue ?? '');
            switch (filterKey) {
                case UserFilterKeys.NAME:
                    whereClause['$user.name$'] = condition;
                    break;
                case UserFilterKeys.EMAIL:
                    whereClause['$user.email$'] = condition;
                    break;
                case UserFilterKeys.IS_ACTIVE: {
                    const isActive = filterValue === 'true' || filterValue === '1';
                    const negated = operator === 'not' || operator === 'isNot' || operator === 'doesNotEqual';
                    whereClause.is_active = negated ? !isActive : isActive;
                    break;
                }
                case UserFilterKeys.ROLE_NAME:
                    // SASP users role filter not supported in listUsersPaginated
                    break;
                case UserFilterKeys.CREATED_AT:
                    whereClause.createdAt = getSequelizeDateCondition(operator, filterValue ?? '');
                    break;
            }
        }

        const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
        let order: import('sequelize').Order = [['createdAt', orderDir]];
        if (sortBy === 'name' || sortBy === 'email') {
            order = [[{ model: User, as: 'user' }, sortBy, orderDir]];
        } else if (sortBy === 'is_active' || sortBy === 'active') {
            order = [['is_active', orderDir]];
        } else if (sortBy === 'createdAt') {
            order = [['createdAt', orderDir]];
        }

        const result = await paginateSequelize<SaspUser>(SaspUser, page, limit, {
            where: whereClause,
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatar_url'], required: true }],
            order,
        });

        const items = result.items.map((saspUser) => ({
            saspUser,
            user: (saspUser as SaspUser & { user: User }).user,
        }));

        return { items, pagination: result.pagination };
    }

    /**
     * Get a single SASP user
     */
    static async getUser(stateId: number, userId: string): Promise<SaspUser & User> {
        const user = await SaspUser.findOne({ where: { stateId, userId } });
        if (!user) throw new AppError(404, 'SASP user not found');

        const userDetails = await User.findByPk(userId);

        return {
            ...user.get(),
            ...userDetails?.get()
        } as SaspUser & User;
    }

    /**
     * Invite a user to become a SASP user
     */
    static async inviteUser(stateId: number, invitedUserId: string, invited_by: string, role: string, transaction?: Transaction): Promise<SaspInvitation> {
        //make sure user is belong to sasp already and there is no pending invite waiting for user
        const existingSaspUser = await SaspUser.findOne({ where: { stateId, userId: invitedUserId }, transaction });
        if (existingSaspUser) throw new AppError(400, 'User is already a SASP user in this state');

        const existingInvitation = await SaspInvitation.findOne({ where: { state_id: stateId, invited_user_id: invitedUserId, status: SaspInvitationStatuses.PENDING }, transaction });
        if (existingInvitation) throw new AppError(400, 'User already invited');


        const user = await User.findByPk(invitedUserId, { transaction });
        const saspUser = await SaspUser.findOne({
            where: { stateId, userId: invited_by },
            include: [{ model: State, as: 'state' }],
            transaction
        });

        if (!user || !saspUser) throw new AppError(400, 'User not found');


        //check if role is exist
        const predefinedRoleName = PredefinedRoles[role as keyof typeof PredefinedRoles];
        if (!predefinedRoleName) throw new AppError(400, 'Invalid role');

        const predifinedRole = await Role.findOne({ where: { role_name: predefinedRoleName }, transaction });
        if (!predifinedRole) throw new AppError(400, 'Role does not exist');

        const invitation = await SaspInvitation.create({
            state_id: stateId,
            invited_user_id: invitedUserId,
            invited_by,
            role_id: predifinedRole.role_id,
            status: SaspInvitationStatuses.PENDING
        }, { transaction });


        const renderData = {
            templateName: TemplateEnum.Sasp_Invitition,
            data: { name: user.name, stateName: saspUser?.state?.stateName, roleName: predifinedRole.role_name },
        };

        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: user.email as string,
            subject: `Invitation to join ${saspUser?.state?.stateName} Sasp on American Surplus`,
            html: mailContent as string,
        };
        await emailQueue.add('saspInvitationNotification', mailData, { removeOnComplete: true, attempts: 3, });

        return invitation;
    }

    /**
     * Cancel a pending invitation
     */
    static async cancelInvitation(stateId: number, invitedUserId: string, transaction?: Transaction): Promise<void> {
        const invitation = await SaspInvitation.findOne({
            where: { state_id: stateId, invited_user_id: invitedUserId, status: SaspInvitationStatuses.PENDING },
            transaction
        });

        if (!invitation) throw new AppError(404, 'No pending invitation found for this user');

        await invitation.update({ status: SaspInvitationStatuses.CANCELED }, { transaction });
    }

    /**
     * Resend a pending invitation email to a user
     */
    static async resendInvitation(stateId: number, invitedUserId: string): Promise<void> {
        const invitation = await SaspInvitation.findOne({
            where: { state_id: stateId, invited_user_id: invitedUserId, status: SaspInvitationStatuses.PENDING },
            include: [
                { model: Role, as: 'role' },
                { model: User, as: 'saspInvitationReceiver' },
                { model: State, as: 'state' },
            ]
        });
        if (!invitation) throw new AppError(404, 'No pending invitation found for this user');

        const user = invitation.saspInvitationReceiver;
        const role = await Role.findByPk(invitation.role_id);
        const state = invitation.state;

        if (!user || !state || !role) throw new AppError(400, 'Invalid invitation');
        const renderData = {
            templateName: TemplateEnum.Sasp_Invitition,
            data: { name: user.name, stateName: state?.stateName, roleName: role.role_name },
        };

        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: user.email as string,
            subject: `Invitation to join ${state?.stateName} Sasp on American Surplus`,
            html: mailContent as string,
        };
        await emailQueue.add('saspInvitationNotification', mailData, { removeOnComplete: true, attempts: 3 });
    }


    /**
     * Respond to an invitation (accept or reject)
     */
    static async respondInvitation(isAccepted: boolean, stateId: number, userId: string, transaction?: Transaction): Promise<SaspUser | void> {
        const invitation = await SaspInvitation.findOne({
            where: { state_id: stateId, invited_user_id: userId, status: SaspInvitationStatuses.PENDING }
        });
        if (!invitation) throw new AppError(404, 'No pending invitation found for this user');

        await invitation.update({ status: isAccepted ? SaspInvitationStatuses.ACCEPTED : SaspInvitationStatuses.REJECTED, responded_at: new Date() }, { transaction });

        if (isAccepted) {
            const saspUser = await SaspUser.create({ userId, stateId, is_active: true }, { transaction });
            await User.update({ typeId: UserType.SASP }, { where: { id: userId }, transaction });
            await this.assignRoleToSaspUser({ sasp_user_id: saspUser.id, userId, role_id: invitation.role_id }, transaction)
            return saspUser;
        }
    }


    /**
     * Assign SASP user's role
     */
    static async assignRoleToSaspUser(payload: { sasp_user_id: number, userId: string, role_name?: string, role_id?: number }, transaction?: Transaction) {
        const { sasp_user_id, userId, role_name, role_id } = payload
        let role;

        const scope = await Scope.findOne({ where: { type: ScopeType.SASP } });
        if (role_id) role = await Role.findOne({ where: { role_id } });

        if (role_name) {
            const predefinedRole = PredefinedRoles[role_name as keyof typeof PredefinedRoles];
            if (!predefinedRole) throw new AppError(400, 'Invalid role name provided');

            role = await Role.findOne({ where: { role_name: predefinedRole } });
        }

        if (!scope || !role) throw new AppError(400, 'Unable to get user scope');

        // Check if the user has the admin role
        const adminRole = await Role.findOne({ where: { role_name: PredefinedRoles.SASP_Admin } });
        if (!adminRole) throw new AppError(400, 'Could not found role');

        const isAdmin = await UserScope.findOne({
            where: { user_id: userId, role_id: adminRole.role_id, sasp_user_id, scope_id: scope.scope_id, },
            transaction
        });

        if (isAdmin) throw new AppError(400, 'Cannot change role for a admin sasp user');

        let userScope = await UserScope.findOne({
            where: { user_id: userId, scope_id: scope.scope_id, sasp_user_id },
            transaction,
        });

        if (userScope) {
            userScope.role_id = role.role_id;
            await userScope.save({ transaction });
        } else {
            userScope = await UserScope.create({
                user_id: userId, scope_id: scope.scope_id, role_id: role.role_id, sasp_user_id,
            }, { transaction });
        }

        return userScope;
    }

    /**
     * Activate or deactivate a SASP user
     */
    static async setActiveStatus(isActive: boolean, stateId: number, userId: string, transaction?: Transaction): Promise<SaspUser> {
        // assume SaspUser has isActive, deactivatedAt fields if you added them
        const saspUser = await SaspUser.findOne({ where: { stateId, userId } });
        if (!saspUser) throw new AppError(404, 'SASP user not found');

        const scope = await Scope.findOne({ where: { type: ScopeType.SASP } });
        if (!scope) throw new AppError(400, 'Unable to get user scope');

        // Check if the user has the admin role
        const adminRole = await Role.findOne({ where: { role_name: PredefinedRoles.SASP_Admin } });
        if (!adminRole) throw new AppError(400, 'Could not found role');

        const isAdmin = await UserScope.findOne({
            where: { user_id: userId, role_id: adminRole.role_id, sasp_user_id: saspUser.id, scope_id: scope.scope_id, },
            transaction
        });

        if (isAdmin) throw new AppError(400, 'Cannot change activation of admin sasp user');
        if (saspUser.is_active === isActive) throw new AppError(400, `User is already ${isActive ? 'active' : 'inactive'}`);

        return saspUser.update({ is_active: isActive, deactivatedAt: isActive ? null : new Date() }, { transaction });
    }

    /**
     * Update editable profile details on a SASP user (currently: title).
     *
     * Title flows into the approver signature block of the eligibility-application PDF
     * (see DocumentFactory.saspOfficialTitle resolution). The column is otherwise unwritten
     * outside of data migration, so without this endpoint live approvals end up with an
     * empty title in the signature.
     */
    static async updateUserDetails(
        stateId: number,
        userId: string,
        details: { title?: string | null },
        transaction?: Transaction,
    ): Promise<SaspUser> {
        const saspUser = await SaspUser.findOne({ where: { stateId, userId }, transaction });
        if (!saspUser) throw new AppError(404, 'SASP user not found');

        const updates: Partial<{ title: string | null }> = {};
        if (Object.prototype.hasOwnProperty.call(details, 'title')) {
            const raw = details.title;
            const normalized = typeof raw === 'string' ? raw.trim() : raw;
            updates.title = normalized && String(normalized).length > 0 ? String(normalized) : null;
        }

        if (Object.keys(updates).length === 0) return saspUser;

        return saspUser.update(updates, { transaction });
    }

    /**
     * List pending invitations for a state
     */
    static async listInvitations(stateId: number): Promise<SaspInvitation[]> {
        return SaspInvitation.findAll({
            where: { state_id: stateId },
            include: [
                { model: Role, as: 'role' },
                { model: User, as: 'saspInvitationSender' },
                { model: User, as: 'saspInvitationReceiver' },
            ],
            order: [['created_at', 'DESC']]
        });
    }

    /**
     * List SASP invitations for a state with pagination, filter and sort.
     */
    static async listInvitationsPaginated(
        stateId: number,
        page: number,
        limit: number,
        filterKey?: InvitationFilterKeys,
        operator: string = 'contains',
        filterValue?: string,
        sortBy?: string,
        sortOrder?: string
    ): Promise<PaginatedResponse<SaspInvitation>> {
        const whereClause: Record<string, unknown> = { state_id: stateId };

        if (filterKey && shouldApplyFilter(operator, filterValue)) {
            const defaultCondition = getSequelizeCondition(operator, filterValue ?? '');
            switch (filterKey) {
                case InvitationFilterKeys.NAME:
                    whereClause['$saspInvitationReceiver.name$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.EMAIL:
                    whereClause['$saspInvitationReceiver.email$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.ROLE:
                    whereClause['$role.role_name$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.STATUS:
                    whereClause.status = defaultCondition;
                    break;
                case InvitationFilterKeys.INVITED_BY:
                    whereClause['$saspInvitationSender.name$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.CREATED_AT:
                    whereClause.createdAt = getSequelizeDateCondition(operator, filterValue ?? '');
                    break;
            }
        }

        const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
        let order: import('sequelize').Order;
        if (sortBy === 'name' || sortBy === 'email') {
            order = [[{ model: User, as: 'saspInvitationReceiver' }, sortBy, orderDir]];
        } else if (sortBy === 'role') {
            order = [[{ model: Role, as: 'role' }, 'role_name', orderDir]];
        } else if (sortBy === 'status') {
            order = [['status', orderDir]];
        } else if (sortBy === 'invitedBy') {
            order = [[{ model: User, as: 'saspInvitationSender' }, 'name', orderDir]];
        } else {
            order = [['createdAt', orderDir]];
        }

        return await paginateSequelize<SaspInvitation>(SaspInvitation, page, limit, {
            where: whereClause,
            include: [
                { model: User, as: 'saspInvitationReceiver', attributes: ['id', 'name', 'email'], required: true },
                { model: User, as: 'saspInvitationSender', attributes: ['id', 'name', 'email'], required: false },
                { model: Role, as: 'role', attributes: ['role_id', 'role_name'], required: false },
            ],
            order,
        });
    }


    /**
     * List pending invitations for a user
     */
    static async getMyInvitations(userId: string): Promise<SaspInvitation[]> {
        return SaspInvitation.findAll({
            where: { invited_user_id: userId },
            include: [
                { model: State, as: 'state' },
                { model: Role, as: 'role' }, // Assuming Role is associated with SaspInvitation
                { model: User, as: 'saspInvitationSender' }, // Sender association
                { model: User, as: 'saspInvitationReceiver' }, // Receiver association
            ],
            order: [['created_at', 'DESC']]
        });
    }


    /**
     * Update state details
     */
    static async updateStateDetails(stateId: number, details: { addressLine1?: string, addressLine2?: string, city?: string, zip?: string, phone?: string, allow_request?: boolean }, transaction?: Transaction): Promise<void> {
        const state = await State.findByPk(stateId);
        if (!state) throw new AppError(404, 'State not found');

        await state.update(details, { transaction });
    }

    /**
     * Fetch state details
     */
    static async fetchStateDetails(stateId: number): Promise<State> {
        const state = await State.findByPk(stateId);
        if (!state) throw new AppError(404, 'State not found');
        return state;
    }

    /**
     * Fetch disposal fees by state
     */
    static async fetchDisposalFeesByState(stateId: number): Promise<{ disposalFees: StateDisposalFees[] }> {
        const disposalFees = await StateDisposalFees.findAll({
            where: {
                stateId,
            },
            include: [
                { model: DisposalCondition, as: 'disposalCondition' }
            ],
            order: [['effective_date', 'DESC']]
        });

        return { disposalFees };
    }

    /**
     * Update disposal fees for a state
     */
    static async updateDisposalFees(stateId: number, fees: { disposalConditionId: number, fee: number }[], effectiveDate: string, transaction?: Transaction): Promise<void> {
        const state = await State.findByPk(stateId);
        if (!state) throw new AppError(404, 'State not found');

        for (const fee of fees) {
            const exists = await StateDisposalFees.findOne({
                where: {
                    stateId,
                    disposalConditionId: fee.disposalConditionId,
                    effective_date: new Date(effectiveDate),
                }, transaction,
            });

            if (exists) throw new AppError(400, `Selected condition code with effective date ${effectiveDate} already exists.`);

            await StateDisposalFees.create({
                stateId,
                disposalConditionId: fee.disposalConditionId,
                fee: fee.fee,
                effective_date: new Date(effectiveDate),
            }, { transaction });
        }
    }
}
