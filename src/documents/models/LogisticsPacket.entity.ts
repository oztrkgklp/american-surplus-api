import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';
import RequestAttachment from '@/properties/models/RequestAttachment';
import Request from '@/properties/models/Request';
import User from '../../authn/models/User';

export enum LogisticsPacketStatus {
    PENDING = 'PENDING',
    SASP_SIGNED = 'SASP_SIGNED',
    ORGANIZATION_SIGNED = 'ORGANIZATION_SIGNED',
    FULLY_SIGNED = 'FULLY_SIGNED',
}

interface LogisticsPacketAttributes {
    id: number;
    state_id: number;
    donee_account_id: number;
    request_id: number;
    status: LogisticsPacketStatus;
    shipping_name?: string;
    memo_sasp?: string;
    memo_organization?: string;
    attachment_id: number;
    packet_no: string;
    packet_data: object | string;
    sasp_signed_at?: Date;
    organization_signed_at?: Date;
    sasp_signed_by?: string;
    organization_signed_by?: string;
    purposes?: object;
    loar_attachment_id?: number;
    loar_sasp_user_id?: string;
}

interface LogisticsPacketCreationAttributes extends Optional<LogisticsPacketAttributes, 'id'> { }

class LogisticsPacket extends Model<LogisticsPacketAttributes, LogisticsPacketCreationAttributes> implements LogisticsPacketAttributes {
    public id!: number;
    public state_id!: number;
    public donee_account_id!: number;
    public request_id!: number;
    public status!: LogisticsPacketStatus;
    public shipping_name?: string;
    public memo_sasp?: string;
    public memo_organization?: string;
    public attachment_id!: number;
    public packet_no!: string;
    public packet_data!: object | string;
    public sasp_signed_at?: Date;
    public organization_signed_at?: Date;
    public sasp_signed_by?: string;
    public organization_signed_by?: string;
    public purposes?: object;
    public loar_attachment_id?: number;
    public loar_sasp_user_id?: string;

    // associations
    public readonly doneeAccount?: DoneeAccount;
    public readonly attachment?: RequestAttachment;
    public readonly request?: Request;
    public readonly loarAttachment?: RequestAttachment;
    public readonly loarSaspUser?: User;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

LogisticsPacket.init(
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
            defaultValue: LogisticsPacketStatus.PENDING,
        },
        shipping_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
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
        packet_no: {
            type: DataTypes.STRING(45),
            allowNull: false,
            unique: true,
        },
        packet_data: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        sasp_signed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        organization_signed_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        sasp_signed_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        organization_signed_by: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        purposes: {
            type: DataTypes.JSON,
            allowNull: true,
        },
        loar_attachment_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        loar_sasp_user_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'logistics_packets',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    }
);

export default LogisticsPacket;
