import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface WantListMatchHistoryAttributes {
    id: number;
    donee_account_id: number;
    keyword: string;
    ICN: string;
    property_name: string;
    surplus_release_date: number;
    archived_at: Date;
    created_at?: Date;
    updated_at?: Date;
}

interface WantListMatchHistoryCreationAttributes extends Optional<WantListMatchHistoryAttributes, 'id'> { }

class WantListMatchHistory extends Model<WantListMatchHistoryAttributes, WantListMatchHistoryCreationAttributes> implements WantListMatchHistoryAttributes {
    public id!: number;
    public donee_account_id!: number;
    public keyword!: string;
    public ICN!: string;
    public property_name!: string;
    public surplus_release_date!: number;
    public archived_at!: Date;
    public readonly created_at!: Date;
    public readonly updated_at!: Date;

}

WantListMatchHistory.init(
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
        keyword: {
            type: DataTypes.STRING(50),
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
        archived_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'want_list_match_history',
        timestamps: true,
        underscored: true,
    }
);

export default WantListMatchHistory;
