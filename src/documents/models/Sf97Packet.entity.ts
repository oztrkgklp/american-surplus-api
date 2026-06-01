import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';
import RequestAttachment from '@/properties/models/RequestAttachment';
import Request from '@/properties/models/Request';

export enum Sf97PacketStatus {
  PENDING = 'PENDING',
  SASP_SIGNED = 'SASP_SIGNED',
  ORGANIZATION_SIGNED = 'ORGANIZATION_SIGNED',
  FULLY_SIGNED = 'FULLY_SIGNED',
}

interface Sf97PacketAttributes {
  id: number;
  state_id: number;
  donee_account_id: number;
  request_id: number;
  status: Sf97PacketStatus;
  memo_sasp?: string;
  memo_organization?: string;
  attachment_id: number;
  property_control_number?: string | null;
  document_no: string;
  packet_data: object | string;
  sasp_signed_at?: Date;
  organization_signed_at?: Date;
  sasp_signed_by?: string;
  organization_signed_by?: string;
}

interface Sf97PacketCreationAttributes extends Optional<Sf97PacketAttributes, 'id'> {}

class Sf97Packet extends Model<Sf97PacketAttributes, Sf97PacketCreationAttributes> implements Sf97PacketAttributes {
  public id!: number;
  public state_id!: number;
  public donee_account_id!: number;
  public request_id!: number;
  public status!: Sf97PacketStatus;
  public memo_sasp?: string;
  public memo_organization?: string;
  public attachment_id!: number;
  public property_control_number?: string | null;
  public document_no!: string;
  public packet_data!: object | string;
  public sasp_signed_at?: Date;
  public organization_signed_at?: Date;
  public sasp_signed_by?: string;
  public organization_signed_by?: string;

  public readonly doneeAccount?: DoneeAccount;
  public readonly requestAttachment?: RequestAttachment;
  public readonly request?: Request;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Sf97Packet.init(
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
      defaultValue: Sf97PacketStatus.PENDING,
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
    property_control_number: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    document_no: {
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
  },
  {
    sequelize: database.sequelize,
    tableName: 'sf97_packets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default Sf97Packet;
