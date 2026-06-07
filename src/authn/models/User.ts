import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Scope from '@/authz/models/Scope';
import UserScope from '@/authz/models/UserScope';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import OrganizationUser from '@/organization/models/OrganizationUser';

interface UserAttributes {
    id: string;
    email: string;
    password: string;
    name: string;
    avatar_url?: string | null;
    typeId: number;
    isActive: boolean;
    mfaEnabled: boolean;
    mfaSecret?: string | null;
    mfaBackupCodes?: string[] | null;
    mfaLastVerified?: Date | null;
    is_email_verified: boolean;
    email_verification_token?: string | null;
    email_verification_expiry_date?: number | null;
    notification_token?: string | null;
    verification_code?: string | null;
    verification_code_expiry?: Date | null;
}

interface UserCreationAttributes
    extends Optional<UserAttributes,
        'id'
        | 'name'
        | 'isActive'
        | 'email_verification_token'
        | 'email_verification_expiry_date'
        | 'notification_token'
        | 'mfaSecret'
        | 'mfaBackupCodes'
        | 'mfaLastVerified'
        | 'verification_code'
        | 'verification_code_expiry'
    > { }


class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
    public id!: string;
    public email!: string;
    public password!: string;
    public name!: string;
    public avatar_url?: string | null;
    public typeId!: number;
    public isActive!: boolean;
    public mfaEnabled!: boolean;
    public mfaSecret?: string | null;
    public mfaBackupCodes?: string[] | null;
    public mfaLastVerified?: Date | null;
    public is_email_verified!: boolean;
    public email_verification_token?: string | null;
    public email_verification_expiry_date?: number | null;
    public notification_token?: string | null;
    public verification_code?: string | null;
    public verification_code_expiry?: Date | null;

    //association
    public userScopes?: UserScope[];
    public saspUser?: SaspUser;
    public scopes?: Scope[];
    public organizationLinks?: OrganizationUser[];

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

User.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING,
        },
        avatar_url: {
            type: DataTypes.STRING(512),
            allowNull: true,
        },
        typeId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        mfaEnabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            field: 'mfa_enabled'
        },
        mfaSecret: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'mfa_secret'
        },
        mfaBackupCodes: {
            type: DataTypes.JSON,
            allowNull: true,
            field: 'mfa_backup_codes'
        },
        mfaLastVerified: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'mfa_last_verified'
        },
        is_email_verified: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        email_verification_token: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        email_verification_expiry_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        notification_token: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        verification_code: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        verification_code_expiry: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'users',
        timestamps: true,
    }
);

export default User;