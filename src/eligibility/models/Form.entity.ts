import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface FormAttributes {
    id: number;
    name: string;
    identifier: string;
    scope: 'Donee' | 'Organization';
}

interface FormCreationAttributes extends Optional<FormAttributes, 'id'> { }

class Form extends Model<FormAttributes, FormCreationAttributes> implements FormAttributes {
    public id!: number;
    public name!: string;
    public identifier!: string;
    public scope!: 'Donee' | 'Organization';

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Form.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        identifier: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        scope: {
            type: DataTypes.ENUM('Donee', 'Organization'),
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'forms',
        timestamps: true,
    }
);

export default Form;
