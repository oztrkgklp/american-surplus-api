import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';


export enum PropertyMigrationStatus {
    MIGRATION_REQUESTED = 'migration_requested',
    MIGRATED = 'migrated',
    REJECTED = 'rejected',
}


interface LegacyPropertyDataAttributes {
    id: number;
    stateId: number;
    tcn?: string | null;
    request_status: string;
    requestor: string;
    donee_account_number: string;

    property_control_number: string;
    property_surplus_release_date: number;
    property_name: string;
    property_type: string;
    property_description: string;
    property_justification?: string | null;
    property_justification_extended?: string | null;
    property_quantity: number;
    property_original_value: number;
    property_total_value: number;
    property_fair_market_value?: number | null;
    property_disposal_condition?: string | null;
    property_supply_condition?: string | null;
    property_demil_condition?: string | null;
    property_allocated_date?: number | null;
    property_reimbursable: boolean;
    property_surplus_review_comments?: string | null;

    property_location_address_one?: string | null;
    property_location_address_two?: string | null;
    property_location_address_three?: string | null;
    property_location_city?: string | null;
    property_location_region_state?: string | null;
    property_location_postal_code?: string | null;

    property_poc_name?: string | null;
    property_custodian_name?: string | null;

    property_migration_status?: string | null;
}

export interface LegacyPropertyDataCreationAttributes extends Optional<LegacyPropertyDataAttributes, 'id'> { }

class LegacyPropertyData extends Model<LegacyPropertyDataAttributes, LegacyPropertyDataCreationAttributes> implements LegacyPropertyDataAttributes {
    public id!: number;
    public stateId!: number;
    public tcn?: string | null;
    public request_status!: string;
    public requestor!: string;
    public donee_account_number!: string;

    public property_control_number!: string;
    public property_surplus_release_date!: number;
    public property_name!: string;
    public property_type!: string;
    public property_description!: string;
    public property_justification?: string | null;
    public property_justification_extended?: string | null;
    public property_quantity!: number;
    public property_original_value!: number;
    public property_total_value!: number;
    public property_fair_market_value?: number | null;
    public property_disposal_condition?: string | null;
    public property_supply_condition?: string | null;
    public property_demil_condition?: string | null;
    public property_allocated_date?: number | null;
    public property_reimbursable!: boolean;
    public property_surplus_review_comments?: string | null;

    public property_location_address_one?: string | null;
    public property_location_address_two?: string | null;
    public property_location_address_three?: string | null;
    public property_location_city?: string | null;
    public property_location_region_state?: string | null;
    public property_location_postal_code?: string | null;

    public property_poc_name?: string | null;
    public property_custodian_name?: string | null;

    public property_migration_status?: string | null;


}

LegacyPropertyData.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        stateId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        tcn: {
            type: DataTypes.STRING(36),
            allowNull: true,
        },
        request_status: {
            type: DataTypes.STRING(45),
            allowNull: false,
        },
        requestor: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        donee_account_number: {
            type: DataTypes.STRING(36),
            allowNull: false,
        },
        property_control_number: {
            type: DataTypes.STRING(36),
            allowNull: false,
        },
        property_surplus_release_date: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        property_name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        property_type: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        property_description: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        property_justification: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        property_justification_extended: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        property_quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        property_original_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        property_total_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        property_fair_market_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true,
        },
        property_disposal_condition: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_supply_condition: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_demil_condition: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_allocated_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        property_reimbursable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
        },
        property_surplus_review_comments: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        property_location_address_one: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_location_address_two: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_location_address_three: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_location_city: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_location_region_state: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_location_postal_code: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        property_poc_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_custodian_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_migration_status: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'legacy_property_data',
        timestamps: false,
    }
);

export default LegacyPropertyData