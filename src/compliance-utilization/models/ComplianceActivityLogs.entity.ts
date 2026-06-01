import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';


export enum ComplianceActivty {
    AWAITING_EVIDENCE = 'awaiting_evidence',
    EVIDENCE_SUBMITTED = 'evidence_submitted',
    EVIDENCE_APPROVED = 'evidence_approved',
    EVIDENCE_REJECTED = 'evidence_rejected',
    FULLY_TRANSFERED = 'fully_transfered',
    OVERDUE = 'over_due'
}

interface ComplianceActivityLogAttributes {
    id: number;
    compliance_id: number;
    activity: string;
    metadata?: any;
    activator: string;
}

interface ComplianceActivityLogCreationAttributes extends Optional<ComplianceActivityLogAttributes, 'id' | 'metadata'> { }

class ComplianceActivityLog extends Model<ComplianceActivityLogAttributes, ComplianceActivityLogCreationAttributes> implements ComplianceActivityLogAttributes {
    public id!: number;
    public compliance_id!: number;
    public activity!: string;
    public metadata!: any;
    public activator!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

ComplianceActivityLog.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    compliance_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

    activity: {
        type: DataTypes.STRING,
        allowNull: false
    },
    metadata: {
        type: DataTypes.JSON,
        allowNull: true
    },
    activator: {
        type: DataTypes.UUID,
        allowNull: false
    },
}, {
    sequelize: database.sequelize,
    tableName: 'compliance_activity_logs',
    timestamps: true,
});

export default ComplianceActivityLog;
