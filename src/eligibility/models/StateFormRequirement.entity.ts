// models/StateFormRequirement.ts
import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';

interface StateFormRequirementAttributes {
    id: number;
    state_id: number;
    form_id: number;
    metadata: object;
    createdAt?: Date;
    updatedAt?: Date;
}

interface StateFormRequirementCreationAttributes
    extends Optional<StateFormRequirementAttributes, 'id' | 'createdAt' | 'updatedAt'> { }

class StateFormRequirement
    extends Model<StateFormRequirementAttributes, StateFormRequirementCreationAttributes>
    implements StateFormRequirementAttributes {
    public id!: number;
    public state_id!: number;
    public form_id!: number;
    public metadata!: object;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

StateFormRequirement.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'states', key: 'stateId' },
        },
        form_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'forms', key: 'id' },
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        }
    },
    {
        sequelize: database.sequelize,
        tableName: 'state_form_requirements',
        timestamps: true,
    }
);

export default StateFormRequirement;
