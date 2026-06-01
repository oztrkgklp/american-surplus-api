import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

// Define the attributes for PropertyType
interface PropertyTypeAttributes {
    id: number;
    code: string;
    name: string | null;
}

// Define the attributes required for creation (omit `id` since it auto-increments)
interface PropertyTypeCreationAttributes extends Optional<PropertyTypeAttributes, 'id' | 'name'> { }

// Define the Sequelize model
class PropertyType
    extends Model<PropertyTypeAttributes, PropertyTypeCreationAttributes>
    implements PropertyTypeAttributes {
    public id!: number;
    public code!: string;
    public name!: string | null;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

// Initialize the model
PropertyType.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        code: {
            type: DataTypes.STRING(45),
            allowNull: false,
            unique: true, // Ensure the code is unique
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize, // Sequelize instance
        tableName: 'property_types', // Table name in the database
        timestamps: false, // Disable timestamps if not needed
    }
);

export default PropertyType;
