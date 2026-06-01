import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';
import RequestAttachment from '@/properties/models/RequestAttachment';
import Request from '@/properties/models/Request';
import State from '@/states/models/State';

export enum InvoiceStatus {
    PENDING = 'PENDING',
    SIGNED = 'SIGNED',
    PAYMENT_REQUESTED = 'PAYMENT_REQUESTED',
    PAID = 'PAID',
    CANCELED = 'CANCELED',
}

interface InvoiceAttributes {
    id: number;
    state_id: number;
    donee_account_id: number;
    request_id: number;
    status: string;
    memo_sasp?: string;
    memo_organization?: string;
    attachment_id: number;
    invoice_no: string;
    invoice_data: object | string;
    total_amount: number;
    total_amount_pennies: number;
    american_surplus_amount: number;
    american_surplus_amount_pennies: number;
    sasp_net_amount: number;
    sasp_net_amount_pennies: number;
    due_date?: Date;
    qbo_ref_id?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

interface InvoiceCreationAttributes extends Optional<InvoiceAttributes, 'id'> { }

class Invoice extends Model<InvoiceAttributes, InvoiceCreationAttributes> implements InvoiceAttributes {
    public id!: number;
    public state_id!: number;
    public donee_account_id!: number;
    public request_id!: number;
    public status!: string;
    public memo_sasp?: string;
    public memo_organization?: string;
    public attachment_id!: number;
    public invoice_no!: string;
    public invoice_data!: object | string;
    public total_amount!: number;
    public total_amount_pennies!: number;
    public sasp_net_amount!: number;
    public sasp_net_amount_pennies!: number;
    public american_surplus_amount!: number;
    public american_surplus_amount_pennies!: number;
    public due_date?: Date;
    public qbo_ref_id?: string;

    // associations
    public readonly doneeAccount?: DoneeAccount;
    public readonly attachment?: RequestAttachment;
    public readonly request?: Request;
    public readonly state?: State;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Invoice.init(
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
        donee_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        request_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING(45),
            allowNull: false,
            defaultValue: InvoiceStatus.PENDING,
        },
        memo_sasp: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        memo_organization: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        attachment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        invoice_no: {
            type: DataTypes.STRING(45),
            allowNull: false,
            unique: true,
        },
        invoice_data: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        total_amount: {
            type: DataTypes.DECIMAL(15, 4),
            allowNull: false,
            defaultValue: 0,
        },
        total_amount_pennies: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },
        american_surplus_amount: {
            type: DataTypes.DECIMAL(15, 4),
            allowNull: false,
            defaultValue: 0,
        },
        american_surplus_amount_pennies: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },
        sasp_net_amount: {
            type: DataTypes.DECIMAL(15, 4),
            allowNull: false,
            defaultValue: 0,
        },
        sasp_net_amount_pennies: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
        },
        due_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        qbo_ref_id: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'invoices',
        timestamps: true,
    }
);


export default Invoice;
