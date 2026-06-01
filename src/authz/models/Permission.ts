import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

// Define the attributes of the Permission model
interface PermissionAttributes {
    id: number; // Primary key
    name: string; // Permission name
    identifier: string; // Unique identifier for the permission
    description?: string | null; // Optional description
}

// Define the attributes required for creation (omit `id` since it auto-increments)
interface PermissionCreationAttributes extends Optional<PermissionAttributes, 'id' | 'description'> { }

// Define the Sequelize Permission model
class Permission extends Model<PermissionAttributes, PermissionCreationAttributes> implements PermissionAttributes {
    public id!: number;
    public name!: string;
    public identifier!: string;
    public description!: string | null;

    // Timestamps managed by Sequelize
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Permission.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        identifier: {
            type: DataTypes.STRING(45),
            allowNull: false,
            unique: true,
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize, // Connect to the Sequelize instance
        tableName: 'permissions', // Table name in the database
        timestamps: false, 
    }
);

export default Permission;
