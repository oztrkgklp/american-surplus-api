import User from '@/authn/models/User';
import { database } from '@/utils/database';
import { Model, DataTypes, Optional } from 'sequelize';
import Organization from './Organization';

interface OrganizationInvitationAttributes {
    id: string;
    organization_id: string;
    invited_user_id: string;
    invited_by: string;
    role_id: number;
    status: string;
    responded_at?: Date | null;
    donee_account_ids?: number[] | null;
}

interface OrgInvitationCreationAttrs extends Optional<OrganizationInvitationAttributes, 'id' | 'responded_at' | 'donee_account_ids'> { }

export class OrganizationInvitation extends Model<OrganizationInvitationAttributes, OrgInvitationCreationAttrs> implements OrganizationInvitationAttributes {
    public id!: string;
    public organization_id!: string;
    public invited_user_id!: string;
    public invited_by!: string;
    public role_id!: number;
    public status!: string;
    public responded_at?: Date | null;
    public donee_account_ids?: number[] | null;

    //associations
    public invitationReceiver?: User
    public invitationSender?: User
    public organization?: Organization


    // timestamps!
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

OrganizationInvitation.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        organization_id: {
            type: DataTypes.UUID, 
            allowNull: false,
        },
        invited_user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        invited_by: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        role_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'PENDING',
        },
        responded_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        donee_account_ids: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'organization_invitations',
        timestamps: true,
        underscored: true,   // use snake_case column names
    }
);

export default OrganizationInvitation;