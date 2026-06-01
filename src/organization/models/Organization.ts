import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from './DoneeAccount';
import type OrganizationAddress from '@/organization/models/OrganizationAddress';

interface OrganizationAttributes {
    id: string;
    name: string;
    organization_type?: string;
    organization_sub_type?: string;
    public_purpose?: string;
    primary_activity?: string;
    website?: string | null;
    tin: string;
    contact_first_name?: string | null;
    contact_last_name?: string | null;
    contact_title?: string | null;
    contact_phone?: string | null;
    contact_extension?: string | null;
    contact_email?: string | null;
    contact_fax_number?: string | null;
}

export type OrganizationCreationAttributes = Optional<
    OrganizationAttributes,
    | 'id'
    | 'website'
    | 'contact_title'
    | 'contact_first_name'
    | 'contact_last_name'
    | 'contact_phone'
    | 'contact_extension'
    | 'contact_email'
    | 'contact_fax_number'
>;

class Organization
    extends Model<OrganizationAttributes, OrganizationCreationAttributes>
    implements OrganizationAttributes {
    public id!: string;
    public name!: string;

    public organization_type?: string;
    public organization_sub_type?: string;
    public public_purpose?: string;
    public primary_activity?: string;

    public website?: string | null;
    public tin!: string;

    public contact_first_name?: string | null;
    public contact_last_name?: string | null;
    public contact_title?: string | null;
    public contact_phone?: string | null;
    public contact_extension?: string | null;
    public contact_fax_number?: string | null;
    public contact_email?: string | null;

    public readonly created_at!: Date;
    public readonly updated_at!: Date;

    public donee_accounts?: DoneeAccount[];
    public organization_addresses?: OrganizationAddress[];
}

Organization.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        organization_type: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        organization_sub_type: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        public_purpose: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        primary_activity: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        website: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        tin: {
            type: DataTypes.STRING(50),
            allowNull: false,
        },
        contact_fax_number: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        contact_email: {
            type: DataTypes.STRING(255),
            allowNull: true,
            validate: { isEmail: true },
        },
        contact_first_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        contact_last_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        contact_title: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        contact_phone: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        contact_extension: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'organizations',
        timestamps: true,
    }
);

export default Organization;
