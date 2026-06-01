import { Request, Response } from 'express';
import envvars from '@/config/envvars';
import { sendSuccess, sendError } from '@/utils/response/responseHelper'
import { AppError } from '@/utils/response/appError';
import { InvoiceFileProcessingService } from '@/documents/services/invoice-file-processing.service';
import { PropertyService } from '../../properties/services/property';
import { ReconciliationReportService } from '@/documents/services/reconciliation-report.service';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import { Sba8aService } from '@/organization/services/sba8a.service';
import { ComplianceService } from '@/compliance-utilization/services/Compliance.service';
import { withTransaction } from '@/utils/transactionalOperation';
import { enqueueWantListQueryJob } from '@/want-list/job/want-list-query.job';
import { WantListService } from '@/want-list/services/want-list.service';

export const manualInvoiceExport = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await InvoiceFileProcessingService.exportInvoicesToCsv();
        sendSuccess(res, { message: 'process completed' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualReconTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await ReconciliationReportService.generateMonthlyReport();
        sendSuccess(res, { message: 'process completed' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const triggerExpiredScreeningDateCron = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await PropertyService.triggerExpiredScreeningDateCron();
        sendSuccess(res, { message: 'process completed' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualEligibilityWarning = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await EligibilityService.warnForms();
        await EligibilityService.warnApplications();
        sendSuccess(res, { message: 'Eligibility warning jobs triggered.' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualEligibilityExpire = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await EligibilityService.expireForms();
        await EligibilityService.expireApplications();
        sendSuccess(res, { message: 'Eligibility expiry jobs triggered.' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualSba8aWarning = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await Sba8aService.sendWarningNotifications();
        sendSuccess(res, { message: 'SBA 8(a) warning job triggered.' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualSba8aExpire = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await Sba8aService.sendExpirationNotifications();
        sendSuccess(res, { message: 'SBA 8(a) expiration job triggered.' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualComplianceCheck = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        await withTransaction(async (transaction) => {
            await ComplianceService.processInServiceCompliance(transaction);
            await ComplianceService.processRestrictiveUseCompliance(transaction);
        });

        sendSuccess(res, { message: 'Compliance jobs triggered.' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualWantListQueryJobTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        const job = await enqueueWantListQueryJob();
        sendSuccess(res, {
            message: 'Want-list query job added to queue.',
            jobId: job.id,
            queueName: job.queueName,
            jobName: job.name,
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const manualWantListExpiryTrigger = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean test con');

        const archivedMatchesCount = await WantListService.archiveExpiredMatches();
        const deactivatedKeywordsCount = await WantListService.deactivateStaleKeywords();

        sendSuccess(res, {
            message: 'Want-list expiry maintenance completed.',
            archivedMatchesCount,
            deactivatedKeywordsCount,
        });
    } catch (error) {
        sendError(req, res, error);
    }
};
