import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface UserSessionAttributes {
    sessionId: string;
    userId: string;
    refreshToken: string;
    expiredAt?: Date | null;
    deviceInfo?: string | null;
}

interface UserSessionCreationAttributes
    extends Optional<UserSessionAttributes, 'sessionId' | 'expiredAt' | 'deviceInfo'> { }

class UserSession
    extends Model<UserSessionAttributes, UserSessionCreationAttributes>
    implements UserSessionAttributes {
    public sessionId!: string;
    public userId!: string;
    public refreshToken!: string;
    public expiredAt!: Date | null;
    public deviceInfo!: string | null;

    // Timestamps (automatically managed by Sequelize)
    public readonly createdAt!: Date;
}

UserSession.init(
    {
        sessionId: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        refreshToken: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        expiredAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        deviceInfo: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'user_sessions',
        timestamps: true,
        updatedAt: false,
    }
);

export default UserSession;
