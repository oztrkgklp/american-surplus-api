import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface ApplicationLogAttributes {
    id: number;
    application_id: number;
    application_form_id?: number | null;
    user_id?: string | null;
    action: string;
    metadata?: object | null;
    createdAt?: Date;
}

interface ApplicationLogCreationAttributes extends Optional<ApplicationLogAttributes, 'id' | 'application_form_id' | 'user_id' | 'metadata' | 'createdAt'> { }

class ApplicationLog extends Model<ApplicationLogAttributes, ApplicationLogCreationAttributes> implements ApplicationLogAttributes {
    public id!: number;
    public application_id!: number;
    public application_form_id!: number | null;
    public user_id!: string | null;
    public action!: string;
    public metadata!: object | null;
}

ApplicationLog.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        application_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'applications', key: 'id' },
            onDelete: 'CASCADE',
        },
        application_form_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'application_forms', key: 'id' },
            onDelete: 'SET NULL',
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        action: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'application_logs',
        timestamps: true,
    }
);

export default ApplicationLog;
