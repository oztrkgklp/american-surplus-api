import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';
import Organization from '@/organization/models/Organization';
import State from '@/states/models/State';

interface Mapping3040Attributes {
    id: number;
    donee_account_id: number;
    organization_id: string;
    state_id: number;
    section: string;
    category: string;
    createdAt?: Date;
    updatedAt?: Date;
}

interface Mapping3040CreationAttributes extends Optional<Mapping3040Attributes, 'id'> {}

class Mapping3040 extends Model<Mapping3040Attributes, Mapping3040CreationAttributes> implements Mapping3040Attributes {
    public id!: number;
    public donee_account_id!: number;
    public organization_id!: string;
    public state_id!: number;
    public section!: string;
    public category!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    // Associations
    public readonly doneeAccount?: DoneeAccount;
    public readonly organization?: Organization;
    public readonly state?: State;
}

Mapping3040.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        donee_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        section: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        category: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: '3040_mappings',
        timestamps: true,
    }
);

export default Mapping3040;
