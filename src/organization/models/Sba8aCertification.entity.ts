import { DataTypes, Model, Optional } from 'sequelize';
import { database } from '@/utils/database';
import DoneeAccount from '@/organization/models/DoneeAccount';
import envvars from '@/config/envvars';

export enum Sba8aStatusEnum {
    ACTIVE = 'ACTIVE',
    EXPIRED = 'EXPIRED',
}

export interface Sba8aCertificationAttributes {
    id: number;
    donee_account_id: number;
    application_id: number;
    certification_date: number;
    expiration_date: number;
    status: Sba8aStatusEnum;
    last_notification_days: number | null;
    created_by: string;
}

export interface Sba8aCertificationCreationAttributes extends Optional<Sba8aCertificationAttributes, 'id' | 'status' | 'last_notification_days'> {}

// Constants
export const SBA8A_DURATION_MS = envvars.businessRules.sba8aDurationDays * 24 * 60 * 60 * 1000;
export const VET_CERT_DURATION_MS = envvars.businessRules.vetCertDurationDays * 24 * 60 * 60 * 1000;
export const SBA8A_NOTIFICATION_DAYS = [180, 90, 60, 30, 7] as const;
export type Sba8aNotificationDay = (typeof SBA8A_NOTIFICATION_DAYS)[number];
export const SBA8A_PRIMARY_ACTIVITY = 'SBA 8(a)';

/** Check if a primary activity indicates SBA 8(a) certification */
export const isSba8aPrimaryActivity = (primaryActivity: string | null | undefined): boolean => {
    return primaryActivity?.toLowerCase().includes('sba 8') ?? false;
};

/** Check if a primary activity indicates VOSB/SDVOSB certification */
export const isVetCertPrimaryActivity = (primaryActivity: string | null | undefined): boolean => {
    return primaryActivity?.toLowerCase().includes('veteran') ?? false
};

/** Get certification duration in milliseconds based on primary activity */
export const getCertificationDurationMs = (primaryActivity: string | null | undefined): number => {
    if (isSba8aPrimaryActivity(primaryActivity)) {
        return SBA8A_DURATION_MS;
    }
    if (isVetCertPrimaryActivity(primaryActivity)) {
        return VET_CERT_DURATION_MS;
    }
    // Default to 3 years for any other certification type
    return VET_CERT_DURATION_MS;
};

class Sba8aCertification extends Model<Sba8aCertificationAttributes, Sba8aCertificationCreationAttributes> implements Sba8aCertificationAttributes {
    public id!: number;
    public donee_account_id!: number;
    public application_id!: number;
    public certification_date!: number;
    public expiration_date!: number;
    public status!: Sba8aStatusEnum;
    public last_notification_days!: number | null;
    public created_by!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public readonly doneeAccount?: DoneeAccount;
}

Sba8aCertification.init(
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        donee_account_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
        application_id: { type: DataTypes.INTEGER, allowNull: false },
        certification_date: { type: DataTypes.BIGINT, allowNull: false },
        expiration_date: { type: DataTypes.BIGINT, allowNull: false },
        status: { type: DataTypes.ENUM('ACTIVE', 'EXPIRED'), defaultValue: Sba8aStatusEnum.ACTIVE },
        last_notification_days: { type: DataTypes.INTEGER, allowNull: true },
        created_by: { type: DataTypes.STRING(36), allowNull: false },
    },
    { sequelize: database.sequelize, tableName: 'sba8a_certifications', timestamps: true }
);

export default Sba8aCertification;
