import { Model, DataTypes, Optional } from 'sequelize';
import { database } from '@/utils/database';
import User from './User';

export interface PasswordResetTokenAttributes {
    id: string;
    user_id: string;
    token_hash: string;
    expiry_date: number;
    is_used: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface PasswordResetTokenCreationAttributes extends Optional<PasswordResetTokenAttributes, 'id' | 'is_used'> { }

class PasswordResetToken extends Model<PasswordResetTokenAttributes, PasswordResetTokenCreationAttributes> implements PasswordResetTokenAttributes {
    public id!: string;
    public user_id!: string;
    public token_hash!: string;
    public expiry_date!: number;
    public is_used!: boolean;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // associations
    public readonly user?: User;
}

PasswordResetToken.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        token_hash: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        expiry_date: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        is_used: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'password_reset_tokens',
        timestamps: true,
    }
);

// associations


export default PasswordResetToken;
