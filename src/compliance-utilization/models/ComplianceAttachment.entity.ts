import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface ComplianceAttachmentAttributes {
    id: number;
    compliance_id: number;
    file_path: string;
    metadata: object;
}

interface ComplianceAttachmentCreationAttributes extends Optional<ComplianceAttachmentAttributes, 'id'> { }

class ComplianceAttachment extends Model<ComplianceAttachmentAttributes, ComplianceAttachmentCreationAttributes> implements ComplianceAttachmentAttributes {
    public id!: number;
    public compliance_id!: number;
    public file_path!: string;
    public metadata!: object;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

ComplianceAttachment.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    compliance_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    file_path: {
        type: DataTypes.STRING,
        allowNull: false
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: false,
    },
}, {
    sequelize: database.sequelize,
    tableName: 'compliance_attachments',
    timestamps: true,
});

export default ComplianceAttachment;

