import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';
import WantListKeyword from './WantListKeyword.entity';

interface WantListMatchAttributes {
    id: number;
    want_list_keyword_id: number;
    donee_account_id: number;
    ICN: string;
    property_name: string;
    surplus_release_date: number;
    created_at?: Date;
    updated_at?: Date;
}

interface WantListMatchCreationAttributes extends Optional<WantListMatchAttributes, 'id'> { }

class WantListMatch extends Model<WantListMatchAttributes, WantListMatchCreationAttributes> implements WantListMatchAttributes {
    public id!: number;
    public want_list_keyword_id!: number;
    public donee_account_id!: number;
    public ICN!: string;
    public property_name!: string;
    public surplus_release_date!: number;
    public readonly created_at!: Date;
    public readonly updated_at!: Date;

    public readonly doneeAccount?: DoneeAccount;
    public readonly keyword?: WantListKeyword;
}

WantListMatch.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        want_list_keyword_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        donee_account_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        ICN: {
            type: DataTypes.STRING(64),
            allowNull: false,
            field: 'ICN', // DB column is ICN; avoid underscored conversion to i_c_n
        },
        property_name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        surplus_release_date: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'want_list_matches',
        timestamps: true,
        underscored: true,
    }
);

export default WantListMatch;
