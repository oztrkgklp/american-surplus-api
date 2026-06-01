import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

// Define the attributes for DemilCondition
interface DemilConditionAttributes {
    id: number;
    code: string;
    name: string | null;
}

// Define the attributes required for creation (omit `id` since it auto-increments)
interface DemilConditionCreationAttributes extends Optional<DemilConditionAttributes, 'id' | 'name'> { }

// Define the Sequelize model
class DemilCondition
    extends Model<DemilConditionAttributes, DemilConditionCreationAttributes>
    implements DemilConditionAttributes {
    public id!: number;
    public code!: string;
    public name!: string | null;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

// Initialize the model
DemilCondition.init(
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
        tableName: 'demil_conditions', // Table name in the database
        timestamps: false, // Disable timestamps if not needed
    }
);

export default DemilCondition;
