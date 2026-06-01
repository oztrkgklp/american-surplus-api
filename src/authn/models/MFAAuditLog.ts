import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import User from './User';

interface MFAAuditLogAttributes {
  id: number;
  userId: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface MFAAuditLogCreationAttributes extends Optional<MFAAuditLogAttributes, 'id'> {}

class MFAAuditLog extends Model<MFAAuditLogAttributes, MFAAuditLogCreationAttributes> implements MFAAuditLogAttributes {
  public id!: number;
  public userId!: string;
  public action!: string;
  public ipAddress!: string | null;
  public userAgent!: string | null;
  public createdAt!: Date;

  // Association
  public user?: User;
}

MFAAuditLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      field: 'user_id',
    },
    action: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address',
    },
    userAgent: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'user_agent',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
  },
  {
    sequelize: database.sequelize,
    tableName: 'mfa_audit_logs',
    timestamps: false,
  }
);

// Define association
MFAAuditLog.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

export default MFAAuditLog;
