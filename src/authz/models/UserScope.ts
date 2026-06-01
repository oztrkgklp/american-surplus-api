import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Role from './Role';
import Scope from './Scope';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import OrganizationUser from '@/organization/models/OrganizationUser';
import DoneeAccount from '@/organization/models/DoneeAccount';
import User from '@/authn/models/User';

interface UserScopeAttributes {
    id: number;
    user_id: string;
    scope_id: number;
    role_id: number;
    organization_user_id?: number;
    sasp_user_id?: number;
    donee_account_id?: number;
    is_primary_contact?: boolean | null;
    is_head_representative?: boolean | null;
}

export type UserScopeCreationAttributes = Optional<UserScopeAttributes, 'id' | 'organization_user_id' | 'sasp_user_id' | 'donee_account_id' | 'is_primary_contact' | 'is_head_representative'>;

class UserScope extends Model<UserScopeAttributes, UserScopeCreationAttributes> implements UserScopeAttributes {
    public id!: number;
    public user_id!: string;
    public scope_id!: number;
    public role_id!: number;
    public organization_user_id?: number;
    public sasp_user_id?: number;
    public donee_account_id?: number;
    public is_primary_contact?: boolean | null;
    public is_head_representative?: boolean | null;

    // Associations
    public role?: Role;
    public scope?: Scope;
    public saspUser?: SaspUser;
    public organizationUser?: OrganizationUser;
    public doneeAccount?: DoneeAccount;
    public user?: User;
}

UserScope.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.UUID,
            primaryKey: false,
        },
        scope_id: {
            type: DataTypes.INTEGER,
            primaryKey: false,
        },
        role_id: {
            type: DataTypes.INTEGER,
            primaryKey: false,
        },
        organization_user_id: {
            type: DataTypes.INTEGER,
            primaryKey: false,
        },
        sasp_user_id: {
            type: DataTypes.INTEGER,
            primaryKey: false,
        },
        donee_account_id: {
            type: DataTypes.INTEGER,
            primaryKey: false,
        },
        is_primary_contact: {
            type: DataTypes.BOOLEAN,
            primaryKey: false,
        },
        is_head_representative: {
            type: DataTypes.BOOLEAN,
            primaryKey: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'user_scopes',
        timestamps: false,
    }
);

export default UserScope;
