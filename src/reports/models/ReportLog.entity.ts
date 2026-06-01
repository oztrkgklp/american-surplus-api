import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Report from './Report.entity';
import User from '@/authn/models/User';

export enum ReportLogAction {
    CREATED = 'created',
    UPDATED = 'updated',
    DELETED = 'deleted',
    GENERATED = 'generated',
    SUBMITTED = 'submitted',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    EXPORTED = 'exported',
}

interface ReportLogAttributes {
    id: number;
    report_id?: number;
    action: string;
    created_by: string;
    description?: string | null;
    metadata?: object | string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface ReportLogCreationAttributes extends Optional<ReportLogAttributes, 'id' | 'description' | 'metadata'> { }

class ReportLog extends Model<ReportLogAttributes, ReportLogCreationAttributes> implements ReportLogAttributes {
    public id!: number;
    public report_id?: number;
    public action!: string;
    public created_by!: string;
    public description?: string | null;
    public metadata?: object | string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // Associations
    public readonly report?: Report;
    public readonly user?: User;
}

ReportLog.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        report_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        action: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        created_by: {
            type: DataTypes.STRING(36),
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'report_logs',
        timestamps: true,
    }
);

export default ReportLog;
