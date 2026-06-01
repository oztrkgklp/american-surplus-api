import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface RequestAttachmentAttributes {
  id: number;
  name: string;
  request_id: number;
  attachment_type: number;
  file_path: string;
  property_control_number?: string | null;
  created_by: string;
  updated_by?: string | null;
  // Virtual fields for associations
  invoice?: any;
  logisticsPacket?: any;
  createdAt?: Date;
}

interface RequestAttachmentCreationAttributes
    extends Optional<RequestAttachmentAttributes, 'id'> { }

class RequestAttachment
    extends Model<RequestAttachmentAttributes, RequestAttachmentCreationAttributes> {
    public id!: number;
    public name!: string;
    public request_id!: number;
    public attachment_type!: number;
    public file_path!: string;
    public property_control_number?: string | null;
    public created_by!: string;
    public updated_by?: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

RequestAttachment.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(45),
            allowNull: false,
        },
        request_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        attachment_type: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        file_path: {
            type: DataTypes.STRING(2048),
            allowNull: false,
        },
        property_control_number: {
            type: DataTypes.STRING(64),
            allowNull: true,
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        updated_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'request_attachments',
        timestamps: true,
    }
);

export default RequestAttachment;
