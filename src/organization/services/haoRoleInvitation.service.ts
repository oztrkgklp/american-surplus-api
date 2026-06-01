import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import User from '@/authn/models/User';
import { UserType } from '@/enums/userType';
import { hashPassword } from '@/utils/password';
import { AppError } from '@/utils/response/appError';
import envvars from '@/config/envvars';
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import { HaoRoleInvitationStatus } from '@/enums/haoRoleInvitationStatus.enum';
import HaoRoleInvitation from '@/organization/models/HaoRoleInvitation.entity';
import Organization from '@/organization/models/Organization';
import OrganizationUser from '@/organization/models/OrganizationUser';
import DoneeAccount from '@/organization/models/DoneeAccount';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { DoneeAccountService } from '@/organization/services/donee';
import { PredefinedRoles } from '@/enums/predefinedRoles.enum';
import Role from '@/authz/models/Role';
import UserScope from '@/authz/models/UserScope';
import Scope from '@/authz/models/Scope';
import { ScopeType } from '@/enums/scope.enum';
import { addNotificationJob } from '@/notifications/job/notification.job';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HAO_ROLE_INVITATION_NOTIFICATION_TYPE = 'HaoRoleInvitation';

export class HaoRoleInvitationService {
    private static hashToken(rawToken: string): string {
        return crypto.createHash('sha256').update(rawToken).digest('hex');
    }

    private static async restoreLinkedApplicationStatus(
        invitation: HaoRoleInvitation,
        actorUserId: string | null,
        transaction: Transaction,
    ): Promise<void> {
        if (!invitation.application_id) {
            return;
        }

        const previousStatus =
            invitation.application_previous_status ?? EligibilityApplicationStatuses.DRAFT;

        await EligibilityService.restoreApplicationAfterHaoRoleInvitation(
            invitation.application_id,
            previousStatus,
            invitation.organization_id,
            invitation.donee_account_id,
            actorUserId,
            transaction,
        );
    }

    static async createInvitation(
        params: {
            organizationId: string;
            doneeAccountId: number;
            applicationId?: number;
            email: string;
            name: string;
            title?: string;
            phone?: string;
            invitedByUserId: string;
        },
        transaction?: Transaction,
    ): Promise<{ invitationId: string }> {
        const email = params.email.trim().toLowerCase();
        const existingUser = await User.findOne({ where: { email }, transaction });
        if (existingUser) {
            throw new AppError(
                409,
                'An account with this email already exists. Select them from the member list if they belong to your organization.',
            );
        }

        const pending = await HaoRoleInvitation.findOne({
            where: {
                organization_id: params.organizationId,
                donee_account_id: params.doneeAccountId,
                email,
                status: HaoRoleInvitationStatus.PENDING,
                expires_at: { [Op.gt]: Date.now() },
            },
            transaction,
        });
        if (pending) {
            throw new AppError(400, 'An invitation is already pending for this email.');
        }

        const doneeAccount = await DoneeAccount.findByPk(params.doneeAccountId, { transaction });
        if (!doneeAccount || doneeAccount.organizationId !== params.organizationId) {
            throw new AppError(400, 'Donee account does not belong to this organization');
        }

        const rawToken = uuidv4();
        const invitation = await HaoRoleInvitation.create(
            {
                token_hash: this.hashToken(rawToken),
                organization_id: params.organizationId,
                donee_account_id: params.doneeAccountId,
                application_id: params.applicationId ?? null,
                email,
                name: params.name.trim(),
                title: params.title?.trim() || null,
                phone: params.phone?.trim() || null,
                invited_by_user_id: params.invitedByUserId,
                status: HaoRoleInvitationStatus.PENDING,
                expires_at: Date.now() + INVITATION_TTL_MS,
            },
            { transaction },
        );

        const organization = await Organization.findByPk(params.organizationId, { transaction });
        const acceptUrl = `${envvars.ui}/hao-role-accept?token=${rawToken}`;
        const mailContent = await renderEmail({
            templateName: TemplateEnum.Hao_Role_Invitation,
            data: {
                name: params.name,
                organizationName: organization?.name ?? 'your organization',
                acceptUrl,
            },
        });
        await emailQueue.add(
            'haoRoleInvitation',
            {
                to: email,
                subject: 'Accept Head Authorized Official role on American Surplus',
                html: mailContent as string,
            },
            { removeOnComplete: true, attempts: 3 },
        );

        return { invitationId: invitation.id };
    }

    static async createMemberInvitation(
        params: {
            organizationId: string;
            doneeAccountId: number;
            applicationId?: number;
            invitedUserId: string;
            invitedByUserId: string;
        },
        transaction?: Transaction,
    ): Promise<{ invitationId: string }> {
        const doneeAccount = await DoneeAccount.findByPk(params.doneeAccountId, { transaction });
        if (!doneeAccount || doneeAccount.organizationId !== params.organizationId) {
            throw new AppError(400, 'Donee account does not belong to this organization');
        }

        const invitedUser = await User.findByPk(params.invitedUserId, { transaction });
        if (!invitedUser) throw new AppError(404, 'User not found');

        const isMember = await OrganizationUserService.isUserInOrganization(
            params.organizationId,
            params.invitedUserId,
        );
        if (!isMember) {
            throw new AppError(400, 'User is not a member of this organization');
        }

        const currentHeadId = await this.resolveHeadUserIdForDonee(
            params.organizationId,
            params.doneeAccountId,
        );
        if (currentHeadId === params.invitedUserId) {
            throw new AppError(400, 'This user is already the Head Authorized Official');
        }

        const pendingForUser = await HaoRoleInvitation.findOne({
            where: {
                organization_id: params.organizationId,
                donee_account_id: params.doneeAccountId,
                invited_user_id: params.invitedUserId,
                status: HaoRoleInvitationStatus.PENDING,
                expires_at: { [Op.gt]: Date.now() },
            },
            transaction,
        });
        if (pendingForUser) {
            throw new AppError(400, 'An invitation is already pending for this member.');
        }

        const organization = await Organization.findByPk(params.organizationId, { transaction });
        const rawToken = uuidv4();

        const orgUser = await OrganizationUserService.getRecordByOrganizationAndUser(
            params.organizationId,
            params.invitedUserId,
            transaction,
        );

        const invitation = await HaoRoleInvitation.create(
            {
                token_hash: this.hashToken(rawToken),
                organization_id: params.organizationId,
                donee_account_id: params.doneeAccountId,
                application_id: params.applicationId ?? null,
                email: invitedUser.email,
                name: invitedUser.name,
                title: orgUser?.title ?? null,
                phone: orgUser?.phoneNumber ?? null,
                invited_by_user_id: params.invitedByUserId,
                invited_user_id: params.invitedUserId,
                status: HaoRoleInvitationStatus.PENDING,
                expires_at: Date.now() + INVITATION_TTL_MS,
            },
            { transaction },
        );

        const homeUrl = envvars.ui;
        const mailContent = await renderEmail({
            templateName: TemplateEnum.Hao_Role_Invitation_Member,
            data: {
                name: invitedUser.name,
                organizationName: organization?.name ?? 'your organization',
                homeUrl,
            },
        });
        await emailQueue.add(
            'haoRoleInvitationMember',
            {
                to: invitedUser.email,
                subject: `Invitation to become Head Authorized Official for ${organization?.name ?? 'your organization'}`,
                html: mailContent as string,
            },
            { removeOnComplete: true, attempts: 3 },
        );

        await addNotificationJob(
            'haoRoleInvitation',
            {
                userId: params.invitedUserId,
                type: HAO_ROLE_INVITATION_NOTIFICATION_TYPE,
                payload: {
                    message: `You have been invited to become Head Authorized Official for ${organization?.name ?? 'an organization'}.`,
                    entityType: 'hao_role_invitation',
                    entityId: invitation.id,
                    organizationId: params.organizationId,
                    invitationId: invitation.id,
                },
            },
            { removeOnComplete: true, attempts: 3 },
        );

        return { invitationId: invitation.id };
    }

    static async getMyInvitations(userId: string): Promise<HaoRoleInvitation[]> {
        return HaoRoleInvitation.findAll({
            where: {
                invited_user_id: userId,
                status: HaoRoleInvitationStatus.PENDING,
                expires_at: { [Op.gt]: Date.now() },
            },
            include: [
                { model: Organization, as: 'organization', attributes: ['id', 'name'] },
                {
                    model: User,
                    as: 'invitedBy',
                    attributes: ['id', 'name', 'email'],
                },
            ],
            order: [['createdAt', 'DESC']],
        });
    }

    static async respondToInvitation(
        invitationId: string,
        userId: string,
        isAccepted: boolean,
        transaction: Transaction,
    ): Promise<void> {
        const invitation = await HaoRoleInvitation.findByPk(invitationId, { transaction });
        if (!invitation) throw new AppError(404, 'Invitation not found');
        if (invitation.invited_user_id !== userId) {
            throw new AppError(403, 'You are not authorized to respond to this invitation');
        }
        if (invitation.status !== HaoRoleInvitationStatus.PENDING) {
            throw new AppError(400, 'This invitation is no longer pending');
        }
        if (invitation.expires_at < Date.now()) {
            await invitation.update({ status: HaoRoleInvitationStatus.EXPIRED }, { transaction });
            throw new AppError(400, 'This invitation has expired');
        }

        if (!isAccepted) {
            await this.restoreLinkedApplicationStatus(invitation, userId, transaction);
            await invitation.update({ status: HaoRoleInvitationStatus.CANCELLED }, { transaction });
            return;
        }

        await DoneeAccountService.designateHeadAuthorizedOfficial(
            invitation.donee_account_id,
            invitation.organization_id,
            userId,
            transaction,
        );

        const inviterId = invitation.invited_by_user_id;
        if (inviterId && inviterId !== userId) {
            await DoneeAccountService.releaseHeadAuthorizedOfficialRole(
                invitation.organization_id,
                inviterId,
                invitation.donee_account_id,
                transaction,
            );
        }

        await this.restoreLinkedApplicationStatus(invitation, userId, transaction);

        await invitation.update(
            {
                status: HaoRoleInvitationStatus.COMPLETED,
                completed_at: Date.now(),
                new_user_id: userId,
            },
            { transaction },
        );

        await OrganizationUserService.invalidateUserScopeCaches([
            userId,
            inviterId,
        ]);
    }

    static async getInvitationPreview(rawToken: string): Promise<{
        email: string;
        name: string;
        title: string | null;
        phone: string | null;
        organizationName: string;
        expired: boolean;
        completed: boolean;
    }> {
        const invitation = await this.findValidInvitation(rawToken);
        const organization = await Organization.findByPk(invitation.organization_id);
        const expired = invitation.expires_at < Date.now();
        const completed = invitation.status === HaoRoleInvitationStatus.COMPLETED;
        return {
            email: invitation.email,
            name: invitation.name,
            title: invitation.title,
            phone: invitation.phone,
            organizationName: organization?.name ?? '',
            expired,
            completed,
        };
    }

    static async completeInvitation(
        rawToken: string,
        payload: { password: string; name?: string; title?: string; phone?: string },
        transaction: Transaction,
    ): Promise<void> {
        const invitation = await this.findValidInvitation(rawToken, transaction);
        if (invitation.status === HaoRoleInvitationStatus.COMPLETED) {
            throw new AppError(400, 'This invitation has already been used.');
        }
        if (invitation.expires_at < Date.now()) {
            await invitation.update({ status: HaoRoleInvitationStatus.EXPIRED }, { transaction });
            throw new AppError(400, 'This invitation has expired.');
        }

        const email = invitation.email;
        const existingUser = await User.findOne({ where: { email }, transaction });
        if (existingUser) {
            throw new AppError(
                409,
                'An account with this email already exists. Sign in or use the member transfer option.',
            );
        }

        const displayName = payload.name?.trim() || invitation.name;
        const hashedPassword = await hashPassword(payload.password);
        const user = await User.create(
            {
                name: displayName,
                email,
                password: hashedPassword,
                typeId: UserType.DONEE,
                is_email_verified: true,
                email_verification_token: null,
                email_verification_expiry_date: null,
                mfaEnabled: false,
            },
            { transaction },
        );

        const title = payload.title?.trim() || invitation.title;
        const phone = payload.phone?.trim() || invitation.phone;

        const orgUser = await OrganizationUserService.addUser(
            invitation.organization_id,
            user.id,
            false,
            transaction,
            { title, phoneNumber: phone },
        );

        const memberRole = await Role.findOne({
            where: { role_name: PredefinedRoles.Organization_Member },
            transaction,
        });
        if (memberRole) {
            await OrganizationUserService.assignRoleToOrganizationUser(
                {
                    organizationUserId: orgUser.id,
                    userId: user.id,
                    role_id: memberRole.role_id,
                },
                transaction,
            );
        }

        await DoneeAccountService.designateHeadAuthorizedOfficial(
            invitation.donee_account_id,
            invitation.organization_id,
            user.id,
            transaction,
        );

        const inviterId = invitation.invited_by_user_id;
        if (inviterId && inviterId !== user.id) {
            await DoneeAccountService.releaseHeadAuthorizedOfficialRole(
                invitation.organization_id,
                inviterId,
                invitation.donee_account_id,
                transaction,
            );
        }

        await OrganizationUserService.invalidateUserScopeCaches([user.id, inviterId]);

        await this.restoreLinkedApplicationStatus(invitation, user.id, transaction);

        await invitation.update(
            {
                status: HaoRoleInvitationStatus.COMPLETED,
                completed_at: Date.now(),
                new_user_id: user.id,
                name: displayName,
                title: title ?? null,
                phone: phone ?? null,
            },
            { transaction },
        );
    }

    static async hasPendingInvitationForDonee(
        organizationId: string,
        doneeAccountId: number,
    ): Promise<boolean> {
        const pending = await HaoRoleInvitation.findOne({
            where: {
                organization_id: organizationId,
                donee_account_id: doneeAccountId,
                status: HaoRoleInvitationStatus.PENDING,
                expires_at: { [Op.gt]: Date.now() },
            },
        });
        return pending != null;
    }

    static async resolveHeadUserIdForDonee(
        organizationId: string,
        doneeAccountId: number,
    ): Promise<string | null> {
        const headScope = await UserScope.findOne({
            where: {
                donee_account_id: doneeAccountId,
                is_head_representative: true,
            },
            include: [
                {
                    model: OrganizationUser,
                    as: 'organizationUser',
                    where: { organizationId, is_active: true },
                    required: true,
                    attributes: ['id'],
                },
            ],
        });
        return headScope?.user_id ?? null;
    }

    private static async findValidInvitation(
        rawToken: string,
        transaction?: Transaction,
    ): Promise<HaoRoleInvitation> {
        if (!rawToken) throw new AppError(400, 'Token is required');
        const invitation = await HaoRoleInvitation.findOne({
            where: { token_hash: this.hashToken(rawToken) },
            transaction,
        });
        if (!invitation) throw new AppError(404, 'Invitation not found or invalid');
        return invitation;
    }
}
