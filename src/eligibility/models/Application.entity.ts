import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import ApplicationForm from './ApplicationForm.entity';
import User from '@/authn/models/User';
import State from '@/states/models/State';
import Organization from '@/organization/models/Organization';

interface ApplicationAttributes {
    id: number;
    status: string;
    state_id: number;
    organization_id: string;
    donee_account_id: number;
    submitted_date?: number; // Unix timestamp
    expiry_date?: number;
    pdf_path?: string;
    signed_by?: string;
    signed_date?: number;
    approved_by?: string;
    approved_date?: number;
    deny_reason?: string;
    created_by?: string;
}

interface ApplicationCreationAttributes extends Optional<ApplicationAttributes, 'id' | 'submitted_date' | 'expiry_date'> { }

class Application extends Model<ApplicationAttributes, ApplicationCreationAttributes> implements ApplicationAttributes {
    public id!: number;
    public status!: string;
    public state_id!: number;
    public organization_id!: string;
    public donee_account_id!: number;
    public submitted_date?: number;
    public expiry_date?: number;
    public pdf_path?: string;
    public signed_by?: string;
    public signed_date?: number;
    public approved_by?: string;
    public approved_date?: number;
    public deny_reason?: string;
    public applicationForms?: ApplicationForm[];
    public created_by?: string;

    //associations:
    public readonly organization?: Organization; 
    public readonly createdBy?: User;
    public readonly approvedBy?: User;
    public readonly state?: State;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Application.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        donee_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        submitted_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        expiry_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        pdf_path: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        signed_by: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        signed_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        approved_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        approved_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        deny_reason: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        created_by: {
            type: DataTypes.UUID,
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'applications',
        timestamps: true,
    }
);

export default Application;
