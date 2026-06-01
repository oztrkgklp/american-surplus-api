import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import Organization from '@/organization/models/Organization';
import { OrganizationAddressType } from '@/enums/organizationAddressType.enum';

export interface OrganizationAddressAttributes {
    id: string;
    organization_id: string;
    address_type: OrganizationAddressType | string;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
}

export type OrganizationAddressCreationAttributes = Optional<OrganizationAddressAttributes, 'id' | 'address_line2'>;

class OrganizationAddress
    extends Model<OrganizationAddressAttributes, OrganizationAddressCreationAttributes>
    implements OrganizationAddressAttributes
{
    public id!: string;
    public organization_id!: string;
    public address_type!: OrganizationAddressType | string;
    public address_line1!: string;
    public address_line2?: string | null;
    public city!: string;
    public state!: string;
    public postal_code!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public organization?: Organization;
}

OrganizationAddress.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        organization_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: { model: 'organizations', key: 'id' },
        },
        address_type: {
            type: DataTypes.STRING(64),
            allowNull: false,
        },
        address_line1: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        address_line2: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        city: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        state: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        postal_code: {
            type: DataTypes.STRING(20),
            allowNull: false,
        },
    },
    {
        sequelize: database.sequelize,
        tableName: 'organization_addresses',
        timestamps: true,
    }
);

export default OrganizationAddress;
