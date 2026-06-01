import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

// Define the attributes for SupplyCondition
interface SupplyConditionAttributes {
    id: number;
    code: string;
    name: string | null;
}

// Define the attributes required for creation (omit `id` since it is auto-incremented)
interface SupplyConditionCreationAttributes extends Optional<SupplyConditionAttributes, 'id' | 'name'> { }

// Define the Sequelize model
class SupplyCondition
    extends Model<SupplyConditionAttributes, SupplyConditionCreationAttributes>
    implements SupplyConditionAttributes {
    public id!: number;
    public code!: string;
    public name!: string | null;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

// Initialize the model
SupplyCondition.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        code: {
            type: DataTypes.STRING(45),
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize, // Sequelize instance
        tableName: 'supply_conditions', // Table name in the database
        timestamps: false, // Disable timestamps as there are no `createdAt` or `updatedAt` columns
    }
);

export default SupplyCondition;
