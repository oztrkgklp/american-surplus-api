import { AppError } from '@/utils/response/appError';
import { Transaction } from 'sequelize';
import { Op, col } from 'sequelize';

import OrganizationUser from '@/organization/models/OrganizationUser';
import Organization from '@/organization/models/Organization';
import { paginateSequelize } from '@/utils/pagination';
import { cache } from '@/utils/cache';
import { cacheKeys } from '@/utils/cache/keys';
import User from '@/authn/models/User';
import Role from '@/authz/models/Role';
import Scope from '@/authz/models/Scope';
import UserScope from '@/authz/models/UserScope';
import { PredefinedRoles } from '@/enums/predefinedRoles.enum';
import { ScopeType } from '@/enums/scope.enum';
import DoneeAccount from '@/organization/models/DoneeAccount';
import { UserFilterKeys } from '@/enums/userFilterKeys.enum';
import { getSequelizeCondition, getSequelizeDateCondition, shouldApplyFilter } from '@/utils/filteringOperations';
import { PaginatedResponse } from '@/utils/pagination/interfaces';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import { getCanEditOrganizationInfoForApplications } from '@/organization/utils/canEditOrganizationInfo';
import { OrganizationAddressService } from '@/organization/services/organizationAddress.service';
import { getLogger } from '@/utils/logger';

const logger = getLogger('OrganizationUserService');

export type GetOrganizationByIdOptions = {
    /** When set, head/primary are resolved from scopes for this donee account first. */
    doneeAccountId?: number;
};

type UserScopeWithOrgUser = UserScope & {
    organizationUser?: OrganizationUser & { user?: User };
};

export type UserOrganizationMembershipContact = {
    organizationId: string;
    organizationName: string;
    organizationUserId: number;
    title: string | null;
    phoneNumber: string | null;
    canEditOrganizationInfo: boolean;
};

export type UserOrganizationMembershipContactUpdate = {
    organizationId: string;
    title?: string | null;
    phoneNumber?: string | null;
};

export class OrganizationUserService {
    /** Clears cached organization lists for users after scope / membership changes. */
    static async invalidateUserScopeCaches(userIds: Array<string | null | undefined>): Promise<void> {
        const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
        await Promise.all(
            unique.map((userId) => cache.deleteSmart(cacheKeys.userOrganizations, userId)),
        );
    }

    /**
     * True when the user has a donee/org scope row marked head authorized official for this organization.
     */
    /** All eligibility applications for an organization (used when donee-account joins omit them). */
    static async listApplicationsForOrganizationEditCheck(
        organizationId: string,
        transaction?: Transaction,
    ): Promise<(Application & { applicationForms?: ApplicationForm[] })[]> {
        return Application.findAll({
            where: { organization_id: organizationId },
            attributes: ['id', 'status'],
            include: [
                {
                    model: ApplicationForm,
                    as: 'applicationForms',
                    attributes: ['form_id', 'status'],
                    required: false,
                },
            ],
            transaction,
        }) as Promise<(Application & { applicationForms?: ApplicationForm[] })[]>;
    }

    static async userIsHeadAuthorizedOfficialForOrganization(
        userId: string,
        organizationId: string,
    ): Promise<boolean> {
        const scope = await UserScope.findOne({
            where: { user_id: userId, is_head_representative: true },
            include: [
                {
                    model: OrganizationUser,
                    as: 'organizationUser',
                    where: { organizationId, userId, is_active: true },
                    required: true,
                    attributes: ['id'],
                },
            ],
        });
        return scope != null;
    }

    /**
     * Whether this user may edit organization / My Profile fields for one organization.
     * Eligibility application status rules apply only when the user is the head authorized official (HAO).
     */
    static async getCanEditOrganizationInfoForOrganization(
        userId: string,
        organizationId: string,
        applications: (Application & { applicationForms?: ApplicationForm[] })[],
    ): Promise<boolean> {
        const isHead = await OrganizationUserService.userIsHeadAuthorizedOfficialForOrganization(
            userId,
            organizationId,
        );
        if (!isHead) return true;

        const applicationsForCheck =
            applications.length > 0
                ? applications
                : await OrganizationUserService.listApplicationsForOrganizationEditCheck(
                      organizationId,
                      undefined,
                  );

        return getCanEditOrganizationInfoForApplications(applicationsForCheck);
    }

    static async getCanEditOrganizationInfoForUser(userId: string): Promise<boolean> {
        const organizationMemberships = await OrganizationUser.findAll({
            where: { userId, is_active: true },
            include: [{
                model: Organization,
                as: 'organization',
                attributes: ['id'],
                include: [{
                    model: DoneeAccount,
                    as: 'donee_accounts',
                    attributes: ['id'],
                    include: [{
                        model: Application,
                        attributes: ['id', 'status'],
                        as: 'application',
                        required: false,
                        include: [{
                            model: ApplicationForm,
                            as: 'applicationForms',
                            attributes: ['form_id', 'status'],
                            required: false,
                        }],
                    }],
                }],
            }],
        });

        if (!organizationMemberships.length) return true;

        const results = await Promise.all(
            organizationMemberships.map(async (membership) => {
                const organizationId = membership.organizationId;
                const applicationsForEditCheck = (membership.organization?.donee_accounts ?? [])
                    .map((account) => account.application)
                    .filter((app): app is Application & { applicationForms?: ApplicationForm[] } => app != null);

                return OrganizationUserService.getCanEditOrganizationInfoForOrganization(
                    userId,
                    organizationId,
                    applicationsForEditCheck,
                );
            }),
        );

        return results.every(Boolean);
    }

    private static applicationsForMembershipEditCheck(
        membership: OrganizationUser & { organization?: Organization },
    ): (Application & { applicationForms?: ApplicationForm[] })[] {
        return (membership.organization?.donee_accounts ?? [])
            .map((account) => account.application)
            .filter((app): app is Application & { applicationForms?: ApplicationForm[] } => app != null);
    }

    /** Per-organization title, phone, and edit eligibility for My Profile. */
    static async getOrganizationMembershipContactsForUser(
        userId: string,
    ): Promise<UserOrganizationMembershipContact[]> {
        const memberships = await OrganizationUser.findAll({
            where: { userId, is_active: true },
            include: [{
                model: Organization,
                as: 'organization',
                attributes: ['id', 'name'],
                include: [{
                    model: DoneeAccount,
                    as: 'donee_accounts',
                    attributes: ['id'],
                    include: [{
                        model: Application,
                        attributes: ['id', 'status'],
                        as: 'application',
                        required: false,
                        include: [{
                            model: ApplicationForm,
                            as: 'applicationForms',
                            attributes: ['form_id', 'status'],
                            required: false,
                        }],
                    }],
                }],
            }],
            order: [[{ model: Organization, as: 'organization' }, 'name', 'ASC']],
        });

        return Promise.all(
            memberships.map(async (membership) => {
                const applicationsForEditCheck =
                    OrganizationUserService.applicationsForMembershipEditCheck(membership);
                const canEditOrganizationInfo =
                    await OrganizationUserService.getCanEditOrganizationInfoForOrganization(
                        userId,
                        membership.organizationId,
                        applicationsForEditCheck,
                    );

                return {
                    organizationId: membership.organizationId,
                    organizationName: membership.organization?.name ?? 'Organization',
                    organizationUserId: membership.id,
                    title: membership.title ?? null,
                    phoneNumber: membership.phoneNumber ?? null,
                    canEditOrganizationInfo,
                };
            }),
        );
    }

    /** Updates title/phone on specific active organization memberships (My Profile). */
    static async updateOrganizationMembershipContactFields(
        userId: string,
        updates: UserOrganizationMembershipContactUpdate[],
    ): Promise<void> {
        if (!updates.length) return;

        for (const entry of updates) {
            if (entry.title === undefined && entry.phoneNumber === undefined) continue;

            const membership = await OrganizationUser.findOne({
                where: { userId, organizationId: entry.organizationId, is_active: true },
                include: [{
                    model: Organization,
                    as: 'organization',
                    attributes: ['id', 'name'],
                    include: [{
                        model: DoneeAccount,
                        as: 'donee_accounts',
                        attributes: ['id'],
                        include: [{
                            model: Application,
                            attributes: ['id', 'status'],
                            as: 'application',
                            required: false,
                            include: [{
                                model: ApplicationForm,
                                as: 'applicationForms',
                                attributes: ['form_id', 'status'],
                                required: false,
                            }],
                        }],
                    }],
                }],
            });

            if (!membership) {
                throw new AppError(404, 'Organization membership not found');
            }

            const applicationsForEditCheck =
                OrganizationUserService.applicationsForMembershipEditCheck(membership);
            const canEdit = await OrganizationUserService.getCanEditOrganizationInfoForOrganization(
                userId,
                entry.organizationId,
                applicationsForEditCheck,
            );
            if (!canEdit) {
                const orgName = membership.organization?.name ?? 'this organization';
                throw new AppError(
                    403,
                    `Title and phone cannot be edited for ${orgName} while an eligibility application is under review.`,
                );
            }

            const rowUpdates: { title?: string | null; phoneNumber?: string | null } = {};
            if (entry.title !== undefined) rowUpdates.title = entry.title;
            if (entry.phoneNumber !== undefined) rowUpdates.phoneNumber = entry.phoneNumber;
            await membership.update(rowUpdates);

            await OrganizationUserService.syncForm1HeadAuthorizedOfficialFromUserProfile(
                userId,
                rowUpdates,
                undefined,
                entry.organizationId,
            );
        }
    }

    /**
     * When the application creator updates My Profile, sync head authorized official fields on form 1
     * for applications they created where they are the head representative.
     */
    static async syncForm1HeadAuthorizedOfficialFromUserProfile(
        userId: string,
        fields: { name?: string; title?: string | null; phoneNumber?: string | null },
        transaction?: Transaction,
        organizationId?: string,
    ): Promise<void> {
        const applications = await Application.findAll({
            where: { created_by: userId },
            attributes: ['id', 'organization_id'],
            transaction,
        });
        if (!applications.length) return;

        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'email'],
            transaction,
        });
        if (!user) return;

        for (const app of applications) {
            if (organizationId && app.organization_id !== organizationId) continue;

            const isHeadForOrg = await UserScope.findOne({
                where: { user_id: userId, is_head_representative: true },
                include: [
                    {
                        model: OrganizationUser,
                        as: 'organizationUser',
                        where: { organizationId: app.organization_id, userId, is_active: true },
                        required: true,
                        attributes: ['id'],
                    },
                ],
                transaction,
            });
            if (!isHeadForOrg) continue;

            const form1 = await ApplicationForm.findOne({
                where: { application_id: app.id, form_id: 1 },
                transaction,
            });
            if (!form1) continue;

            const fd =
                typeof form1.form_data === 'string'
                    ? JSON.parse(String(form1.form_data) || '{}')
                    : { ...(form1.form_data as Record<string, unknown>) };

            if (fields.name !== undefined) fd.headAuthorizedOfficialName = user.name;
            if (fields.title !== undefined) fd.headAuthorizedOfficialTitle = fields.title ?? '';
            if (fields.phoneNumber !== undefined) fd.headAuthorizedOfficialPhone = fields.phoneNumber ?? '';
            fd.headAuthorizedOfficialEmail = user.email;

            const resolved = await OrganizationUserService.resolveHeadAndPrimaryFromUserScopes(
                app.organization_id,
                transaction,
            );
            const primaryIsHeadFallback =
                !resolved.primaryContactHasDedicatedScope &&
                resolved.headAuthorizedOfficialUserId === userId &&
                resolved.primaryContactUserId === userId;
            if (primaryIsHeadFallback) {
                if (fields.name !== undefined) fd.primaryContactName = user.name;
                if (fields.title !== undefined) fd.primaryContactTitle = fields.title ?? '';
                if (fields.phoneNumber !== undefined) fd.primaryContactPhone = fields.phoneNumber ?? '';
                fd.primaryContactEmail = user.email;
                fd.useSameAsHeadOfficial = true;
            }

            await form1.update({ form_data: fd }, { transaction });
        }
    }

    /**
     * When primary contact details change, sync primary point of contact fields on form 1
     * for all applications on the organization.
     */
    static async syncForm1PrimaryContactFromUserProfile(
        userId: string,
        organizationId: string,
        fields: { name?: string; title?: string | null; phoneNumber?: string | null },
        transaction?: Transaction,
    ): Promise<void> {
        const applications = await Application.findAll({
            where: { organization_id: organizationId },
            attributes: ['id'],
            transaction,
        });
        if (!applications.length) return;

        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'email'],
            transaction,
        });
        if (!user) return;

        for (const app of applications) {
            const form1 = await ApplicationForm.findOne({
                where: { application_id: app.id, form_id: 1 },
                transaction,
            });
            if (!form1) continue;

            const fd =
                typeof form1.form_data === 'string'
                    ? JSON.parse(String(form1.form_data) || '{}')
                    : { ...(form1.form_data as Record<string, unknown>) };

            if (fields.name !== undefined) fd.primaryContactName = user.name;
            if (fields.title !== undefined) fd.primaryContactTitle = fields.title ?? '';
            if (fields.phoneNumber !== undefined) fd.primaryContactPhone = fields.phoneNumber ?? '';
            fd.primaryContactEmail = user.email;
            fd.useSameAsHeadOfficial = false;

            await form1.update({ form_data: fd }, { transaction });
        }
    }

    /**
     * SDN-1321: when the org's head changes (rotation via change-head-authorized-official),
     * push the new head's profile into form_data of every application so the PDF (which reads
     * head_authorized_official_* from the live org/User source) reflects the rotation without
     * waiting for each application to be re-saved.
     */
    static async syncForm1HeadAuthorizedOfficialForOrganization(
        organizationId: string,
        transaction?: Transaction,
    ): Promise<void> {
        const scopes = await OrganizationUserService.resolveHeadAndPrimaryFromUserScopes(
            organizationId,
            transaction,
        );
        if (!scopes.headAuthorizedOfficialUserId) return;

        const applications = await Application.findAll({
            where: { organization_id: organizationId },
            attributes: ['id'],
            transaction,
        });
        if (!applications.length) return;

        for (const app of applications) {
            const form1 = await ApplicationForm.findOne({
                where: { application_id: app.id, form_id: 1 },
                transaction,
            });
            if (!form1) continue;

            const fd = typeof form1.form_data === 'string'
                ? JSON.parse(String(form1.form_data) || '{}')
                : { ...(form1.form_data as Record<string, unknown>) };

            fd.headAuthorizedOfficialName = scopes.headAuthorizedOfficialName;
            fd.headAuthorizedOfficialEmail = scopes.headAuthorizedOfficialEmail;
            fd.headAuthorizedOfficialTitle = scopes.headAuthorizedOfficialTitle;
            fd.headAuthorizedOfficialPhone = scopes.headAuthorizedOfficialPhone;

            await form1.update({ form_data: fd }, { transaction });
        }
    }

    /**
     * When the HAO saves Form 1, sync head authorized official fields back to the user profile
     * (My Profile name, title, phone) when the form email matches the signed-in user.
     */
    static async syncHeadAuthorizedOfficialFromForm1ToUserProfile(
        userId: string,
        organizationId: string,
        formData: Record<string, unknown>,
        transaction?: Transaction,
    ): Promise<void> {
        logger.info('[hao-sync] entry', { userId, organizationId, hasFormData: !!formData, formHaoName: formData?.headAuthorizedOfficialName, formHaoTitle: formData?.headAuthorizedOfficialTitle });
        const isHead = await OrganizationUserService.userIsHeadAuthorizedOfficialForOrganization(
            userId,
            organizationId,
        );
        logger.info('[hao-sync] isHead', { userId, organizationId, isHead });
        if (!isHead) return;

        const user = await User.findByPk(userId, {
            attributes: ['id', 'name', 'email'],
            transaction,
        });
        logger.info('[hao-sync] user', { userId, userFound: !!user, userName: user?.name, userEmail: user?.email });
        if (!user) return;

        const formEmail = String(formData.headAuthorizedOfficialEmail ?? '')
            .trim()
            .toLowerCase();
        const userEmail = String(user.email ?? '').trim().toLowerCase();
        // SDN-1321: form email may legitimately differ from the User account email (org admin filled the
        // form on behalf of the HAO, HAO's account uses a different login, etc.). Don't silently skip
        // everything — only refuse to rename the User account; org-scoped title/phone still sync.
        const emailMismatch = !!formEmail && formEmail !== userEmail;
        logger.info('[hao-sync] email check', { formEmail, userEmail, emailMismatch });
        if (emailMismatch) {
            logger.warn('HAO form email differs from User account email; skipping User.name update (title/phone still sync)', {
                userId,
                organizationId,
            });
        }

        const userUpdates: { name?: string } = {};
        if (!emailMismatch && formData.headAuthorizedOfficialName !== undefined) {
            const name = String(formData.headAuthorizedOfficialName).trim();
            if (name) userUpdates.name = name;
        }
        logger.info('[hao-sync] userUpdates', { userId, userUpdates, willUpdate: Object.keys(userUpdates).length > 0 });
        if (Object.keys(userUpdates).length > 0) {
            await user.update(userUpdates, { transaction });
            logger.info('[hao-sync] user.update fired', { userId, writtenName: userUpdates.name });
        }

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(
            organizationId,
            userId,
            transaction,
        );
        logger.info('[hao-sync] OrgUser found', { userId, organizationId, orgUserFound: !!organizationUser, orgUserId: (organizationUser as { id?: string | number } | null)?.id });
        if (!organizationUser) return;

        const orgUserUpdates: {
            title?: string | null;
            phoneNumber?: string | null;
        } = {};
        if (formData.headAuthorizedOfficialTitle !== undefined) {
            orgUserUpdates.title = String(formData.headAuthorizedOfficialTitle).trim() || null;
        }
        if (formData.headAuthorizedOfficialPhone !== undefined) {
            orgUserUpdates.phoneNumber =
                String(formData.headAuthorizedOfficialPhone).trim() || null;
        }
        logger.info('[hao-sync] orgUserUpdates', { userId, orgUserUpdates, willUpdate: Object.keys(orgUserUpdates).length > 0 });
        if (Object.keys(orgUserUpdates).length > 0) {
            await organizationUser.update(orgUserUpdates, { transaction });
            logger.info('[hao-sync] orgUser.update fired', { userId, writtenTitle: orgUserUpdates.title, writtenPhone: orgUserUpdates.phoneNumber });
        }

        await OrganizationUserService.invalidateUserScopeCaches([userId]);
    }

    /**
     * Resolves head authorized official and primary contact from user_scopes for this organization.
     * Prefer donee-scoped rows when {@link doneeAccountId} is provided; otherwise prefer org-level head
     * then any donee-specific head, and the lowest donee_account_id for primary when multiple exist.
     */
    static async resolveHeadAndPrimaryFromUserScopes(
        organizationId: string,
        transaction: Transaction | undefined,
        doneeAccountId?: number,
    ): Promise<{
        headAuthorizedOfficialName: string;
        headAuthorizedOfficialEmail: string;
        headAuthorizedOfficialTitle: string;
        headAuthorizedOfficialPhone: string;
        headAuthorizedOfficialUserId?: string;
        headDoneeAccountId?: number;
        primaryContactUserId?: string;
        primaryDoneeAccountId?: number;
        primaryContactFullName: string;
        primaryContactEmail: string;
        primaryContactTitle: string;
        primaryContactPhone: string;
        /** True when a user_scopes row has is_primary_contact (not head-as-primary fallback). */
        primaryContactHasDedicatedScope: boolean;
    }> {
        const empty = {
            headAuthorizedOfficialName: '',
            headAuthorizedOfficialEmail: '',
            headAuthorizedOfficialTitle: '',
            headAuthorizedOfficialPhone: '',
            headAuthorizedOfficialUserId: undefined as string | undefined,
            headDoneeAccountId: undefined as number | undefined,
            primaryContactUserId: undefined as string | undefined,
            primaryDoneeAccountId: undefined as number | undefined,
            primaryContactFullName: '',
            primaryContactEmail: '',
            primaryContactTitle: '',
            primaryContactPhone: '',
            primaryContactHasDedicatedScope: false,
        };

        const scopes = (await UserScope.findAll({
            where: {
                [Op.or]: [{ is_head_representative: true }, { is_primary_contact: true }],
            },
            include: [
                {
                    model: OrganizationUser,
                    as: 'organizationUser',
                    where: { organizationId, is_active: true },
                    required: true,
                    attributes: ['id', 'userId', 'title', 'phoneNumber'],
                    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'], required: true }],
                },
            ],
            transaction,
        })) as UserScopeWithOrgUser[];

        const headCandidates = scopes.filter((s) => s.is_head_representative === true);
        let headScope: UserScopeWithOrgUser | undefined;
        if (doneeAccountId != null) {
            headScope =
                headCandidates.find((s) => s.donee_account_id === doneeAccountId) ??
                headCandidates.find((s) => s.donee_account_id == null);
        } else {
            headScope =
                headCandidates.find((s) => s.donee_account_id == null) ??
                [...headCandidates].sort((a, b) => (a.donee_account_id ?? 0) - (b.donee_account_id ?? 0))[0];
        }

        const primaryCandidates = scopes.filter((s) => s.is_primary_contact === true);
        let primaryScope: UserScopeWithOrgUser | undefined;
        if (doneeAccountId != null) {
            primaryScope =
                primaryCandidates.find((s) => s.donee_account_id === doneeAccountId) ??
                primaryCandidates.find((s) => s.donee_account_id == null);
        } else {
            primaryScope = [...primaryCandidates].sort(
                (a, b) => (a.donee_account_id ?? 0) - (b.donee_account_id ?? 0),
            )[0];
        }

        let primaryContactHasDedicatedScope = primaryScope != null;

        // No donee-scoped or org-level primary row yet: use head (e.g. creator after org registration, or before primary is split on a donee).
        if (!primaryScope && headScope?.organizationUser?.user) {
            const headOkForPrimaryFallback =
                doneeAccountId == null ||
                headScope.donee_account_id == null ||
                headScope.donee_account_id === doneeAccountId;
            if (headOkForPrimaryFallback) {
                primaryScope = headScope;
            }
        }

        if (headScope?.organizationUser?.user) {
            const ou = headScope.organizationUser;
            const u = ou.user!;
            empty.headAuthorizedOfficialName = (u.name ?? '').trim();
            empty.headAuthorizedOfficialEmail = (u.email ?? '').trim();
            empty.headAuthorizedOfficialTitle = (ou.title ?? '').trim();
            empty.headAuthorizedOfficialPhone = (ou.phoneNumber ?? '').trim();
            empty.headAuthorizedOfficialUserId = u.id;
            empty.headDoneeAccountId = headScope.donee_account_id ?? undefined;
        }

        if (primaryScope?.organizationUser?.user) {
            const ou = primaryScope.organizationUser;
            const u = ou.user!;
            empty.primaryContactFullName = (u.name ?? '').trim();
            empty.primaryContactEmail = (u.email ?? '').trim();
            empty.primaryContactTitle = (ou.title ?? '').trim();
            empty.primaryContactPhone = (ou.phoneNumber ?? '').trim();
            empty.primaryContactUserId = u.id;
            const scopeDoneeId = primaryScope.donee_account_id ?? undefined;
            empty.primaryDoneeAccountId =
                scopeDoneeId != null
                    ? scopeDoneeId
                    : doneeAccountId != null
                        ? doneeAccountId
                        : undefined;
        }

        empty.primaryContactHasDedicatedScope = primaryContactHasDedicatedScope;

        return empty;
    }

    /**
     * Fetch organization by ID with head authorized official and primary contact (from user_scopes when present).
     * @param organizationId - The organization ID.
     * @param transaction - Optional Sequelize transaction (e.g. document generation in-flight updates).
     * @param options - Optional {@link doneeAccountId} to scope head/primary resolution to one donee account.
     * @returns The organization with head authorized official fields and primary ids.
     */
    static async getOrganizationById(organizationId: string, transaction?: Transaction, options?: GetOrganizationByIdOptions,) {
        const doneeAccountId = options?.doneeAccountId;

        const organization = await Organization.findByPk(organizationId, {
            include: [
                {
                    model: OrganizationUser,
                    as: 'members',
                    where: { is_active: true },
                    required: false,
                    attributes: ['id', 'userId', 'title', 'phoneNumber'],
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['id', 'name', 'email'],
                            required: true,
                        },
                        {
                            model: UserScope,
                            as: 'userScope',
                            required: false,
                            attributes: [
                                'id',
                                'user_id',
                                'organization_user_id',
                                'donee_account_id',
                                'is_head_representative',
                                'is_primary_contact',
                            ],
                        },
                    ],
                },
            ],
            transaction,
        });

        if (!organization) {
            return null;
        }

        const resolved = await OrganizationUserService.resolveHeadAndPrimaryFromUserScopes(
            organizationId,
            transaction,
            doneeAccountId,
        );

        let headAuthorizedOfficialName = resolved.headAuthorizedOfficialName;
        let headAuthorizedOfficialEmail = resolved.headAuthorizedOfficialEmail;
        let headAuthorizedOfficialTitle = resolved.headAuthorizedOfficialTitle;
        let headAuthorizedOfficialPhone = resolved.headAuthorizedOfficialPhone;
        let headAuthorizedOfficialUserId = resolved.headAuthorizedOfficialUserId;
        const headDoneeAccountId = resolved.headDoneeAccountId;

        if (!headAuthorizedOfficialUserId) {
            headAuthorizedOfficialName = '';
            headAuthorizedOfficialEmail = '';
            headAuthorizedOfficialPhone = '';
            headAuthorizedOfficialTitle = '';
        }

        const organizationData = organization.toJSON();

        const addresses = await OrganizationAddressService.listByOrganizationId(organizationId, transaction);
        const mailingCompat = OrganizationAddressService.mailingFieldsFromAddressRows(addresses);
        return {
            ...organizationData,
            ...mailingCompat,
            addresses: addresses.map((a) => a.toJSON()),
            head_authorized_official_name: headAuthorizedOfficialName,
            head_authorized_official_email: headAuthorizedOfficialEmail,
            head_authorized_official_phone: headAuthorizedOfficialPhone,
            head_authorized_official_title: headAuthorizedOfficialTitle,
            head_authorized_official_user_id: headAuthorizedOfficialUserId,
            head_donee_account_id: headDoneeAccountId,
            primary_contact_user_id: resolved.primaryContactUserId,
            primary_donee_account_id: resolved.primaryDoneeAccountId,
            primary_contact_name: resolved.primaryContactFullName?.trim() || '',
            primary_contact_email: resolved.primaryContactEmail?.trim() || '',
            primary_contact_title: resolved.primaryContactTitle?.trim() || '',
            primary_contact_phone: resolved.primaryContactPhone?.trim() || '',
            primary_contact_has_dedicated_scope: resolved.primaryContactHasDedicatedScope,
        };
    }

    /**
     * Fetches a record by organization ID and user ID.
     * @param organizationId - The organization ID.
     * @param userId - The user ID.
     * @returns The organization user record.
     */
    static async getRecordByOrganizationAndUser(organizationId: string, userId: string, transaction?: Transaction): Promise<OrganizationUser | null> {
        return await OrganizationUser.findOne({ where: { organizationId, userId }, transaction });
    }

    /**
      * Fetches paginated organizations for a specific user.
      * @param userId - The user ID.
      * @param page - The current page number.
      * @param limit - The number of items per page.
      * @returns A paginated response with organization IDs and names.
      */
    static async getUserOrganizations(userId: string, page = 1, limit = 10) {
        const cacheKey = cacheKeys.userOrganizations.key({ unique: userId, page, limit });

        // Try to get from cache
        const cached = await cache.get<typeof result>(cacheKey);
        if (cached) return cached;

        // Fetch from database
        const result = await paginateSequelize<OrganizationUser>(OrganizationUser, page, limit, {
            where: { userId },
            include: [{
                model: Organization,
                attributes: ['id', 'name'],
                as: 'organization',
                include: [{
                    model: DoneeAccount,
                    attributes: ['id', 'isActive'],
                    as: 'donee_accounts',
                    include: [{
                        model: Application,
                        attributes: ['id', 'status'],
                        as: 'application',
                        include: [{
                            model: ApplicationForm,
                            as: 'applicationForms',
                            attributes: ['form_id', 'status'],
                            required: false,
                        }],
                    }],
                }],
            }],
        });

        const organizations = (
            await Promise.all(
                result.items
                    .filter((orgUser) => orgUser.is_active)
                    .map(async (orgUser) => {
                        const organizationId = orgUser.organizationId;
                        const applicationsForEditCheck = (orgUser.organization!.donee_accounts ?? [])
                            .map((account) => account.application)
                            .filter(
                                (app): app is Application & { applicationForms?: ApplicationForm[] } =>
                                    app != null,
                            );

                        const canEditOrganizationInfo =
                            await OrganizationUserService.getCanEditOrganizationInfoForOrganization(
                                userId,
                                organizationId,
                                applicationsForEditCheck,
                            );

                        return {
                            id: String(orgUser.organization!.id),
                            name: orgUser.organization!.name,
                            hasActiveDoneeAccount:
                                orgUser.organization!.donee_accounts?.some((account) => account.isActive) ??
                                false,
                            hasApprovedApplication:
                                orgUser.organization!.donee_accounts?.some(
                                    (account) =>
                                        account.application &&
                                        account.application.status ===
                                        EligibilityApplicationStatuses.APPROVED,
                                ) ?? false,
                            canEditOrganizationInfo,
                        };
                    }),
            )
        ).filter((org) => org.id);

        const paginatedResult = {
            items: organizations,
            pagination: result.pagination,
        };

        // Cache the result
        await cache.set(cacheKey, paginatedResult, cacheKeys.userOrganizations.ttl);

        return paginatedResult;
    }

    /**
     * Fetches all users for a specific organization.
     * @param orgId - The organization ID.
     * @returns An array of user IDs associated with the organization.
     */
    static async getOrganizationUsers(orgId: string): Promise<{ user: User, organizationUser: OrganizationUser | undefined }[]> {
        const organizationUsers = await OrganizationUser.findAll({
            where: { organizationId: orgId },
            attributes: ['id', 'userId', 'is_active', 'title', 'phoneNumber', 'deactivatedAt'],
        });

        if (!organizationUsers.length) {
            throw new AppError(404, 'No users found for this organization');
        }

        const userIds = organizationUsers.map((entry) => entry.userId);

        const scope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION } });
        if (!scope) throw new AppError(400, 'Unable to get organization scope');

        const users = await User.findAll({
            where: { id: userIds },
            attributes: ['id', 'name', 'email'],
            include: [{
                model: UserScope,
                as: 'userScopes',
                where: { scope_id: scope.scope_id },
                required: false,
                include: [{
                    model: Role,
                    as: 'role',
                    attributes: ['role_id', 'role_name'],
                }]
            }]
        });

        return users.map(user => {
            const orgUser = organizationUsers.find((entry) => entry.userId === user.id);
            const userWithScopes = user as User & { userScopes?: UserScope[] };

            // Filter user scopes to only include the one matching this organization
            if (userWithScopes.userScopes && orgUser) {
                userWithScopes.userScopes = userWithScopes.userScopes.filter(
                    (us) => us.organization_user_id === orgUser.id
                );
            }

            return {
                user: userWithScopes,
                organizationUser: orgUser
            };
        });
    }

    /**
     * Fetches paginated organization users with optional filter and sort.
     */
    static async getOrganizationUsersPaginated(
        orgId: string,
        page: number,
        limit: number,
        filterKey?: UserFilterKeys,
        operator: string = 'contains',
        filterValue?: string,
        sortBy?: string,
        sortOrder?: string
    ): Promise<PaginatedResponse<{ user: User; organizationUser: OrganizationUser | undefined }>> {
        const scope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION } });
        if (!scope) throw new AppError(400, 'Unable to get organization scope');

        const whereClause: Record<string, unknown> = { organizationId: orgId };

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
                    // Filter applied via Role include where below
                    break;
                case UserFilterKeys.CREATED_AT:
                    whereClause.createdAt = getSequelizeDateCondition(operator, filterValue ?? '');
                    break;
            }
        }

        const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
        let order: [string, string][] | [{ model: typeof User; as: string }, string, string][] = [['createdAt', orderDir]];
        if (sortBy === 'name' || sortBy === 'email') {
            order = [[{ model: User, as: 'user' }, sortBy, orderDir]];
        } else if (sortBy === 'is_active' || sortBy === 'active') {
            order = [['is_active', orderDir]];
        } else if (sortBy === 'createdAt' || sortBy) {
            order = [['createdAt', orderDir]];
        }

        // distinct: true so findAndCountAll counts distinct OrganizationUser rows, not joined rows
        // (User -> UserScopes -> Role can duplicate rows per org user and inflate count otherwise)
        const result = await paginateSequelize<OrganizationUser>(OrganizationUser, page, limit, {
            distinct: true,
            where: whereClause,
            attributes: ['id', 'userId', 'organizationId', 'is_active', 'title', 'phoneNumber', 'deactivatedAt', 'createdAt'],
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'name', 'email', 'avatar_url'],
                    required: true,
                    include: [{
                        model: UserScope,
                        as: 'userScopes',
                        where: { scope_id: scope.scope_id, organization_user_id: col('OrganizationUser.id') },
                        required: filterKey === UserFilterKeys.ROLE_NAME,
                        attributes: ['id', 'organization_user_id', 'role_id'],
                        include: [{
                            model: Role,
                            as: 'role',
                            attributes: ['role_id', 'role_name'],
                            ...(filterKey === UserFilterKeys.ROLE_NAME && shouldApplyFilter(operator, filterValue) && {
                                where: { role_name: getSequelizeCondition(operator, filterValue ?? '') as object },
                            }),
                        }]
                    }]
                }
            ],
            order,
        });

        // Map to same shape as getOrganizationUsers for backward compatibility
        const items = result.items.map((orgUser) => {
            const user = (orgUser as OrganizationUser & { user: User & { userScopes?: UserScope[] } }).user;
            const userWithScopes = user as User & { userScopes?: UserScope[] };
            if (userWithScopes.userScopes) {
                userWithScopes.userScopes = userWithScopes.userScopes.filter((us) => us.organization_user_id === orgUser.id);
            }
            return { user: userWithScopes, organizationUser: orgUser };
        });

        return { items, pagination: result.pagination };
    }

    /**
     * Adds a user to an organization.
     * @param orgId - The organization ID.
     * @param userId - The ID of the user to be added.
     * @returns The new organization-user mapping.
     */
    static async addUser(orgId: string, userId: string, owner: boolean, transaction?: Transaction, details?: { title?: string | null; phoneNumber?: string | null }
    ): Promise<OrganizationUser> {
        // Check if the user is already in the organization
        const existingEntry = await OrganizationUser.findOne({
            where: { organizationId: orgId, userId: userId },
            transaction,
        });

        if (existingEntry) {
            throw new AppError(409, 'User is already part of this organization');
        }

        // Add the user to the organization
        const newOrganizationUser = await OrganizationUser.create({
            organizationId: orgId,
            userId: userId,
            owner,
            is_active: true,
            title: details?.title,
            phoneNumber: details?.phoneNumber,
        }, { transaction });

        // Invalidate cache because organization membership has changed
        await cache.deleteSmart(cacheKeys.userOrganizations, userId);

        return newOrganizationUser;
    }

    /**
     * Checks if a user is part of an organization.
     * @param orgId - The organization ID.
     * @param userId - The user ID.
     * @returns True if the user is part of the organization, false otherwise.
     */
    static async isUserInOrganization(organizationId: string, userId: string): Promise<boolean> {
        const organizationUser = await OrganizationUser.findOne({
            where: { organizationId, userId },
        });

        return !!organizationUser;
    }


    /**
     * Assigns a role to an organization user.
     * @param organizationUserId - The ID of the organization user.
     * @param userId - The user ID.
     * @param transaction - Optional transaction for database operations.
     * @returns The created user scope entry.
     */
    static async assignRoleToOrganizationUser(payload: { organizationUserId: number, userId: string, role_name?: string, role_id?: number, is_organization_create_action?: boolean }, transaction?: Transaction) {
        const { organizationUserId, userId, role_name, role_id, is_organization_create_action } = payload
        let role;

        const scope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION } });
        if (role_id) role = await Role.findOne({ where: { role_id } });

        if (role_name) {
            const predefinedRole = PredefinedRoles[role_name as keyof typeof PredefinedRoles];
            if (!predefinedRole) throw new AppError(400, 'Invalid role name provided');

            role = await Role.findOne({ where: { role_name: predefinedRole } });
        }

        if (!scope || !role) throw new AppError(400, 'Unable to get user scope');


        // Check if the user has the Organization_Admin role
        const organizationAdminRole = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Admin } });
        if (!organizationAdminRole) throw new AppError(400, 'Could not find role');

        const isOrganizationAdmin = await UserScope.findOne({
            where: { user_id: userId, role_id: organizationAdminRole.role_id, scope_id: scope.scope_id, organization_user_id: organizationUserId },
            transaction
        });

        if (isOrganizationAdmin) throw new AppError(400, 'Cannot change role of organization admin');

        let userScope = await UserScope.findOne({
            where: { user_id: userId, scope_id: scope.scope_id, organization_user_id: organizationUserId, },
            transaction,
        });

        if (userScope) {
            userScope.role_id = role.role_id;
            await userScope.save({ transaction });
        } else {
            userScope = await UserScope.create({
                user_id: userId,
                scope_id: scope.scope_id,
                role_id: role.role_id,
                organization_user_id: organizationUserId,
            }, { transaction });
        }

        await OrganizationUserService.invalidateUserScopeCaches([userId]);

        return userScope;
    }

    /**
     * Sets the activation status of a user in an organization.
     * @param organizationUserId - The ID of the organization user.
     * @param isActive - The desired activation status.
     * @param transaction - Optional transaction for database operations.
     * @returns The updated organization user entry.
     */
    static async setActivateStatus(isActive: boolean, organizationId: string, userId: string, transaction?: Transaction): Promise<OrganizationUser> {
        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(organizationId, userId);
        if (!organizationUser) throw new AppError(404, 'Organization user not found');

        const scope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION } });
        if (!scope) throw new AppError(400, 'Unable to get user scope');

        // Check if the user has the Organization_Admin role
        const organizationAdminRole = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Admin } });
        if (!organizationAdminRole) throw new AppError(400, 'Could not found role');


        const isOrganizationAdmin = await UserScope.findOne({
            where: { user_id: userId, organization_user_id: organizationUser.id, role_id: organizationAdminRole.role_id, scope_id: scope.scope_id, },
            transaction
        });

        if (isOrganizationAdmin) throw new AppError(400, 'Cannot change activation of Organization Admin user');

        if (organizationUser.is_active === isActive) throw new AppError(400, `User is already ${isActive ? 'active' : 'inactive'}`);


        organizationUser.is_active = isActive;
        organizationUser.deactivatedAt = isActive ? null : new Date();

        await organizationUser.update({ is_active: isActive, deactivatedAt: isActive ? null : new Date() }, { transaction });

        // Invalidate cache because organization membership has changed
        await cache.deleteSmart(cacheKeys.userOrganizations, organizationUser.userId);
        return organizationUser;
    }


}
