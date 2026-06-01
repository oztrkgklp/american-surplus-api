import { Transaction } from 'sequelize';
import Organization, { OrganizationCreationAttributes } from '@/organization/models/Organization';
import { AppError } from '@/utils/response/appError';
import OrganizationUser from '@/organization/models/OrganizationUser';
import Application from '@/eligibility/models/Application.entity';
import Sba8aCertification from '@/organization/models/Sba8aCertification.entity';
import ApplicationAttachment from '@/eligibility/models/ApplicationAttachment.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import OrganizationInvitation from '../models/OrganizationInvitation.entity';
import User from '@/authn/models/User';
import Role from '@/authz/models/Role';
import { PredefinedRoles } from '@/enums/predefinedRoles.enum';
import { OrganizationInvitationStatuses } from '@/enums/organizationInvitation.enum';
import { OrganizationUserService } from './organizationUser';
import { DoneeAccountService } from './donee';
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import { paginateSequelize } from '@/utils/pagination';
import { PaginatedResponse } from '@/utils/pagination/interfaces';
import { InvitationFilterKeys } from '@/enums/invitationFilterKeys.enum';
import { getSequelizeCondition, getSequelizeDateCondition, shouldApplyFilter, } from '@/utils/filteringOperations';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import { getLogger } from '@/utils/logger';
import DoneeAccount from '@/organization/models/DoneeAccount';
import Mapping3040 from '@/reports/models/Mapping3040.entity';
import { EligibilityCategoryMapper } from '@/reports/services/eligibility-category.mapper';
import { OrganizationType, OrganizationSubType, PublicPurpose, PrimaryActivity, } from '@/enums/organizationCategories';
import { OrganizationAddressService, OrganizationAddressUpsertInput } from '@/organization/services/organizationAddress.service';
import { OrganizationAddressType } from '@/enums/organizationAddressType.enum';
const logger = getLogger('OrganizationService');

export type OrganizationCreateWithMailingPayload = OrganizationCreationAttributes & {
    mailing_address_line1: string;
    mailing_address_line2?: string | null;
    mailing_city: string;
    mailing_state: string;
    mailing_zip: string;
};

export class OrganizationService {
    /**
     * Creates a new organization.
     * @param data                All organization fields (snake_case).
     * @param transaction?        Optional Sequelize transaction.
     * @returns The created Organization instance.
     */
    static async create(
        organization: OrganizationCreateWithMailingPayload,
        transaction?: Transaction
    ): Promise<Organization> {
        const {
            name,
            organization_type,
            organization_sub_type,
            public_purpose,
            tin,
            mailing_address_line1,
            mailing_address_line2,
            mailing_city,
            mailing_state,
            mailing_zip,
        } = organization;

        if (
            !name ||
            !organization_type ||
            !organization_sub_type ||
            !public_purpose ||
            !tin ||
            !mailing_address_line1 ||
            !mailing_city ||
            !mailing_state ||
            !mailing_zip
        ) {
            const missingFields = [
                !name && 'name',
                !organization_type && 'organization_type',
                !organization_sub_type && 'organization_sub_type',
                !public_purpose && 'public_purpose',
                !tin && 'tin',
                !mailing_address_line1 && 'mailing_address_line1',
                !mailing_city && 'mailing_city',
                !mailing_state && 'mailing_state',
                !mailing_zip && 'mailing_zip',
            ].filter(Boolean);

            logger.warn('Missing required organization fields', {
                missingFields,
                organizationObject: organization,
            });

            throw new AppError(400, 'Missing required organization fields');
        }

        const tinExists = await this.isTINExist(tin, transaction);
        if (tinExists) {
            throw new AppError(400, 'This EIN already exists, please enter a different EIN');
        }

        const { mailing_address_line1: _m1, mailing_address_line2: _m2, mailing_city: _mc, mailing_state: _ms, mailing_zip: _mz, ...orgRow } =
            organization;
        const newOrganization = await Organization.create(orgRow, { transaction });

        await OrganizationAddressService.upsertMany(
            newOrganization.id,
            [
                {
                    address_type: OrganizationAddressType.HEADQUARTERS,
                    address_line1: mailing_address_line1,
                    address_line2: mailing_address_line2 ?? null,
                    city: mailing_city,
                    state: mailing_state,
                    postal_code: mailing_zip,
                },
                {
                    address_type: OrganizationAddressType.MAILING,
                    address_line1: mailing_address_line1,
                    address_line2: mailing_address_line2 ?? null,
                    city: mailing_city,
                    state: mailing_state,
                    postal_code: mailing_zip,
                },
                {
                    address_type: OrganizationAddressType.OFFICE_LOCATION,
                    address_line1: mailing_address_line1,
                    address_line2: mailing_address_line2 ?? null,
                    city: mailing_city,
                    state: mailing_state,
                    postal_code: mailing_zip,
                },
            ],
            transaction
        );

        await this.syncOrganization3040Mappings(newOrganization, transaction);

        return newOrganization;
    }

    /**
     * Updates organization information.
     * @param organizationId - The ID of the organization to update.
     * @param updates - The fields to update.
     * @param transaction? - Optional Sequelize transaction.
     * @returns The updated Organization instance.
     */
    static async updateOrganizationInfo(
        organizationId: string,
        updates: Partial<OrganizationCreationAttributes> & {
            head_authorized_official_email?: string;
            addresses?: OrganizationAddressUpsertInput[];
        },
        changeUserEmail: boolean,
        transaction?: Transaction
    ): Promise<Organization> {
        const organization = await Organization.findByPk(organizationId, { transaction });
        if (!organization) throw new AppError(404, 'Organization not found');

        if (updates.addresses && updates.addresses.length > 0) {
            await OrganizationAddressService.upsertMany(organizationId, updates.addresses, transaction);
        }

        const { addresses: _addresses, ...updatesForForms } = updates;

        await EligibilityService.updateOrganizationInfoOfApplications(organizationId, updatesForForms, changeUserEmail, transaction);
        const orgUpdateFields = Object.fromEntries(
            Object.entries(updatesForForms).filter(([_, value]) => {
                if (value === undefined || value === null) return false;
                if (typeof value === 'string' && value.trim() === '') return false;
                return true;
            })
        ) as Partial<OrganizationCreationAttributes>;
        if (Object.keys(orgUpdateFields).length > 0) {
            await organization.update(orgUpdateFields, { transaction });
            await this.syncOrganization3040Mappings(organization, transaction);
        }

        return organization;
    }

    /**
     * Recompute 3040 eligibility category mappings for an organization.
     * Call after form 3 (Capacity / Oversight / Program Funding) is saved so
     * `olderAmericansAct` in form_data drives {@link EligibilityCategoryMapper.toExternal}.
     */
    static async sync3040MappingsForOrganization(organizationId: string, transaction?: Transaction): Promise<void> {
        const organization = await Organization.findByPk(organizationId, { transaction });
        if (!organization) return;
        await this.syncOrganization3040Mappings(organization, transaction);
    }

    private static async syncOrganization3040Mappings(organization: Organization, transaction?: Transaction): Promise<void> {
        if (!organization.organization_type || !organization.organization_sub_type || !organization.public_purpose) {
            return;
        }

        const olderAmericansActSelected = await EligibilityService.getOlderAmericansActSelected(organization.id, transaction);
        const externalSelection = EligibilityCategoryMapper.toExternal(
            {
                organizationType: organization.organization_type as OrganizationType,
                organizationSubType: organization.organization_sub_type as OrganizationSubType,
                publicPurpose: organization.public_purpose as PublicPurpose,
                primaryActivity: organization.primary_activity as PrimaryActivity | undefined,
            },
            olderAmericansActSelected
        );

        if (!externalSelection?.subCategory) return;

        const doneeAccounts = await DoneeAccount.findAll({ where: { organizationId: organization.id }, transaction, });

        for (const doneeAccount of doneeAccounts) {
            const existingMapping = await Mapping3040.findOne({
                where: {
                    donee_account_id: doneeAccount.id,
                    organization_id: organization.id,
                    state_id: doneeAccount.stateId,
                },
                transaction,
            });

            const payload = {
                donee_account_id: doneeAccount.id,
                organization_id: organization.id,
                state_id: doneeAccount.stateId,
                category: externalSelection.subCategory,
                section: externalSelection.primaryCategory,
            };

            if (existingMapping) {
                await existingMapping.update(payload, { transaction });
            } else {
                await Mapping3040.create(payload, { transaction });
            }
        }
    }

    /**
     * Checks if an organization exists.
     * @param organizationId - The organization ID to check.
     * @returns True if the organization exists, false otherwise.
     */
    static async organizationExists(organizationId: string): Promise<boolean> {
        const organization = await Organization.findByPk(organizationId);
        return !!organization;
    }


    /**
     * Fetch all applications belonging to an organization,
     * including their forms and each form’s attachments.
     */
    static async listApplications(organizationId: string): Promise<Application[]> {
        try {
            return await Application.findAll({
                where: { organization_id: organizationId },
                order: [['createdAt', 'DESC']],
                include: [
                    {
                        model: ApplicationForm,
                        as: 'applicationForms',
                        attributes: [
                            'id',
                            'form_id',
                            'status',
                            'submitted_date',
                            'approved_date',
                            'rejected_date',
                            'updatedAt',
                            'createdAt',
                        ],
                        include: [
                            {
                                model: ApplicationAttachment,
                                as: 'attachments',
                                attributes: ['id', 'path', 'metadata', 'createdAt'],
                            },
                        ],
                    },
                    { model: User, as: 'createdBy', attributes: ['id', 'name', 'email'] },
                    { model: Sba8aCertification, as: 'sba8aCertification' },
                ],
            });
        } catch (error) {
            throw new AppError(500, 'Failed to fetch applications');
        }
    }


    /**
     * Invites a user to an organization by creating an OrganizationUser record.
     * @param organizationId - The ID of the organization.
     * @param invitedUserId - The ID of the user being invited.
     * @param invitedBy - The ID of the user sending the invitation.
     * @param role - The role assigned to the invited user.
     * @param donee_account_ids - Optional array of donee account IDs to auto-assign on acceptance.
     * @returns The created OrganizationInvitation instance.
     */
    static async inviteUser(organizationId: string, invitedUserId: string, invitedBy: string, role: string, donee_account_ids?: number[]): Promise<OrganizationInvitation> {
        // Check if the organization exists
        const organization = await Organization.findByPk(organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const user = await User.findByPk(invitedUserId);
        if (!user) throw new AppError(400, 'User not found');

        // Check if the user is already a member of the organization
        const existingMembership = await OrganizationUserService.getRecordByOrganizationAndUser(organizationId, invitedUserId)
        if (existingMembership) throw new AppError(400, 'User is already a member of the organization');

        // check if invite is already sent
        const existingInvitation = await OrganizationInvitation.findOne({ where: { organization_id: organizationId, invited_user_id: invitedUserId, status: OrganizationInvitationStatuses.PENDING } });
        if (existingInvitation) throw new AppError(400, 'User is already invited');


        //check if role is exist
        const predefinedRoleName = PredefinedRoles[role as keyof typeof PredefinedRoles];
        if (!predefinedRoleName) throw new AppError(400, 'Invalid role');

        const predifinedRole = await Role.findOne({ where: { role_name: predefinedRoleName } });
        if (!predifinedRole) throw new AppError(400, 'Role does not exist');

        const invitation = await OrganizationInvitation.create({
            organization_id: organizationId,
            invited_user_id: invitedUserId,
            invited_by: invitedBy,
            role_id: predifinedRole.role_id,
            status: OrganizationInvitationStatuses.PENDING,
            donee_account_ids: donee_account_ids || null
        });

        const renderData = {
            templateName: TemplateEnum.Organization_Invitition,
            data: { name: user.name, organizationName: organization.name, roleName: predifinedRole.role_name },
        };

        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: user.email as string,
            subject: `Invitation to join ${organization.name} on American Surplus`,
            html: mailContent as string,
        };
        await emailQueue.add('organizationInvitationNotification', mailData, { removeOnComplete: true, attempts: 3, });

        return invitation;
    }

    /**
     * Cancels a pending invitation for a user to join an organization.
     * @param organizationId - The ID of the organization.
     * @param invitedUserId - The ID of the invited user.
     * @returns The updated OrganizationInvitation instance.
     */
    static async cancelInvitation(organizationId: string, invitedUserId: string): Promise<OrganizationInvitation> {
        // Check if the organization exists
        const organization = await Organization.findByPk(organizationId);
        if (!organization) throw new AppError(404, 'Organization not found');

        const invitation = await OrganizationInvitation.findOne({
            where: {
                organization_id: organizationId,
                invited_user_id: invitedUserId,
                status: OrganizationInvitationStatuses.PENDING,
            },
        });

        if (!invitation) throw new AppError(404, 'No pending invitation found to cancel');

        return invitation.update({ status: OrganizationInvitationStatuses.CANCELED });
    }

    /**
     * Resends an invitation email to a user for joining an organization.
     * @param organizationId - The ID of the organization.
     * @param invitedUserId - The ID of the invited user.
     * @param invitedBy - The ID of the user resending the invitation.
     * @returns The updated OrganizationInvitation instance.
     */
    static async resendInvitation(organizationId: string, invitedUserId: string): Promise<OrganizationInvitation> {
        const invitation = await OrganizationInvitation.findOne({
            where: {
                organization_id: organizationId,
                invited_user_id: invitedUserId,
                status: OrganizationInvitationStatuses.PENDING,
            },
            include: [
                { model: User, as: 'invitationReceiver' },
                { model: Organization, as: 'organization' },
                { model: Role, as: 'role' },
            ],
        });

        if (!invitation) throw new AppError(404, 'No pending invitation found to resend');

        const user = invitation.invitationReceiver || await User.findByPk(invitedUserId);
        const organization = invitation.organization || await Organization.findByPk(organizationId);
        const role = await Role.findByPk(invitation.role_id);

        if (!user || !organization || !role) throw new AppError(400, 'Invalid invitation');


        const renderData = {
            templateName: TemplateEnum.Organization_Invitition,
            data: { name: user.name, organizationName: organization.name, roleName: role.role_name },
        };

        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: user.email as string,
            subject: `Invitation to join ${organization.name} on American Surplus`,
            html: mailContent as string,
        };

        await emailQueue.add('organizationInvitationNotification', mailData, { removeOnComplete: true, attempts: 3 });
        return invitation;
    }


    /**
     * Accepts a pending invitation:
     *  - marks the invitation ACCEPTED
     *  - creates an OrganizationUser record
     *  - assigns the role setted for user within the organization
     *  - automatically assigns donee accounts if specified in the invitation
   */
    static async respondInvitation(isAccepted: boolean, organizationId: string, invitedUserId: string, transaction?: Transaction): Promise<{ organizationUser?: OrganizationUser }> {
        const invitation = await OrganizationInvitation.findOne({
            where: { organization_id: organizationId, invited_user_id: invitedUserId, status: OrganizationInvitationStatuses.PENDING }
        });

        if (!invitation) throw new AppError(404, 'No pending invitation found for this user');
        await invitation.update({ status: isAccepted ? OrganizationInvitationStatuses.ACCEPTED : OrganizationInvitationStatuses.REJECTED, responded_at: new Date(), }, { transaction });

        if (isAccepted) {
            const organizationUser = await OrganizationUserService.addUser(organizationId, invitedUserId, false, transaction);
            await OrganizationUserService.assignRoleToOrganizationUser({ organizationUserId: organizationUser.id, userId: invitedUserId, role_id: invitation.role_id }, transaction);

            const donee_account_ids = invitation.donee_account_ids && Array.isArray(invitation.donee_account_ids) ? invitation.donee_account_ids : undefined;

            if (donee_account_ids && donee_account_ids.length > 0) {
                await Promise.all(
                    donee_account_ids.map(async (doneeAccountId) => {
                        await DoneeAccountService.assignRolesToDoneeAccount(doneeAccountId, [{ userId: invitedUserId, isPrimaryContact: false }], transaction);
                    })
                );
            }
            return { organizationUser };
        }
        return {};
    }

    /**
     * Retrieves all invitations for a given organization.
     * @param organizationId - The ID of the organization.
     * @returns A list of OrganizationInvitation instances.
     */
    static async getOrganizationInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
        return await OrganizationInvitation.findAll({
            where: { organization_id: organizationId },
            include: [
                {
                    model: User,
                    as: 'invitationReceiver',
                    attributes: ['id', 'name', 'email'],
                },
                {
                    model: User,
                    as: 'invitationSender',
                    attributes: ['id', 'name', 'email'],
                },
                {
                    model: Role,
                    as: 'role',
                    attributes: ['role_id', 'role_name'],
                },
            ],
            order: [['createdAt', 'DESC']],
        });
    }

    /**
     * Retrieves paginated invitations for a given organization with optional filter and sort.
     */
    static async getOrganizationInvitationsPaginated(
        organizationId: string,
        page: number,
        limit: number,
        filterKey?: InvitationFilterKeys,
        operator: string = 'contains',
        filterValue?: string,
        sortBy?: string,
        sortOrder?: string
    ): Promise<PaginatedResponse<OrganizationInvitation>> {
        const whereClause: Record<string, unknown> = { organization_id: organizationId };

        if (filterKey && shouldApplyFilter(operator, filterValue)) {
            const defaultCondition = getSequelizeCondition(operator, filterValue ?? '');
            switch (filterKey) {
                case InvitationFilterKeys.NAME:
                    whereClause['$invitationReceiver.name$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.EMAIL:
                    whereClause['$invitationReceiver.email$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.ROLE:
                    whereClause['$role.role_name$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.STATUS:
                    whereClause.status = defaultCondition;
                    break;
                case InvitationFilterKeys.INVITED_BY:
                    whereClause['$invitationSender.name$'] = defaultCondition;
                    break;
                case InvitationFilterKeys.CREATED_AT:
                    whereClause.createdAt = getSequelizeDateCondition(operator, filterValue ?? '');
                    break;
            }
        }

        const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
        let order: import('sequelize').Order;
        if (sortBy === 'name' || sortBy === 'email') {
            order = [[{ model: User, as: 'invitationReceiver' }, sortBy, orderDir]];
        } else if (sortBy === 'role') {
            order = [[{ model: Role, as: 'role' }, 'role_name', orderDir]];
        } else if (sortBy === 'status') {
            order = [['status', orderDir]];
        } else if (sortBy === 'invitedBy') {
            order = [[{ model: User, as: 'invitationSender' }, 'name', orderDir]];
        } else {
            order = [['createdAt', orderDir]];
        }

        return await paginateSequelize<OrganizationInvitation>(OrganizationInvitation, page, limit, {
            where: whereClause,
            include: [
                { model: User, as: 'invitationReceiver', attributes: ['id', 'name', 'email'], required: true },
                { model: User, as: 'invitationSender', attributes: ['id', 'name', 'email'], required: false },
                { model: Role, as: 'role', attributes: ['role_id', 'role_name'], required: false },
            ],
            order,
        });
    }

    /**
     * Retrieves all organization invitations for a given user.
     * @param userId - The ID of the user.
     * @returns A list of OrganizationInvitation instances.
     */
    static async getMyInvitations(userId: string): Promise<OrganizationInvitation[]> {
        return await OrganizationInvitation.findAll({
            where: { invited_user_id: userId },
            include: [
                {
                    model: Organization,
                    as: 'organization',
                },
                {
                    model: User,
                    as: 'invitationSender',
                    attributes: ['id', 'name', 'email'],
                },
                {
                    model: User,
                    as: 'invitationReceiver',
                    attributes: ['id', 'name', 'email'],
                },
                {
                    model: Role,
                    as: 'role',
                    attributes: ['role_id', 'role_name'],
                },
            ],
            order: [['createdAt', 'DESC']],
        });
    }

    static async isTINExist(tin: string, transaction?: Transaction): Promise<boolean> {
        const organization = await Organization.findOne({ where: { tin }, transaction });
        return !!organization;
    }

}



