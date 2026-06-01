import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

// Define the attributes for RequestStatus
interface RequestStatusAttributes {
    id: number;
    name: string | null;
    color: string | null;
}

// Define the attributes required for creation (omit `id` since it is auto-incremented)
interface RequestStatusCreationAttributes extends Optional<RequestStatusAttributes, 'id'> { }

// Define the Sequelize model
class RequestStatus
    extends Model<RequestStatusAttributes, RequestStatusCreationAttributes>
    implements RequestStatusAttributes {
    public id!: number;
    public name!: string | null;
    public color!: string | null;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

// Initialize the model
RequestStatus.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
        color: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize, // Sequelize instance
        tableName: 'request_statuses', // Table name in the database
        timestamps: false, // Disable timestamps as there are no `createdAt` or `updatedAt` columns
    }
);

export default RequestStatus;
