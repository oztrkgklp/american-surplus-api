import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface ApplicationFormAttributes {
    id: number;
    application_id: number;
    form_id: number;
    status: string;
    is_required: boolean;
    form_data?: object | string | null;
    approved_date?: number | null;
    rejected_date?: number | null;
    rejectedReason?: string | null;
    submitted_date?: number | null;
    expiry_date?: number | null;
}

interface ApplicationFormCreationAttributes extends Optional<ApplicationFormAttributes, 'id' | 'approved_date' | 'rejected_date' | 'rejectedReason' | 'submitted_date' | 'expiry_date'> { }

class ApplicationForm extends Model<ApplicationFormAttributes, ApplicationFormCreationAttributes> implements ApplicationFormAttributes {
    public id!: number;
    public application_id!: number;
    public form_id!: number;
    public status!: string;
    public is_required!: boolean;
    public form_data?: object | string | null;
    public submitted_date?: number | null;
    public expiry_date?: number | null;
    public approved_date?: number | null;
    public rejected_date?: number | null;
    public rejectedReason?: string | null;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // public form?: Form;
}

ApplicationForm.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        application_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        form_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        form_data: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        is_required: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        expiry_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
            defaultValue: null,
        },
        submitted_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
            defaultValue: null,
        },
        approved_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        rejected_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        rejectedReason: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'application_forms',
        timestamps: true,
    }
);

export default ApplicationForm;
