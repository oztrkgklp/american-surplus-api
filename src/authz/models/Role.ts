import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import RolePermission from './RolePermission';

// Define the attributes of the Role model
interface RoleAttributes {
    role_id: number; // Primary key
    role_name: string; // Name of the role
}

// Define the attributes required for creation (omit `roleId` since it auto-increments)
interface RoleCreationAttributes extends Optional<RoleAttributes, 'role_id'> { }

// Define the Sequelize Role model
class Role extends Model<RoleAttributes, RoleCreationAttributes> implements RoleAttributes {
    public role_id!: number;
    public role_name!: string;
    
    //associations
    public rolePermissions?: RolePermission[];

    // Timestamps managed by Sequelize
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Role.init(
    {
        role_id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        role_name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize, // Connect to the Sequelize instance
        tableName: 'roles', // Table name in the database
        timestamps: true, // Enable createdAt and updatedAt
    }
);

export default Role; 
