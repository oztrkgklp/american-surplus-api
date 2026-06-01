import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Property from '@/properties/models/Property';
import DoneeAccount from '@/organization/models/DoneeAccount';

export enum ComplianceStatus {
    AWAITING_EVIDENCE = 'awaiting_evidence',
    EVIDENCE_SUBMITTED = 'evidence_submitted',
    IN_RESTRICTIVE_USE_PERIOD = 'in_restrictive_use_period',
    EVIDENCE_REJECTED = 'evidence_rejected',
    FULLY_TRANSFERRED = 'fully_transfered',
    OVERDUE = 'over_due',
}


interface ComplianceAttributes {
    id: number;
    donee_account_id: number;
    request_id: number;
    property_id: number;
    status: string;
    term_start?: number | null;
    term_end?: number | null;
    metadata?: any | null;
    period_months?: number | null;
    term_months?: number | null;
    next_reporting_date?: number | null;
}

interface ComplianceCreationAttributes extends Optional<ComplianceAttributes, 'id' | 'metadata' | 'next_reporting_date'> { }

class Compliance extends Model<ComplianceAttributes, ComplianceCreationAttributes> implements ComplianceAttributes {
    public id!: number;
    public donee_account_id!: number;
    public request_id!: number;
    public property_id!: number;
    public status!: string;
    public term_start!: number | null;
    public term_end!: number | null;
    public period_months?: number | null;
    public term_months?: number | null;
    public metadata?: any | null;
    public next_reporting_date!: number | null;

    public readonly created_at!: Date;
    public readonly updated_at!: Date;


    // Associations
    public readonly property?: Property;
    public readonly doneeAccount?: DoneeAccount;
}

Compliance.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    donee_account_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    property_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    request_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false
    },
    term_start: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    term_end: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    period_months: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    term_months: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    },
    next_reporting_date: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
}, {
    sequelize: database.sequelize,
    tableName: 'compliances',
    timestamps: true,
});

export default Compliance;
