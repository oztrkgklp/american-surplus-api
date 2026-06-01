import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';
import User from '@/authn/models/User';

interface RequestAttributes {
    id: number;
    requestor: string;
    donee_account: number;
    tcn?: string | null;
    status: string;
}

interface RequestCreationAttributes
    extends Optional<RequestAttributes, 'id' | 'tcn'> { }

class Request
    extends Model<RequestAttributes, RequestCreationAttributes>
    implements RequestAttributes {
    public id!: number;
    public requestor!: string;
    public donee_account!: number;
    public tcn?: string | null;
    public status!: string;

    // Associations
    public readonly doneeAccount?: DoneeAccount;
    public readonly requestorUser?: User;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Request.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        requestor: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        donee_account: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        tcn: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
        status: {
            type: DataTypes.STRING(45),
            allowNull: false,
            defaultValue: 1,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'requests',
        timestamps: true,
    }
);

export default Request;
