import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface QBOTokenAttributes {
    id: number;
    realmId: string; // QuickBooks Company ID
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
    tokenType: string;
    idToken?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface QBOTokenCreationAttributes extends Optional<QBOTokenAttributes, 'id'> {}

class QBOToken extends Model<QBOTokenAttributes, QBOTokenCreationAttributes> implements QBOTokenAttributes {
    public id!: number;
    public realmId!: string;
    public accessToken!: string;
    public refreshToken!: string;
    public accessTokenExpiresAt!: Date;
    public refreshTokenExpiresAt!: Date;
    public tokenType!: string;
    public idToken?: string | null;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

QBOToken.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        realmId: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        accessToken: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        refreshToken: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        accessTokenExpiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        refreshTokenExpiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        tokenType: {
            type: DataTypes.STRING(50),
            allowNull: false,
            defaultValue: 'bearer',
        },
        idToken: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'qbo_tokens',
        timestamps: true,
    }
);

export default QBOToken;
