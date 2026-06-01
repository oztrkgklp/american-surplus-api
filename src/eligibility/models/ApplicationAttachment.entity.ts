import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface ApplicationAttachmentAttributes {
    id: number;
    path: string;
    metadata: object;
    application_form_id: number;
}

interface ApplicationAttachmentCreationAttributes extends Optional<ApplicationAttachmentAttributes, 'id'> { }

class ApplicationAttachment extends Model<ApplicationAttachmentAttributes, ApplicationAttachmentCreationAttributes> implements ApplicationAttachmentAttributes {
    public id!: number;
    public path!: string;
    public metadata!: object;
    public application_form_id!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

ApplicationAttachment.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        path: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        application_form_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'application_forms',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'application_attachments',
        timestamps: true,
    }
);

export default ApplicationAttachment;
