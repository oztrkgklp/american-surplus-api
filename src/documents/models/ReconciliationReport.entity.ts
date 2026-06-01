
import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import State from '@/states/models/State';

export interface ReconciliationReportAttributes {
    id: number;
    state_id: number;
    period_start: string;
    period_end: string;
    monthly_sasp_net_fees_pennies: number;
    monthly_american_surplus_net_fees_pennies: number;
    total_monthly_fees_pennies: number;
    report_path: string;
    agreement_path: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ReconciliationReportCreationAttributes extends Optional<ReconciliationReportAttributes, 'id'> { }

class ReconciliationReport extends Model<ReconciliationReportAttributes, ReconciliationReportCreationAttributes> implements ReconciliationReportAttributes {
    public id!: number;
    public state_id!: number;
    public period_start!: string;
    public period_end!: string;
    public monthly_sasp_net_fees_pennies!: number;
    public monthly_american_surplus_net_fees_pennies!: number;
    public total_monthly_fees_pennies!: number;
    public report_path!: string;
    public agreement_path!: string;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
    public readonly state?: State;
}

ReconciliationReport.init(
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
        period_start: {
            type: DataTypes.STRING(10),
            allowNull: false,
        },
        period_end: {
            type: DataTypes.STRING(10),
            allowNull: false,
        },
        total_monthly_fees_pennies: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        monthly_sasp_net_fees_pennies: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        monthly_american_surplus_net_fees_pennies: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        report_path: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        agreement_path: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'reconciliation_report',
        timestamps: true,
    }
);


export default ReconciliationReport;
