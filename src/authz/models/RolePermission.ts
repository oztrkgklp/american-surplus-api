import { DataTypes, Model } from 'sequelize';
import { database } from '@/utils/database';
import Permission from './Permission';

interface RolePermissionAttributes {
    role_id: number;
    permission_id: number;
}

class RolePermission extends Model<RolePermissionAttributes> implements RolePermissionAttributes {
    public role_id!: number;
    public permission_id!: number;

    // Associations
    public Permission?: Permission;
}

RolePermission.init(
    {
        role_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        permission_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'role_permissions',
        timestamps: false,
    }
);

export default RolePermission;
