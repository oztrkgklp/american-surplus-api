import { database } from "@/utils/database";
import { DataTypes, Model, Optional } from "sequelize";
import State from "./State";
import DisposalCondition from "@/metadata/models/DisposalCondition";

interface StateDisposalFeesAttributes {
    id: number;
    stateId: number;
    disposalConditionId: number;
    fee: number;
    effective_date: Date;
}

interface StateDisposalFeesCreationAttributes extends Optional<StateDisposalFeesAttributes, "id"> { }

export default class StateDisposalFees extends Model<StateDisposalFeesAttributes, StateDisposalFeesCreationAttributes>
    implements StateDisposalFeesAttributes {
    public id!: number;
    public stateId!: number;
    public disposalConditionId!: number;
    public fee!: number;
    public effective_date!: Date;

    // Associations
    public readonly state!: State;
    public readonly disposalCondition!: DisposalCondition;
}

StateDisposalFees.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        stateId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        disposalConditionId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        fee: {
            type: DataTypes.DOUBLE,
            allowNull: false
        },
        effective_date: {
            type: DataTypes.DATE,
            allowNull: false
        }
    },
    {
        sequelize: database.sequelize,
        tableName: 'state_disposal_fees',
        timestamps: false
    }
);