import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
// import User from './User.entity'; 

interface NotificationAttributes {
    id: number;
    user_id: string;
    type: string;
    payload: any;
    is_read: boolean;
    read_at?: Date;
}

interface NotificationCreationAttributes extends Optional<NotificationAttributes, 'id' | 'is_read' | 'read_at'> { }

class Notification extends Model<NotificationAttributes, NotificationCreationAttributes> implements NotificationAttributes {
    public id!: number;
    public user_id!: string;
    public type!: string;
    public payload!: any;
    public is_read!: boolean;
    public read_at?: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // associations
    //public user?: User;
}

Notification.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        type: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        payload: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        is_read: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        read_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'notifications',
        timestamps: true,
        underscored: true,
    }
);

export default Notification;
