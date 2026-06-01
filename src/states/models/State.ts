import { DataTypes, Model } from 'sequelize';
import { database } from '@/utils/database';
import StateDisposalFees from './StateDisposalFees';

export default class State extends Model {
    public stateId!: number;
    public allow_request!: boolean;
    public stateName!: string;
    public addressLine1!: string;
    public addressLine2!: string;
    public city!: string;
    public stateCode!: string;
    public zip!: string;
    public phone!: string;

    public stateDisposalFees?: StateDisposalFees[];
}

State.init(
    {
        stateId: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false
        },
        allow_request: {
            type: DataTypes.BOOLEAN,
            allowNull: false
        },
        stateName: {
            type: DataTypes.STRING(45),
            allowNull: false
        },
        addressLine1: {
            type: DataTypes.STRING(45),
            allowNull: false
        },
        addressLine2: {
            type: DataTypes.STRING(45),
            allowNull: false
        },
        city: {
            type: DataTypes.STRING(45),
            allowNull: false
        },
        stateCode: {
            type: DataTypes.STRING(2),
            allowNull: false
        },
        zip: {
            type: DataTypes.STRING(10),
            allowNull: false
        },
        phone: {
            type: DataTypes.STRING(20),
            allowNull: false
        }
    },
    {
        sequelize: database.sequelize,
        tableName: 'states',
        timestamps: false
    }
);