import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Request from './Request';

interface PropertyAttributes {
    property_id: number;
    request_id: number;
    property_reimbursable: boolean;
    property_control_number: string;
    property_surplus_release_date: number;
    property_name: string;
    property_type: string;
    property_description: string;
    property_justification: string;
    property_justification_extended: string;
    property_quantity: number;
    property_allocated_quantity: number;
    property_denied_quantity: number;
    property_original_value: number;
    property_total_value: number;
    is_denied: boolean;
    is_cancelled: boolean;
    is_picked_up: boolean;
    is_late_cancelled: boolean;
    property_status?: string | null;
    property_fair_market_value?: number | null;
    property_disposal_condition?: string | null;
    property_supply_condition?: string | null;
    property_demil_condition?: string | null;
    property_location_address_one?: string | null;
    property_location_address_two?: string | null;
    property_location_address_three?: string | null;
    property_location_city?: string | null;
    property_location_region_state?: string | null;
    property_location_postal_code?: string | null;
    property_poc_name?: string | null;
    property_poc_phone?: string | null;
    property_poc_email?: string | null;
    property_poc_email_cc?: string | null;
    property_custodian_reporting_agency?: string | null;
    property_custodian_name?: string | null;
    property_custodian_phone?: string | null;
    property_custodian_email?: string | null;
    property_custodian_email_cc?: string | null;
    property_allocated_date?: number | null;
    property_cancellation_date?: number | null;
    property_cancellation_reason?: string | null;
    property_pickup_date?: number | null;
    property_denial_date?: number | null;
    property_denial_reason?: string | null;
    proof_of_possession_path?: string | null;
}

export interface PropertyCreationAttributes
    extends Optional<PropertyAttributes, 'property_id'> { }

class Property
    extends Model<PropertyAttributes, PropertyCreationAttributes>
    implements PropertyAttributes {
    public property_id!: number;
    public request_id!: number;
    public property_reimbursable!: boolean;
    public property_control_number!: string;
    public property_surplus_release_date!: number;
    public property_name!: string;
    public property_type!: string;
    public property_description!: string;
    public property_justification!: string;
    public property_justification_extended!: string;
    public property_quantity!: number;
    public property_allocated_quantity!: number;
    public property_denied_quantity!: number;
    public property_original_value!: number;
    public property_total_value!: number;
    public is_cancelled!: boolean;
    public is_denied!: boolean;
    public is_picked_up!: boolean;
    public is_late_cancelled!: boolean;
    public property_status!: string | null;
    public property_fair_market_value?: number | null;
    public property_disposal_condition?: string | null;
    public property_supply_condition?: string | null;
    public property_demil_condition?: string | null;
    public property_location_address_one?: string | null;
    public property_location_address_two?: string | null;
    public property_location_address_three?: string | null;
    public property_location_city?: string | null;
    public property_location_region_state?: string | null;
    public property_location_postal_code?: string | null;
    public property_poc_name?: string | null;
    public property_poc_phone?: string | null;
    public property_poc_email?: string | null;
    public property_poc_email_cc?: string | null;
    public property_custodian_reporting_agency?: string | null;
    public property_custodian_name?: string | null;
    public property_custodian_phone?: string | null;
    public property_custodian_email?: string | null;
    public property_custodian_email_cc?: string | null;
    public property_allocated_date?: number | null;
    public property_cancellation_date?: number | null;
    public property_cancellation_reason?: string | null;
    public property_pickup_date?: number | null;
    public property_denial_date?: number | null;
    public property_denial_reason?: string | null;
    public proof_of_possession_path?: string | null;

    // Associations
    public readonly request?: Request;

    // Timestamps
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Property.init(
    {
        property_id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        request_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        property_reimbursable: {
            type: DataTypes.BOOLEAN,
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
            type: DataTypes.STRING(10000),
            allowNull: false,
        },
        property_justification: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        property_justification_extended: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        property_quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        property_allocated_quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        property_denied_quantity: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        property_original_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        property_total_value: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        is_picked_up: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        is_cancelled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        is_denied: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        is_late_cancelled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
            allowNull: false,
        },
        property_status: {
            type: DataTypes.STRING,
            allowNull: true,
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
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        property_poc_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_poc_phone: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_poc_email: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_poc_email_cc: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_custodian_reporting_agency: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_custodian_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_custodian_phone: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_custodian_email: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_custodian_email_cc: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        property_allocated_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        property_cancellation_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        property_cancellation_reason: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        property_denial_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        property_denial_reason: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        property_pickup_date: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        proof_of_possession_path: {
            type: DataTypes.STRING(255),
            allowNull: true,
        }
    },
    {
        sequelize: database.sequelize,
        tableName: 'properties',
        timestamps: true,
    }
);

export default Property;
