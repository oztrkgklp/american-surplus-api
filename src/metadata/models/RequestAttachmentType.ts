import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

// Define the attributes for RequestAttachmentType
interface RequestAttachmentTypeAttributes {
    id: number;
    name: string | null;
}

// Define the attributes required for creation (omit `id` since it is a primary key and likely not auto-generated)
interface RequestAttachmentTypeCreationAttributes extends Optional<RequestAttachmentTypeAttributes, 'name'> { }

// Define the Sequelize model
class RequestAttachmentType
    extends Model<RequestAttachmentTypeAttributes, RequestAttachmentTypeCreationAttributes>
    implements RequestAttachmentTypeAttributes {
    public id!: number;
    public name!: string | null;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

// Initialize the model
RequestAttachmentType.init(
    {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize, // Sequelize instance
        tableName: 'request_attachment_types', // Table name in the database
        timestamps: false, // Disable timestamps as there are no `createdAt` or `updatedAt` columns
    }
);

export default RequestAttachmentType;
