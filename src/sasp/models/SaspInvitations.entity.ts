import { Model, DataTypes, Optional } from 'sequelize';
import { database } from '@/utils/database';
import User from '@/authn/models/User';
import State from '@/states/models/State';

interface SaspInvitationAttributes {
    id: string;
    state_id: number;
    invited_user_id: string;
    invited_by: string;
    role_id: number;
    status: string;
    responded_at?: Date | null;
}

interface SaspInvitationCreation extends Optional<SaspInvitationAttributes, 'id' | 'responded_at'> { }

export class SaspInvitation extends Model<SaspInvitationAttributes, SaspInvitationCreation> implements SaspInvitationAttributes {
    public id!: string;
    public state_id!: number;
    public invited_user_id!: string;
    public invited_by!: string;
    public role_id!: number;
    public status!: string;
    public responded_at!: Date | null;

    //associations 
    public saspInvitationReceiver?: User
    public saspInvitationSender?: User
    public state?: State

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

SaspInvitation.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        invited_user_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        invited_by: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        role_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'PENDING',
        },
        responded_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'sasp_user_invitations',
        timestamps: true,
        underscored: true
    }
);

export default SaspInvitation;
