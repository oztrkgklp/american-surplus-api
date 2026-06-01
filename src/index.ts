import express, { Application, Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import os from 'os';
import envvars from '@/config/envvars';
import { getLogger } from '@/utils/logger';
import { setupRoutes } from '@/orchestration/routes';
import { startConsumer } from '@/kafka';
import { database, syncDatabaseForLocalDevelopment } from '@/utils/database';
import { elasticsearchClient } from '@/utils/elasticsearch';
import * as rateLimiter from '@/utils/rateLimiter';
import { setupAssociations as setupModelAssociations } from '@/utils/modelAssociations';
import { initializeStorageStructure } from '@/utils/storage/init';
import { initEligibilityCron } from './eligibility/job/eligiblityApplicationExpiration.job';
import { createServer } from 'http';
import { initSocket } from './utils/socket';
import { initComplianceCron } from './compliance-utilization/jobs/complianceCheck.job';
import { initInvoiceFileProcessingCron } from './documents/job/invoiceFileProcessing.job';
import { initReconciliationReportCron } from './documents/job/reconciliationReport.job';
import { initExpiredScreeningDateCron } from './properties/jobs/expiredScreeningDate.job';
import { initSba8aExpirationCron } from './organization/jobs/sba8aExpiration.job';
import { initWantListExpiryCron } from './want-list/job/want-list-expiry.job';
import { initWantListQueryCron } from './want-list/job/want-list-query.job';

const logger = getLogger('App');

const logInfo = (payload: Record<string, unknown>) => {
    logger.info(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
};

const logError = (payload: Record<string, unknown>) => {
    logger.error(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
};

const getRuntimeStats = () => ({
    pid: process.pid,
    hostname: os.hostname(),
    pod_name: process.env.POD_NAME || process.env.HOSTNAME || os.hostname(),
    uptime_seconds: Math.floor(process.uptime()),
    memory_usage: process.memoryUsage(),
    cpu_usage: process.cpuUsage(),
});

const bootstrap = async () => {
    const app: Application = express();
    const httpServer = createServer(app);

    logInfo({
        event: 'process_started',
        ...getRuntimeStats(),
    });

    process.on('SIGINT', () => {
        logInfo({
            event: 'process_shutdown',
            signal: 'SIGINT',
            ...getRuntimeStats(),
        });
    });

    process.on('SIGTERM', () => {
        logInfo({
            event: 'process_shutdown',
            signal: 'SIGTERM',
            ...getRuntimeStats(),
        });
    });

    process.on('uncaughtException', (error: Error) => {
        logError({
            event: 'process_uncaught_exception',
            error: error.message,
            stack: error.stack,
            ...getRuntimeStats(),
        });
    });

    process.on('unhandledRejection', (reason: any) => {
        logError({
            event: 'process_unhandled_rejection',
            error: reason?.message || String(reason),
            stack: reason?.stack,
            ...getRuntimeStats(),
        });
    });

    // Initialize Socket.IO
    const io = initSocket(httpServer);
    app.set('socketIO', io);

    // Route logging middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        const requestLogger = req.url === "/health" ? logger.debug.bind(logger) : logger.info.bind(logger);
        requestLogger(req.method + " " + req.url);
        res.on("finish", () => {
            const duration = Date.now() - startTime;
            requestLogger(req.method + " " + req.url + " " + res.statusCode + " - " + duration + "ms");
        });
        next();
    });

    // Rate limiter
    if (envvars.rateLimiter.enabled) {
        app.use(rateLimiter.apiLimiter);
    }

    // Middleware
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(cookieParser());
    app.use(cors());

    // Sequelize model associations
    setupModelAssociations();

    await syncDatabaseForLocalDevelopment();

    // Routes
    setupRoutes(app);

    try {
        // Wait for async dependencies
        await Promise.all([
          database.connect(),
          elasticsearchClient.connect(),
          initializeStorageStructure(),
          startConsumer(),
        ]);

        // --- BullMQ cron jobs ---
        initEligibilityCron();
        initComplianceCron();
        initInvoiceFileProcessingCron();
        initReconciliationReportCron();;
        initExpiredScreeningDateCron();
        initSba8aExpirationCron();
        initWantListExpiryCron();
        initWantListQueryCron();

        // Start server after all async setup is done
        const SERVICE_NAME = envvars.app.name;
        const VERSION = envvars.app.build + '-' + envvars.app.environment;
        const PORT = envvars.app.port;

        httpServer.listen(PORT, () => {
            logger.info(`${SERVICE_NAME} v${VERSION} is running on port ${PORT} (with Socket.IO rooms for notifications)`);
        });
    } catch (err) {
        logger.error(`App failed to initialize: ${err}`);
        process.exit(1);
    }
};

bootstrap();
