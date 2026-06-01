import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';

interface WantListKeywordAttributes {
    id: number;
    donee_account_id: number;
    keyword: string;
    is_active: number;
    created_at?: Date;
    updated_at?: Date;
}

interface WantListKeywordCreationAttributes extends Optional<WantListKeywordAttributes, 'id' | 'is_active'> { }

class WantListKeyword extends Model<WantListKeywordAttributes, WantListKeywordCreationAttributes> implements WantListKeywordAttributes {
    public id!: number;
    public donee_account_id!: number;
    public keyword!: string;
    public is_active!: number;
    public readonly created_at!: Date;
    public readonly updated_at!: Date;

    public readonly doneeAccount?: DoneeAccount;
}

WantListKeyword.init(
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
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'want_list_keywords',
        timestamps: true,
        underscored: true,
    }
);

export default WantListKeyword;
