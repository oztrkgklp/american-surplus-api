import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import State from '@/states/models/State';

interface SaspUserAttributes {
    id: number;
    userId: string;
    stateId: number;
    title?: string | null;
    is_active: boolean;
    deactivatedAt?: Date | null;
}

interface SaspUserCreationAttributes extends Optional<SaspUserAttributes, 'id' | 'title' | 'deactivatedAt'> { }

class SaspUser extends Model<SaspUserAttributes, SaspUserCreationAttributes> implements SaspUserAttributes {
    public id!: number;
    public userId!: string;
    public stateId!: number;
    public title?: string | null;
    public is_active!: boolean;
    public deactivatedAt?: Date | null;

    //Association 
    public state?: State;
    // Timestamps (managed by Sequelize)
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

SaspUser.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
        },
        stateId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        deactivatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'sasp_users',
        timestamps: true,
    }
);

export default SaspUser;
