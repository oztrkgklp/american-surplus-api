import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Organization from './Organization';
import UserScope from '@/authz/models/UserScope';

interface OrganizationUserAttributes {
    id: number;
    userId: string;
    organizationId: string;
    owner: boolean;
    is_active: boolean;
    title?: string | null;
    phoneNumber?: string | null;
    deactivatedAt?: Date | null;
}

interface OrganizationUserCreationAttributes extends Optional<OrganizationUserAttributes, 'id' | 'title' | 'phoneNumber' | 'deactivatedAt'> { }

class OrganizationUser extends Model<OrganizationUserAttributes, OrganizationUserCreationAttributes> {
    public id!: number;
    public userId!: string;
    public organizationId!: string;
    public owner!: boolean;
    public is_active!: boolean;
    public title?: string | null;
    public phoneNumber?: string | null;
    public deactivatedAt?: Date | null;

    // Add this association reference
    public readonly organization?: Organization;
    public readonly userScope?: UserScope;
    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

OrganizationUser.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        organizationId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        owner: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        phoneNumber: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        deactivatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'organization_users',
        timestamps: true,
    }
);

export default OrganizationUser;
