import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import State from '@/states/models/State';
import Organization from '@/organization/models/Organization';
import DoneeAccount from '@/organization/models/DoneeAccount';

export enum ReportType {
    REPORT_3040 = 'report_3040',
    REPORT_MONTHLY_ALLOCATIONS = 'report_monthly_allocations',
}

interface ReportAttributes {
    id: number;
    state_id: number;
    name: string;
    type: string;
    report_data: object | string;
    file_path?: string | null;
    donee_account_id?: number;
    organization_id?: string;
    created_by?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

interface ReportCreationAttributes extends Optional<ReportAttributes, 'id' | 'file_path' | 'donee_account_id' | 'organization_id' | 'created_by'> { }

class Report extends Model<ReportAttributes, ReportCreationAttributes> implements ReportAttributes {
    public id!: number;
    public state_id!: number;
    public name!: string;
    public type!: string;
    public report_data!: object | string;
    public file_path?: string | null;
    public donee_account_id?: number;
    public organization_id?: string;
    public created_by?: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // Associations
    public readonly state?: State;
    public readonly organization?: Organization;
    public readonly doneeAccount?: DoneeAccount;
}

Report.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        report_data: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        file_path: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        donee_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'reports',
        timestamps: true,
    }
);

export default Report;
