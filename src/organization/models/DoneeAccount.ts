import { database } from '@/utils/database';

import Organization from '@/organization/models/Organization';
import State from '@/states/models/State';

import { DataTypes, Model, Optional } from 'sequelize';
import Application from '@/eligibility/models/Application.entity';
import Mapping3040 from '@/reports/models/Mapping3040.entity';

interface DoneeAccountAttributes {
    id: number;
    organizationId: string;
    stateId: number;
    isActive: boolean;
    name?: string | null;
    qbo_ref_id?: string | null;
    deactivatedAt?: Date | null;
}

interface DoneeAccountCreationAttributes extends Optional<DoneeAccountAttributes, 'id' | 'name'> { }

class DoneeAccount extends Model<DoneeAccountAttributes, DoneeAccountCreationAttributes> implements DoneeAccountAttributes {
    public id!: number;
    public organizationId!: string;
    public stateId!: number;
    public isActive!: boolean;
    public name?: string | null;
    public qbo_ref_id?: string | null;
    public deactivatedAt?: Date | null;


    // Associations
    public readonly state?: State;
    public readonly organization?: Organization;
    public readonly application?: Application;
    public readonly mapping3040?: Mapping3040;

    // Timestamps (managed by Sequelize)
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

DoneeAccount.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(45),
            allowNull: true,
        },
        qbo_ref_id: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        organizationId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        stateId: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        deactivatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize: database.sequelize, // Connect to the Sequelize instance
        tableName: 'donee_accounts',
        timestamps: true, // Enables createdAt and updatedAt
    }
);

export default DoneeAccount;