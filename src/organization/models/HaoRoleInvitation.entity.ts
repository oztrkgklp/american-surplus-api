import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Organization from './Organization';
import DoneeAccount from './DoneeAccount';
import Application from '@/eligibility/models/Application.entity';
import User from '@/authn/models/User';

export interface HaoRoleInvitationAttributes {
    id: string;
    token_hash: string;
    organization_id: string;
    donee_account_id: number;
    application_id: number | null;
    application_previous_status: string | null;
    email: string;
    name: string;
    title: string | null;
    phone: string | null;
    invited_by_user_id: string;
    status: string;
    expires_at: number;
    completed_at: number | null;
    new_user_id: string | null;
    invited_user_id: string | null;
}

export interface HaoRoleInvitationCreationAttributes
    extends Optional<
        HaoRoleInvitationAttributes,
        'id' | 'application_id' | 'application_previous_status' | 'title' | 'phone' | 'completed_at' | 'new_user_id' | 'invited_user_id'
    > {}

class HaoRoleInvitation
    extends Model<HaoRoleInvitationAttributes, HaoRoleInvitationCreationAttributes>
    implements HaoRoleInvitationAttributes
{
    public id!: string;
    public token_hash!: string;
    public organization_id!: string;
    public donee_account_id!: number;
    public application_id!: number | null;
    public application_previous_status!: string | null;
    public email!: string;
    public name!: string;
    public title!: string | null;
    public phone!: string | null;
    public invited_by_user_id!: string;
    public status!: string;
    public expires_at!: number;
    public completed_at!: number | null;
    public new_user_id!: string | null;
    public invited_user_id!: string | null;

    public readonly organization?: Organization;
    public readonly invitedUser?: User;
    public readonly doneeAccount?: DoneeAccount;
    public readonly application?: Application;
    public readonly invitedBy?: User;
    public readonly newUser?: User;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

HaoRoleInvitation.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        token_hash: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        donee_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        application_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        application_previous_status: {
            type: DataTypes.STRING(64),
            allowNull: true,
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        phone: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        invited_by_user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: 'pending',
        },
        expires_at: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        completed_at: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        new_user_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        invited_user_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'hao_role_invitations',
        timestamps: true,
    },
);

export default HaoRoleInvitation;
