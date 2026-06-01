import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface InvoiceConfigAttributes {
    id: number;
    state_id: number;
    series: string;
    starting_number: number;
    current_number: number;
    total_digit: number;
}

interface InvoiceConfigCreationAttributes extends Optional<InvoiceConfigAttributes, 'id'> { }

class InvoiceConfig extends Model<InvoiceConfigAttributes, InvoiceConfigCreationAttributes> implements InvoiceConfigAttributes {
    public id!: number;
    public state_id!: number;
    public series!: string;
    public starting_number!: number;
    public current_number!: number;
    public total_digit!: number; // total digit is needed to know how many pad(0s in our case) will be added at the beginning

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

InvoiceConfig.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        series: {
            type: DataTypes.STRING(45),
            allowNull: false,
        },
        starting_number: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        current_number: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        total_digit: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'invoice_config',
        timestamps: true,
    }
);

export default InvoiceConfig;
