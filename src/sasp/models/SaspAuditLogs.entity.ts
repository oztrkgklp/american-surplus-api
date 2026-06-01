import { Model, DataTypes, Optional } from 'sequelize';
import { database } from '@/utils/database';

export enum Activity {
  USER_ACTIVATED = 'USER_ACTIVATED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  INVITATION_SENT = 'INVITATION_SENT',
  INVITATION_ACCEPTED = 'INVITATION_ACCEPTED',
  INVITATION_REJECTED = 'INVITATION_REJECTED',
  INVITATION_CANCELED = 'INVITATION_CANCELED',
  INVITATION_RESENT = 'INVITATION_RESENT',
  ROLE_CHANGED = 'ROLE_CHANGED',
  PERMISSION_CHANGED = 'PERMISSION_CHANGED',
  STATE_DETAILS_UPDATED = 'STATE_DETAILS_UPDATED',
  APPLICATION_APPROVED = 'APPLICATION_APPROVED',
  APPLICATION_REJECTED = 'APPLICATION_REJECTED',
  FORM_APPROVED = 'FORM_APPROVED',
  FORM_REJECTED = 'FORM_REJECTED',
  DONE_ACCOUNT_ASSIGNED = 'DONE_ACCOUNT_ASSIGNED',
  PRIMARY_CONTACT_CHANGED = 'PRIMARY_CONTACT_CHANGED',
  PRIMARY_CONTACT_INFO_UPDATED = 'PRIMARY_CONTACT_INFO_UPDATED',
  USER_INFO_UPDATED = 'USER_INFO_UPDATED',
  DONE_ACCOUNT_DEACTIVATED = 'DONE_ACCOUNT_DEACTIVATED',
  DONE_ACCOUNT_ACTIVATED = 'DONE_ACCOUNT_ACTIVATED',
  DISPOSAL_FEES_UPDATED = 'DISPOSAL_FEES_UPDATED',
  HEAD_AUTHORIZED_OFFICIAL_CHANGED = 'HEAD_AUTHORIZED_OFFICIAL_CHANGED',
  HEAD_AUTHORIZED_OFFICIAL_INFO_UPDATED = 'HEAD_AUTHORIZED_OFFICIAL_INFO_UPDATED',
}

interface SaspAuditLogAttributes {
  id: number;
  state_id: number;
  activator: string;
  activity: Activity;
  metadata: Record<string, any>;
}

interface SaspAuditLogCreation extends Optional<SaspAuditLogAttributes, 'id'> { }

export class SaspAuditLog extends Model<SaspAuditLogAttributes, SaspAuditLogCreation> implements SaspAuditLogAttributes {
  public id!: number;
  public state_id!: number
  public activator!: string;
  public activity!: Activity;
  public metadata!: Record<string, any>;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SaspAuditLog.init(
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
    activator: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    activity: {
      type: DataTypes.ENUM(...Object.values(Activity)),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    sequelize: database.sequelize,
    tableName: 'sasp_audit_logs',
    timestamps: true,
    underscored: true,
  }
);

export default SaspAuditLog;
