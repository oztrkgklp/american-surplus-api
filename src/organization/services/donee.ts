import DoneeAccount from '@/organization/models/DoneeAccount';
import State from '@/states/models/State';
import { AppError } from '@/utils/response/appError';
import Request from '@/properties/models/Request';
import StateDisposalFees from '@/states/models/StateDisposalFees';
import DisposalCondition from '@/metadata/models/DisposalCondition';
import { Op, Transaction } from 'sequelize';
import Scope from '@/authz/models/Scope';
import { ScopeType } from '@/enums/scope.enum';
import User from '@/authn/models/User';
import UserScope from '@/authz/models/UserScope';
import Role from '@/authz/models/Role';
import { PredefinedRoles } from '@/enums/predefinedRoles.enum';
import { OrganizationService } from './organization';
import { OrganizationUserService } from './organizationUser';
import Organization from '../models/Organization';
import OrganizationUser from '../models/OrganizationUser';
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import Sba8aCertification from '@/organization/models/Sba8aCertification.entity';
import Application from '@/eligibility/models/Application.entity';
import { getLogger } from '@/utils/logger';

const logger = getLogger('DoneeAccountService');

type UserScopeWithOrgUser = UserScope & { organizationUser?: OrganizationUser };

export class DoneeAccountService {
    /**
     * Resolves the active head scope for a donee account (donee-scoped row first, then org-level).
     */
    private static async findHeadScopeForDoneeAccount(organizationId: string, doneeAccountId: number, transaction?: Transaction,): Promise<UserScopeWithOrgUser | null> {
        const scopes = (await UserScope.findAll({
            where: { is_head_representative: true },
            include: [
                {
                    model: OrganizationUser,
                    as: 'organizationUser',
                    where: { organizationId, is_active: true },
                    required: true,
                },
            ],
            transaction,
        })) as UserScopeWithOrgUser[];

        return (
            scopes.find((s) => s.donee_account_id === doneeAccountId) ??
            scopes.find((s) => s.donee_account_id == null) ??
            null
        );
    }

    /**
     * Removes HAO from a former head: clears head flags, deletes head-only donee scopes,
     * and demotes organization admin to manager when applicable.
     */
    static async releaseHeadAuthorizedOfficialRole(organizationId: string, userId: string, doneeAccountId: number, transaction?: Transaction,): Promise<void> {
        const scopes = (await UserScope.findAll({
            where: { user_id: userId },
            include: [
                {
                    model: OrganizationUser,
                    as: 'organizationUser',
                    where: { organizationId, is_active: true },
                    required: true,
                },
            ],
            transaction,
        })) as UserScopeWithOrgUser[];

        const relevantScopes = scopes.filter((s) => s.is_head_representative === true && (s.donee_account_id === doneeAccountId || s.donee_account_id == null));

        for (const scope of relevantScopes) {
            if (scope.is_primary_contact) {
                await scope.update({ is_head_representative: null }, { transaction });
            } else if (scope.donee_account_id === doneeAccountId) {
                await scope.destroy({ transaction });
            } else {
                await scope.update({ is_head_representative: null }, { transaction });
            }
        }

        const orgScope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION }, transaction });
        const orgManagerRole = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Manager }, transaction });
        if (!orgScope || !orgManagerRole) return;

        const orgUserScope = await this.findOrganizationScopeForUser(
            organizationId,
            userId,
            orgScope.scope_id,
            transaction,
        );

        if (orgUserScope) await orgUserScope.update({ role_id: orgManagerRole.role_id }, { transaction });
    }

    private static async findOrganizationScopeForUser(organizationId: string, userId: string, orgScopeId: number, transaction?: Transaction,): Promise<UserScope | null> {
        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(
            organizationId,
            userId,
            transaction,
        );
        if (!organizationUser) return null;

        return UserScope.findOne({
            where: {
                user_id: userId,
                scope_id: orgScopeId,
                organization_user_id: organizationUser.id,
            },
            transaction,
        });
    }
    /**
     * Fetches all donee accounts for a specific organization.
     * @param orgId - The organization ID.
     * @returns An array of donee account objects scoped to the organization.
     */
    static async getDoneeAccounts(orgId: string): Promise<Partial<DoneeAccount>[]> {
        const doneeAccounts = await DoneeAccount.findAll({
            include: [
                {
                    model: Application,
                    as: 'application',
                },
                {
                    model: State,
                    as: 'state',
                },
                {
                    model: Organization,
                    as: 'organization',
                    include: [
                        {
                            model: OrganizationUser,
                            as: 'members',
                            include: [
                                {
                                    model: User,
                                    as: 'user',
                                    include: [
                                        {
                                            model: UserScope,
                                            as: 'userScopes',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                }
            ],
            where: { organizationId: orgId },
            attributes: ['id', 'name', 'isActive'], // Only fetch specified attributes
        });

        //TO DO JUST MAKE SURE THIS IS NOT GOING TO EFFECT SOMEWHERE ELSE

        // if (!doneeAccounts.length) {
        //     throw new AppError(404, 'No donee accounts found for this organization');
        // }

        return doneeAccounts.map((entry) => {
            const organization = entry.organization as Organization & { members: OrganizationUser[] };
            const members = organization?.members;

            const newMembers = members?.filter((member) => {
                const user = (member as OrganizationUser & { user: User & { userScopes: UserScope[] } })?.user;
                const userScopes = user?.userScopes;

                return userScopes?.some((scope) => scope.donee_account_id === entry.id);
            }).map((member) => {
                const user = (member as OrganizationUser & { user: User & { userScopes: UserScope[] } })?.user;
                const userScopes = user?.userScopes;

                const newUserScopes = userScopes?.filter((scope) => scope.organization_user_id === member.id);

                return {
                    ...member.get(),
                    user: {
                        useScopes: undefined,
                        ...user.get(),
                        isPrimaryContact: newUserScopes?.some((scope) => scope.is_primary_contact),
                    },
                };
            });
            return { ...entry.get(), organization: { ...organization.get(), members: newMembers } } as unknown as Partial<DoneeAccount>;
        });
    }

    /**
    * Fetches a donee account by its ID.
    * @param doneeAccountId - The ID of the donee account.
    * @returns The donee account object.
    */
    static async getDoneeAccountById(doneeAccountId: number, transaction?: Transaction): Promise<DoneeAccount> {
        const doneeAccount = await DoneeAccount.findByPk(doneeAccountId, { transaction });
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        return doneeAccount;
    }

    /**
     * Fetches a donee account by organization ID and state ID.
     * @param organizationId - The organization ID.
     * @param stateId - The state ID.
     * @returns The donee account object if found.
     */
    static async getDoneeAccountByOrganizationAndState(organizationId: string, stateId: number, transaction?: Transaction): Promise<DoneeAccount | null> {
        return await DoneeAccount.findOne({
            where: { organizationId, stateId }, transaction
        });
    }

    /**
     * Fetches donee accounts along with their associated organization users.
     * @param orgId - The organization ID.
     * @returns An array of donee accounts with their associated organization users.
     */
    static async getDoneeAccountWithUsers(doneeAccountId: number): Promise<Partial<DoneeAccount>> {
        const doneeAccount = await DoneeAccount.findOne({
            include: [
                {
                    model: State,
                    as: 'state',
                },
                {
                    model: Organization,
                    as: 'organization',
                    include: [
                        {
                            model: OrganizationUser,
                            as: 'members',
                            include: [
                                {
                                    model: User,
                                    as: 'user',
                                },
                            ],
                        },
                    ],
                },
            ],
            where: { id: doneeAccountId },
        });

        if (!doneeAccount) throw new AppError(404, 'Donee account not found');
        return doneeAccount;
    }

    /**
     * Get donee account's organization ID by the donee account ID.
     * @param doneeAccountId - The donee account ID.
     * @returns The organization ID associated with the donee account.
     */
    static async getDoneeAccountOrganizationId(doneeAccountId: string): Promise<string> {
        const doneeAccount = await DoneeAccount.findByPk(doneeAccountId, { attributes: ['organizationId'], });
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        return doneeAccount.organizationId;
    }

    /** 
     * Fetches all donee accounts for a specific request.
     * @param requestId - The request ID.
     * @returns A donee account object scoped to the request.
     */
    static async getDoneeAccountByRequestId(requestId: number): Promise<DoneeAccount> {
        const request = await Request.findByPk(requestId, {
            include: [{
                model: DoneeAccount,
                as: 'doneeAccount',
            }],
        });

        if (!request?.doneeAccount) throw new AppError(404, 'No donee accounts found for this organization');

        return request.doneeAccount;
    }

    /**
     * Fetches all donee accounts for a specific state.
     * @param stateId - The state ID.
     * @returns An array of donee account objects scoped to the state.
     */
    /**
     * Retrieves all DoneeAccount records for a given state, including related organization,
     * organization members, users, and user scopes. For each DoneeAccount, attaches the
     * head authorized official's and primary contact's name and email, if available, based
     * on the associated UserScope flags.
     *
     * @param stateId - The ID of the state to filter DoneeAccounts by.
     * @returns A promise that resolves to an array of DoneeAccount objects (as partials),
     *          each augmented with `headAuthorizedOfficialName`, `headAuthorizedOfficialEmail`,
     *          `primaryContactName`, and `primaryContactEmail` properties.
     */
    static async getDoneeAccountsByState(stateId: number): Promise<Partial<DoneeAccount>[]> {
        const doneeAccounts = await DoneeAccount.findAll({
            include: [
                {
                    model: State,
                    as: 'state',
                },
                {
                    model: Organization,
                    as: 'organization',
                    include: [
                        {
                            model: OrganizationUser,
                            as: 'members',
                            include: [
                                {
                                    model: User,
                                    as: 'user',
                                    attributes: ['id', 'name', 'email'],
                                    include: [
                                        {
                                            model: UserScope,
                                            as: 'userScopes',
                                            // Remove the where clause so all userScopes are included
                                            required: false,
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
            where: { stateId },
        });

        // Attach headAuthorizedOfficialName, headAuthorizedOfficialEmail, primaryContactName, primaryContactEmail
        return doneeAccounts.map((entry) => {
            let headAuthorizedOfficialName = '';
            let headAuthorizedOfficialEmail = '';
            let primaryContactName = '';
            let primaryContactEmail = '';

            const organization = entry.organization as Organization & { members: OrganizationUser[] };
            const members = organization?.members || [];

            for (const member of members) {
                const user = (member as OrganizationUser & { user: User & { userScopes: UserScope[] } })?.user;
                if (!user) continue;
                const userScopes = user.userScopes || [];

                for (const scope of userScopes) {
                    if (scope.donee_account_id !== entry.id) continue;
                    if (scope.is_head_representative) {
                        headAuthorizedOfficialName = user.name;
                        headAuthorizedOfficialEmail = user.email;
                    }
                    if (scope.is_primary_contact) {
                        primaryContactName = user.name;
                        primaryContactEmail = user.email;
                    }
                }
            }

            return {
                ...entry.get(),
                headAuthorizedOfficialName,
                headAuthorizedOfficialEmail,
                primaryContactName,
                primaryContactEmail,
            } as Partial<DoneeAccount> & {
                headAuthorizedOfficialName: string;
                headAuthorizedOfficialEmail: string;
                primaryContactName: string;
                primaryContactEmail: string;
            };
        });
    }

    static async getDoneeAccountByStateAndOrganization(stateId: number, organizationId: string): Promise<DoneeAccount | null> {
        return await DoneeAccount.findOne({
            where: { stateId, organizationId },
            include: [
                {
                    model: State,
                    as: 'state',
                },
                {
                    model: Organization,
                    as: 'organization',
                },
                {
                    model: Sba8aCertification,
                    as: 'sba8aCertification',
                },
            ],
        });
    }

    /** 
     * Fetches donee account with state disposal fees
     * @param doneeAccountId - The donee account ID
     * @returns A donee account object with state.stateDisposalFees
     */
    static async getStateFeesById(doneeAccountId: number): Promise<StateDisposalFees[]> {
        const doneeAccount = await DoneeAccount.findByPk(doneeAccountId);
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        const today = new Date().toISOString().slice(0, 10); // format: 'YYYY-MM-DD'
        const maxDate = await StateDisposalFees.max('effective_date', {
            where: { stateId: doneeAccount.stateId, effective_date: { [Op.lte]: today } },
        });

        if (!maxDate) throw new AppError(400, 'Could not fetch state fees at the moment');

        const disposalFees = await StateDisposalFees.findAll({
            where: {
                stateId: doneeAccount.stateId,
                effective_date: maxDate,
            },
            include: [{ model: DisposalCondition, as: 'disposalCondition' }],
        });

        if (!disposalFees) throw new AppError(404, 'State Disposal Fees not found for this donee account');
        return disposalFees;
    }

    /**
     * Creates a new donee account.
     * @param data - The data for the new donee account.
     * @returns The created donee account object.
     */
    static async createDoneeAccount(data: DoneeAccount, transaction?: Transaction): Promise<DoneeAccount> {
        const doneeAccount = await DoneeAccount.findOne({ where: { organizationId: data.organizationId, stateId: data.stateId } })
        if (doneeAccount) throw new AppError(400, 'Donee Account is already exist in this state');

        const newDoneeAccount = await DoneeAccount.create(data, { transaction });
        return newDoneeAccount;

    }

    /**
     * Updates a donee account by its ID.
     * @param doneeId - The ID of the donee account to update.
     * @param data - The data to update the donee account with.
     * @returns The updated donee account object.
     */
    static async updateDoneeAccount(doneeAccountId: number, data: Partial<DoneeAccount>, transaction?: Transaction): Promise<DoneeAccount> {
        const doneeAccount = await this.getDoneeAccountById(doneeAccountId);
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        Object.assign(doneeAccount, data);
        await doneeAccount.save({ transaction });
        return doneeAccount;
    }

    /**
     * Deactivates a donee account by its ID.
     * @param doneeAccountId - The ID of the donee account to deactivate.
     * @returns A boolean indicating whether the operation was successful.
     */
    static async deactivateDoneeAccount(doneeAccountId: number, transaction?: Transaction): Promise<boolean> {
        const doneeAccount = await this.getDoneeAccountById(doneeAccountId);
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        await doneeAccount.update({ isActive: false, deactivatedAt: new Date() }, { transaction });
        return true;
    }

    /**
     * Activates a donee account by its ID.
     * @param doneeAccountId - The ID of the donee account to activate.
     * @returns A boolean indicating whether the operation was successful.
     */
    static async activateDoneeAccount(doneeAccountId: number, transaction?: Transaction): Promise<boolean> {
        const doneeAccount = await DoneeAccount.findByPk(doneeAccountId, {
            include: [
                { model: Organization, as: 'organization', },
                { model: State, as: 'state', },
            ],
        });
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        await doneeAccount.update({ isActive: true, deactivatedAt: null }, { transaction });

        // Fetch the head authorized official for this donee account
        const headAuthorizedOffical = await UserScope.findOne({
            where: { donee_account_id: doneeAccount.id, is_head_representative: true, },
            include: [{ model: User, as: 'user', }],
        });

        if (!headAuthorizedOffical) throw new AppError(404, 'Donee account does not have head authorized offical');

        const renderData = {
            templateName: TemplateEnum.Donee_Activation,
            data: { name: headAuthorizedOffical?.user?.name, stateName: doneeAccount?.state?.stateName, organizationName: doneeAccount?.organization?.name },
        };

        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: headAuthorizedOffical?.user?.email as string,
            subject: `Your Donee Account for ${doneeAccount?.state?.stateName} Is Now Active`,
            html: mailContent as string,
        };
        await emailQueue.add('saspInvitationNotification', mailData, { removeOnComplete: true, attempts: 3, });
        return true;
    }

    /**
     * Assigns roles to a donee account.
     * @param doneeAccountId - The ID of the donee account.
     * @param accounts - An array of objects containing email, roleName, and isPrimaryContact.
     * @returns A boolean indicating whether the operation was successful.
     */
    static async assignRolesToDoneeAccount(doneeAccountId: number, accounts: { userId: string, isPrimaryContact: boolean }[], transaction?: Transaction): Promise<boolean> {
        const scope = await Scope.findOne({ where: { type: ScopeType.DONEE } });
        if (!scope) throw new AppError(404, 'Scope for DONEE not found');

        const doneeAccount = await this.getDoneeAccountById(doneeAccountId);
        if (!doneeAccount) throw new AppError(404, 'Donee Account not found');

        const representativeRole = await Role.findOne({ where: { role_name: PredefinedRoles.Donee_Authorized_Representative } });
        if (!representativeRole) throw new AppError(404, `Role not found`);

        for (const { userId, isPrimaryContact } of accounts) {

            const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(doneeAccount.organizationId, userId, transaction);
            if (!organizationUser) {
                console.error(`Cannot assign donee account ${doneeAccountId}: User ${userId} is not a member of organization ${doneeAccount.organizationId}`);
                continue;
            }

            const hasDonneAccountScope = await UserScope.findOne({
                where: { user_id: userId, scope_id: scope.scope_id, organization_user_id: organizationUser.id },
                transaction,
            });

            if (hasDonneAccountScope) {
                throw new AppError(400, 'User already has a donee account scope');
            }

            // If isPrimaryContact is true, check if the donee account already has a primary contact
            if (isPrimaryContact) {
                const doneeAccountOrganizationId = doneeAccount.organizationId;
                const hasDoneeAccountPrimaryContactScope = await Organization.findOne({
                    where: { id: doneeAccountOrganizationId },
                    include: [
                        {
                            model: OrganizationUser,
                            as: 'members',
                            include: [
                                {
                                    model: UserScope,
                                    as: 'userScope',
                                    where: { is_primary_contact: true, donee_account_id: doneeAccountId },
                                },
                            ],
                        },
                    ],
                });

                if (hasDoneeAccountPrimaryContactScope) {
                    throw new AppError(400, 'Donee Account already has a primary contact user');
                }
            }

            await UserScope.create({
                user_id: userId,
                scope_id: scope.scope_id,
                role_id: representativeRole.role_id,
                organization_user_id: organizationUser.id,
                donee_account_id: doneeAccountId,
                is_primary_contact: isPrimaryContact,
            }, { transaction });
        }
        return true;
    }

    static async assignHeadAuthRoleDoneeAccount(doneeAccountId: number, userId: string, hasPrimaryContact: boolean, transaction?: Transaction): Promise<boolean> {
        const scope = await Scope.findOne({ where: { type: ScopeType.DONEE } });
        if (!scope) throw new AppError(404, 'Scope for DONEE not found');

        const doneeAccount = await this.getDoneeAccountById(doneeAccountId, transaction);
        if (!doneeAccount) throw new AppError(404, 'DONEE not found');

        const representativeRole = await Role.findOne({ where: { role_name: PredefinedRoles.Donee_Authorized_Representative } });
        if (!representativeRole) throw new AppError(404, `Role not found`);

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(
            doneeAccount.organizationId,
            userId,
            transaction,
        );
        if (!organizationUser) throw new AppError(404, `User is not found in organization`);

        await UserScope.create({
            user_id: userId,
            scope_id: scope.scope_id,
            role_id: representativeRole.role_id,
            organization_user_id: organizationUser.id,
            donee_account_id: doneeAccountId,
            is_primary_contact: !hasPrimaryContact,
            is_head_representative: true,
        }, { transaction });
        return true;
    }

    /**
     * Deletes a role for a donee account.
     * @param doneeAccountId - The ID of the donee account.
     * @param userId - The ID of the user whose role is to be deleted.
     * @returns A boolean indicating whether the operation was successful.
     */
    static async deleteRoleForDoneeAccount(doneeAccountId: number, userId: string, transaction?: Transaction): Promise<boolean> {
        const userScopes = await UserScope.findAll({
            where: { donee_account_id: doneeAccountId, user_id: userId },
            transaction,
        });

        if (userScopes.length === 0) throw new AppError(404, 'User scope not found for the donee account');
        if (userScopes.some((s) => s.is_head_representative || s.is_primary_contact)) {
            throw new AppError(400, 'Cannot unassign a Head Authorized Official or Primary Contact user');
        }

        await UserScope.destroy({ where: { donee_account_id: doneeAccountId, user_id: userId }, transaction });
        return true;
    }

    /**
     * Updates the primary contact for a donee account.
     * @param doneeAccountId - The ID of the donee account.
     * @param userId - The ID of the user to set as the primary contact.
     * @returns A boolean indicating whether the operation was successful.
     */
    static async updateDoneeAccountPrimaryContact(doneeAccountId: number, organizationId: string, userId: string, transaction?: Transaction): Promise<boolean> {
        const doneeAccount = await this.getDoneeAccountById(doneeAccountId);
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        const organizationExists = await OrganizationService.organizationExists(organizationId);
        if (!organizationExists) throw new AppError(404, 'Organization not found');

        const user = await User.findByPk(userId);
        if (!user) throw new AppError(404, 'User not found');

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(
            organizationId,
            userId,
            transaction,
        );
        if (!organizationUser) throw new AppError(400, 'User is not a member of the organization');

        // Transfer: clear every primary flag on this donee account, then set the selected user.
        // Set is_primary_contact to null for all users of the donee account
        await UserScope.update(
            { is_primary_contact: null },
            { where: { donee_account_id: doneeAccountId }, transaction }
        );

        let userDoneeScopes = await UserScope.findAll({
            where: { donee_account_id: doneeAccountId, user_id: userId },
            transaction,
        });
        if (userDoneeScopes.length === 0) {
            const doneeScope = await Scope.findOne({ where: { type: ScopeType.DONEE }, transaction });
            const representativeRole = await Role.findOne({
                where: { role_name: PredefinedRoles.Donee_Authorized_Representative },
                transaction,
            });
            if (!doneeScope || !representativeRole) {
                throw new AppError(404, 'Required scope or role not found');
            }
            await UserScope.create(
                {
                    user_id: userId,
                    scope_id: doneeScope.scope_id,
                    role_id: representativeRole.role_id,
                    organization_user_id: organizationUser.id,
                    donee_account_id: doneeAccountId,
                    is_primary_contact: true,
                    is_head_representative: null,
                },
                { transaction },
            );
        } else {
            const primaryTarget =
                userDoneeScopes.find((s) => !s.is_head_representative) ?? userDoneeScopes[0];
            await UserScope.update(
                { is_primary_contact: true },
                { where: { id: primaryTarget.id }, transaction },
            );
        }

        // SDN-1321: push the new PPOC's profile into form_data of every application in the org so
        // the PDF (and any UI reading form_data) reflects the rotation immediately.
        await OrganizationUserService.syncForm1PrimaryContactFromUserProfile(
            userId,
            organizationId,
            { name: user.name, title: organizationUser.title, phoneNumber: organizationUser.phoneNumber },
            transaction,
        );

        return true;
    }

    /**
     * Removes the dedicated primary contact flag for a user on a donee account.
     * Fails when this user is the only primary contact; use assign/transfer instead.
     * When duplicate primaries exist (data bug), allows clearing the selected user only.
     */
    static async clearDoneeAccountPrimaryContact(
        doneeAccountId: number,
        organizationId: string,
        userId: string,
        transaction?: Transaction,
    ): Promise<boolean> {
        const doneeAccount = await this.getDoneeAccountById(doneeAccountId);
        if (!doneeAccount) throw new AppError(404, 'Donee account not found');

        const organizationExists = await OrganizationService.organizationExists(organizationId);
        if (!organizationExists) throw new AppError(404, 'Organization not found');

        const user = await User.findByPk(userId);
        if (!user) throw new AppError(404, 'User not found');

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(
            organizationId,
            userId,
            transaction,
        );
        if (!organizationUser) throw new AppError(400, 'User is not a member of the organization');

        const existingPrimaryContact = await UserScope.findOne({
            where: { donee_account_id: doneeAccountId, user_id: userId, is_primary_contact: true },
            transaction,
        });

        if (!existingPrimaryContact) {
            throw new AppError(400, 'User is not a primary contact for this donee account');
        }

        const primaryScopes = await UserScope.findAll({
            where: { donee_account_id: doneeAccountId, is_primary_contact: true },
            attributes: ['user_id'],
            transaction,
        });
        const distinctPrimaryUserIds = [...new Set(primaryScopes.map((s) => s.user_id))];
        if (distinctPrimaryUserIds.length <= 1) {
            throw new AppError(
                400,
                'There must be at least one primary contact per donee account. Transfer primary contact to another user to remove this one.',
            );
        }

        await UserScope.update(
            { is_primary_contact: null },
            { where: { donee_account_id: doneeAccountId, user_id: userId, is_primary_contact: true }, transaction },
        );

        return true;
    }

    /**
     * Assigns head authorized official on a donee account, transferring from an existing head when present.
     */
    static async designateHeadAuthorizedOfficial(doneeAccountId: number, organizationId: string, newUserId: string, transaction?: Transaction,): Promise<DoneeAccount> {
        const existingHead = await this.findHeadScopeForDoneeAccount(
            organizationId,
            doneeAccountId,
            transaction,
        );

        if (existingHead && existingHead.user_id !== newUserId) {
            return this.changeHeadAuthorizedRepresentative(
                doneeAccountId,
                organizationId,
                newUserId,
                transaction,
            );
        }

        const doneeAccount = await this.getDoneeAccountById(doneeAccountId, transaction);
        if (doneeAccount.organizationId !== organizationId) throw new AppError(400, 'Donee account does not belong to this organization');

        const hasPrimary = await UserScope.findOne({
            where: { donee_account_id: doneeAccountId, is_primary_contact: true },
            transaction,
        });

        await this.assignHeadAuthRoleDoneeAccount(
            doneeAccountId,
            newUserId,
            Boolean(hasPrimary),
            transaction,
        );

        const orgScope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION }, transaction });
        const orgAdminRole = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Admin }, transaction, });
        if (!orgScope || !orgAdminRole) throw new AppError(404, 'Required scopes or roles not found');

        const newOrgScope = await this.findOrganizationScopeForUser(
            organizationId,
            newUserId,
            orgScope.scope_id,
            transaction,
        );
        if (newOrgScope) await newOrgScope.update({ role_id: orgAdminRole.role_id }, { transaction });

        await OrganizationUserService.invalidateUserScopeCaches([newUserId]);
        return doneeAccount;
    }

    static async changeHeadAuthorizedRepresentative(doneeAccountId: number, organizationId: string, newUserId: string, transaction?: Transaction): Promise<DoneeAccount> {
        const doneeAccount = await this.getDoneeAccountById(doneeAccountId, transaction);
        if (doneeAccount.organizationId !== organizationId) throw new AppError(400, 'Donee account does not belong to this organization');

        const organization = await Organization.findByPk(organizationId, { transaction });
        if (!organization) throw new AppError(404, 'Organization not found');

        const user = await User.findByPk(newUserId, { transaction });
        if (!user) throw new AppError(404, 'User not found');

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(
            organizationId,
            newUserId,
            transaction,
        );
        if (!organizationUser) throw new AppError(400, 'User is not a member of the organization');

        const orgScope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION }, transaction });
        const doneeScope = await Scope.findOne({ where: { type: ScopeType.DONEE }, transaction });
        if (!orgScope || !doneeScope) throw new AppError(404, 'Required scopes not found');

        const representativeRole = await Role.findOne({
            where: { role_name: PredefinedRoles.Donee_Authorized_Representative },
            transaction,
        });
        if (!representativeRole) throw new AppError(404, 'Donee representative role not found');

        const orgAdminRole = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Admin }, transaction });
        if (!orgAdminRole) throw new AppError(404, 'Organization admin role not found');

        const orgManagerRole = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Manager }, transaction });
        if (!orgManagerRole) throw new AppError(404, 'Organization manager role not found');

        const currentHeadScope = await this.findHeadScopeForDoneeAccount(
            organizationId,
            doneeAccountId,
            transaction,
        );
        if (!currentHeadScope || currentHeadScope.user_id === newUserId) {
            throw new AppError(404, 'Current head auth user is same with requested change');
        }

        const previousHeadUserId = currentHeadScope.user_id;
        await this.releaseHeadAuthorizedOfficialRole(
            organizationId,
            previousHeadUserId,
            doneeAccountId,
            transaction,
        );

        let newHeadScope = await UserScope.findOne({
            where: {
                donee_account_id: doneeAccountId,
                user_id: newUserId,
                [Op.or]: [{ is_primary_contact: null }, { is_primary_contact: false }],
            },
            order: [['id', 'ASC']],
            transaction,
        });
        if (!newHeadScope) {
            newHeadScope = await UserScope.findOne({
                where: { donee_account_id: doneeAccountId, user_id: newUserId },
                order: [['id', 'ASC']],
                transaction,
            });
        }
        if (!newHeadScope) {
            await UserScope.create(
                {
                    user_id: newUserId,
                    scope_id: doneeScope.scope_id,
                    role_id: representativeRole.role_id,
                    organization_user_id: organizationUser.id,
                    donee_account_id: doneeAccountId,
                    is_primary_contact: null,
                    is_head_representative: true,
                },
                { transaction },
            );
            newHeadScope = await UserScope.findOne({
                where: {
                    donee_account_id: doneeAccountId,
                    user_id: newUserId,
                    is_head_representative: true,
                },
                transaction,
            });
        } else {
            await newHeadScope.update({ is_head_representative: true }, { transaction });
        }
        if (!newHeadScope) throw new AppError(500, 'Failed to resolve head representative scope');

        const currentOrgAdminScope = await this.findOrganizationScopeForUser(
            organizationId,
            previousHeadUserId,
            orgScope.scope_id,
            transaction,
        );
        const newOrgAdminScope = await this.findOrganizationScopeForUser(
            organizationId,
            newUserId,
            orgScope.scope_id,
            transaction,
        );
        if (!newOrgAdminScope) throw new AppError(400, 'Head Auth User Not Found');

        if (currentOrgAdminScope) {
            await currentOrgAdminScope.update({ role_id: orgManagerRole.role_id }, { transaction });
        }
        await newOrgAdminScope.update({ role_id: orgAdminRole.role_id }, { transaction });

        await OrganizationUserService.invalidateUserScopeCaches([
            previousHeadUserId,
            newUserId,
        ]);

        // SDN-1321: push the new head's profile into form_data of every application so the PDF
        // (and any UI reading form_data) reflects the rotation immediately, without waiting for
        // each application to be re-saved.
        await OrganizationUserService.syncForm1HeadAuthorizedOfficialForOrganization(
            organizationId,
            transaction,
        );

        return doneeAccount;
    }

    static async headAuthInfoChange(
        userId: string,
        organizationId: string,
        updates: {
            head_authorized_official_name?: string;
            head_authorized_official_title?: string;
            head_authorized_official_phone?: string;
            head_authorized_official_email?: string;
        },
        transaction?: Transaction
    ): Promise<void> {
        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(organizationId, userId);
        if (!organizationUser) throw new AppError(400, 'User is not a member of the organization');

        const user = await User.findByPk(userId, { transaction });
        if (!user) throw new AppError(404, 'User not found');

        const userUpdates: Record<string, unknown> = {};
        const orgUserUpdates: Record<string, unknown> = {};

        if (updates.head_authorized_official_name !== undefined) userUpdates.name = updates.head_authorized_official_name;
        if (updates.head_authorized_official_title !== undefined) orgUserUpdates.title = updates.head_authorized_official_title;
        if (updates.head_authorized_official_phone !== undefined) orgUserUpdates.phoneNumber = updates.head_authorized_official_phone;

        if (Object.keys(userUpdates).length > 0) await user.update(userUpdates, { transaction });
        if (Object.keys(orgUserUpdates).length > 0) await organizationUser.update(orgUserUpdates, { transaction });

        await OrganizationUserService.syncForm1HeadAuthorizedOfficialFromUserProfile(
            userId,
            {
                ...(updates.head_authorized_official_name !== undefined
                    ? { name: updates.head_authorized_official_name }
                    : {}),
                ...(updates.head_authorized_official_title !== undefined
                    ? { title: updates.head_authorized_official_title }
                    : {}),
                ...(updates.head_authorized_official_phone !== undefined
                    ? { phoneNumber: updates.head_authorized_official_phone }
                    : {}),
            },
            transaction,
            organizationId,
        );
    }

    static async primaryContactInfoChange(
        doneeAccountId: number,
        organizationId: string,
        userId: string,
        updates: {
            primary_contact_full_name?: string;
            primary_contact_title?: string;
            primary_contact_phone?: string;
        },
        transaction?: Transaction
    ): Promise<void> {
        const donee = await DoneeAccount.findByPk(doneeAccountId, { transaction });
        if (!donee || donee.organizationId !== organizationId) {
            throw new AppError(400, 'Donee account does not belong to this organization');
        }

        const scope = await UserScope.findOne({
            where: { donee_account_id: doneeAccountId, user_id: userId, is_primary_contact: true },
            transaction,
        });
        if (!scope) {
            throw new AppError(404, 'Primary contact scope not found for this user and donee account');
        }

        const organizationUser = await OrganizationUserService.getRecordByOrganizationAndUser(organizationId, userId, transaction);
        if (!organizationUser) throw new AppError(400, 'User is not a member of the organization');

        const user = await User.findByPk(userId, { transaction });
        if (!user) throw new AppError(404, 'User not found');

        const userUpdates: Record<string, unknown> = {};
        const orgUserUpdates: Record<string, unknown> = {};

        if (updates.primary_contact_full_name !== undefined) userUpdates.name = updates.primary_contact_full_name;
        if (updates.primary_contact_title !== undefined) orgUserUpdates.title = updates.primary_contact_title;
        if (updates.primary_contact_phone !== undefined) orgUserUpdates.phoneNumber = updates.primary_contact_phone;

        if (Object.keys(userUpdates).length > 0) await user.update(userUpdates, { transaction });
        if (Object.keys(orgUserUpdates).length > 0) await organizationUser.update(orgUserUpdates, { transaction });

        await OrganizationUserService.syncForm1PrimaryContactFromUserProfile(
            userId,
            organizationId,
            {
                ...(updates.primary_contact_full_name !== undefined
                    ? { name: updates.primary_contact_full_name }
                    : {}),
                ...(updates.primary_contact_title !== undefined
                    ? { title: updates.primary_contact_title }
                    : {}),
                ...(updates.primary_contact_phone !== undefined
                    ? { phoneNumber: updates.primary_contact_phone }
                    : {}),
            },
            transaction,
        );
    }

    static async isDoneeAccountNameUnique(name: string): Promise<boolean> {
        const doneeAccount = await DoneeAccount.findOne({
            where: { name }
        });
        return !doneeAccount;
    }
}