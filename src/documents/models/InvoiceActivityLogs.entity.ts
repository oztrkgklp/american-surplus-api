import { Model, DataTypes, Optional } from 'sequelize';
import { database } from '@/utils/database';

export enum InvoiceActivity {
  INVOICE_GENERATED = 'INVOICE_GENERATED',
  INVOICE_SIGNED = 'INVOICE_SIGNED',
  INVOICE_PAYMENT_REQUESTED = 'INVOICE_PAYMENT_REQUESTED',
  INVOICE_PAID = 'INVOICE_PAID',
  INVOICE_CANCELED = 'INVOICE_CANCELED',
}

interface InvoiceActivityLogAttributes {
  id: number;
  invoice_id: number;
  activator: string;
  activity: string;
  metadata: Record<string, any>;
}

interface InvoiceActivityLogCreation extends Optional<InvoiceActivityLogAttributes, 'id'> { }

export class InvoiceActivityLog extends Model<InvoiceActivityLogAttributes, InvoiceActivityLogCreation> implements InvoiceActivityLogAttributes {
  public id!: number;
  public invoice_id!: number;
  public activator!: string;
  public activity!: string;
  public metadata!: Record<string, any>;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

InvoiceActivityLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    activator: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    activity: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize: database.sequelize,
    tableName: 'invoice_activity_logs',
    timestamps: true,
    underscored: true,
  }
);

export default InvoiceActivityLog; 