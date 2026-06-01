import { Op, Transaction } from 'sequelize';
import Sba8aCertification, { Sba8aStatusEnum, SBA8A_DURATION_MS, VET_CERT_DURATION_MS, SBA8A_NOTIFICATION_DAYS, Sba8aNotificationDay } from '../models/Sba8aCertification.entity';
import DoneeAccount from '@/organization/models/DoneeAccount';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import ApplicationLog from '@/eligibility/models/ApplicationLogs.entity';
import { DoneeAccountService } from '@/organization/services/donee';
import { getLogger } from '@/utils/logger';
import { withTransaction } from '@/utils/transactionalOperation';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import { EligibilityApplicationStatuses, EligibilityApplicationFormStatuses } from '@/enums/eligibilityStatus.enum';
import { EligbilityActions } from '@/enums/eligibilityActions.enum';

const logger = getLogger('Sba8aService');

export class Sba8aService {
    /** Create a new SBA 8(a) certification for a donee account. Called when SASP approves Page 2 for an SBA 8(a) donee. */
    static async createCertification(doneeAccountId: number, applicationId: number, certificationDate: number, createdBy: string, type: string, transaction?: Transaction): Promise<Sba8aCertification> {
        let expirationDate = type === 'sba' ? certificationDate + SBA8A_DURATION_MS : certificationDate + VET_CERT_DURATION_MS
        const existing = await Sba8aCertification.findOne({ where: { donee_account_id: doneeAccountId }, transaction });

        if (existing) {
            await existing.update({ application_id: applicationId, certification_date: certificationDate, expiration_date: expirationDate, status: Sba8aStatusEnum.ACTIVE, last_notification_days: null }, { transaction });
            logger.info(`Updated SBA 8(a) certification for donee account ${doneeAccountId}, new expiration ${new Date(expirationDate).toISOString()}`);
            return existing;
        }

        const certification = await Sba8aCertification.create({ donee_account_id: doneeAccountId, application_id: applicationId, certification_date: certificationDate, expiration_date: expirationDate, created_by: createdBy, status: Sba8aStatusEnum.ACTIVE }, { transaction });
        logger.info(`Created SBA 8(a) certification for donee account ${doneeAccountId}, expires ${new Date(expirationDate).toISOString()}`);
        return certification;
    }

    /** Update an existing SBA 8(a) certification date. */
    static async updateCertification(doneeAccountId: number, certificationDate: number, transaction?: Transaction): Promise<Sba8aCertification | null> {
        const certification = await Sba8aCertification.findOne({ where: { donee_account_id: doneeAccountId }, transaction });
        if (!certification) {
            logger.warn(`No SBA 8(a) certification found for donee account ${doneeAccountId}`);
            return null;
        }

        const expirationDate = certificationDate + SBA8A_DURATION_MS;
        await certification.update({ certification_date: certificationDate, expiration_date: expirationDate, status: Sba8aStatusEnum.ACTIVE, last_notification_days: null }, { transaction });
        logger.info(`Updated SBA 8(a) certification for donee account ${doneeAccountId}, new expiration ${new Date(expirationDate).toISOString()}`);
        return certification;
    }

    /** Get certification by donee account ID. */
    static async getCertificationByDoneeAccount(doneeAccountId: number): Promise<Sba8aCertification | null> {
        return Sba8aCertification.findOne({ where: { donee_account_id: doneeAccountId }, include: [{ model: DoneeAccount, as: 'doneeAccount' }] });
    }

    /** Get all active certifications expiring within the specified number of days. */
    static async getExpiringCertifications(daysUntilExpiry: number): Promise<Sba8aCertification[]> {
        const now = Date.now();
        const cutoff = now + daysUntilExpiry * 24 * 60 * 60 * 1000;
        return Sba8aCertification.findAll({ where: { status: Sba8aStatusEnum.ACTIVE, expiration_date: { [Op.gt]: now, [Op.lte]: cutoff } }, include: [{ model: DoneeAccount, as: 'doneeAccount' }] });
    }

    /** Get certifications that need a specific notification (haven't received it yet). */
    static async getCertificationsNeedingNotification(daysUntilExpiry: Sba8aNotificationDay): Promise<Sba8aCertification[]> {
        const now = Date.now();
        const cutoff = now + daysUntilExpiry * 24 * 60 * 60 * 1000;
        return Sba8aCertification.findAll({
            where: { status: Sba8aStatusEnum.ACTIVE, expiration_date: { [Op.gt]: now, [Op.lte]: cutoff }, [Op.or]: [{ last_notification_days: null }, { last_notification_days: { [Op.gt]: daysUntilExpiry } }] },
            include: [{ model: DoneeAccount, as: 'doneeAccount' }],
        });
    }

    /** Update the last notification sent for a certification. */
    static async updateLastNotification(certificationId: number, daysUntilExpiry: number, transaction?: Transaction): Promise<void> {
        await Sba8aCertification.update({ last_notification_days: daysUntilExpiry }, { where: { id: certificationId }, transaction });
    }

    /** Get all certifications that have expired (expiration_date <= now) but are still marked ACTIVE. */
    static async getExpiredCertifications(): Promise<Sba8aCertification[]> {
        const now = Date.now();
        return Sba8aCertification.findAll({ where: { status: Sba8aStatusEnum.ACTIVE, expiration_date: { [Op.lte]: now } }, include: [{ model: DoneeAccount, as: 'doneeAccount' }] });
    }

    /** Mark a certification as expired, expire the application, and deactivate the donee account. */
    static async expireCertification(certification: Sba8aCertification): Promise<void> {
        await withTransaction(async (transaction) => {
            await certification.update({ status: Sba8aStatusEnum.EXPIRED }, { transaction });
            await Application.update({ status: EligibilityApplicationStatuses.APPLICATION_EXPIRED }, { where: { id: certification.application_id }, transaction });
            await ApplicationLog.create({ application_id: certification.application_id, user_id: 'system', action: EligbilityActions.APPLICATION_EXPIRED }, { transaction });
            await ApplicationForm.update({ status: EligibilityApplicationFormStatuses.NEW }, { where: { application_id: certification.application_id, expiry_date: { [Op.not]: null } }, transaction });
            await DoneeAccountService.deactivateDoneeAccount(certification.donee_account_id, transaction);
            logger.info(`Expired SBA 8(a) certification ${certification.id}, application ${certification.application_id}, donee account ${certification.donee_account_id}`);
        });
    }

    /** Process all expired certifications - mark as expired and deactivate donee accounts. */
    static async processExpiredCertifications(): Promise<number> {
        const expiredCertifications = await this.getExpiredCertifications();
        let processedCount = 0;
        for (const certification of expiredCertifications) {
            try {
                await this.expireCertification(certification);
                processedCount++;
            } catch (error) {
                logger.error(`Failed to expire certification ${certification.id}:`, error);
            }
        }
        logger.info(`Processed ${processedCount} expired SBA 8(a) certifications`);
        return processedCount;
    }

    /** Send warning notifications for SBA 8(a) certifications approaching expiration. */
    static async sendWarningNotifications(): Promise<void> {
        // Process smallest thresholds first so certs only get the most relevant notification
        for (const days of [...SBA8A_NOTIFICATION_DAYS].reverse()) {
            try {
                const certifications = await this.getCertificationsNeedingNotification(days as Sba8aNotificationDay);
                for (const certification of certifications) {
                    try {
                        await NotificationFactory.createNotification(NotificationType.SBA8A_EXPIRATION_WARNING, { certification, daysUntilExpiry: days });
                        await this.updateLastNotification(certification.id, days);
                        logger.info(`Sent ${days}-day warning for SBA 8(a) certification ${certification.id}`);
                    } catch (error) {
                        logger.error(`Failed to send warning for certification ${certification.id}:`, error);
                    }
                }
            } catch (error) {
                logger.error(`Failed to process ${days}-day warnings:`, error);
            }
        }
    }

    /** Process expired SBA 8(a) certifications and send expiration notifications. */
    static async sendExpirationNotifications(): Promise<void> {
        try {
            const expiredCertifications = await this.getExpiredCertifications();
            for (const certification of expiredCertifications) {
                try {
                    await this.expireCertification(certification);
                    await NotificationFactory.createNotification(NotificationType.SBA8A_EXPIRED, { certification });
                    logger.info(`Expired SBA 8(a) certification ${certification.id}`);
                } catch (error) {
                    logger.error(`Failed to expire certification ${certification.id}:`, error);
                }
            }
            logger.info(`Processed ${expiredCertifications.length} expired SBA 8(a) certifications`);
        } catch (error) {
            logger.error('Failed to process SBA 8(a) expirations:', error);
        }
    }
}
