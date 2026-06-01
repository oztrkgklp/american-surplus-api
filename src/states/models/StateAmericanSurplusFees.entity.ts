import { database } from "@/utils/database";
import { DataTypes, Model, Optional } from "sequelize";
import State from "./State";
import DisposalCondition from "@/metadata/models/DisposalCondition";

interface StateAmericanSurplusFeesCreationAttributes extends Optional<StateAmericanSurplusFeesAttributes, "id"> { }
interface StateAmericanSurplusFeesAttributes {
    id: number;
    state_id: number;
    disposal_condition_id: number;
    fee: number;
    effective_date: Date;
}

export default class StateAmericanSurplusFees extends Model<StateAmericanSurplusFeesAttributes, StateAmericanSurplusFeesCreationAttributes> implements StateAmericanSurplusFeesAttributes {
    public id!: number;
    public state_id!: number;
    public disposal_condition_id!: number;
    public fee!: number;
    public effective_date!: Date;
    // Associations
    public readonly state!: State;
    public readonly disposalCondition!: DisposalCondition;
}

StateAmericanSurplusFees.init(
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        state_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        disposal_condition_id: {
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
        tableName: 'state_american_surplus_fees',
        timestamps: false,
    }
);
