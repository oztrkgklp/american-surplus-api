import { Queue, Worker } from 'bullmq';
import { getLogger } from '@/utils/logger';
import { ComplianceService } from '../services/Compliance.service';
import { withTransaction } from '@/utils/transactionalOperation';
import { bullmqConnection as connection } from '@/utils/bullmq/connection';

const logger = getLogger('complianceQueue');
const QUEUE_NAME = 'complianceQueue';

const IN_SERVICE_JOB = 'inServiceComplianceJob';
const RESTRICTIVE_USE_JOB = 'restrictiveUseComplianceJob';

export function initComplianceCron() {
    const complianceQueue = new Queue(QUEUE_NAME, { connection });

    complianceQueue.add(
        IN_SERVICE_JOB,
        {},
        {
            repeat: { cron: '5 0 * * *' } as any,
            jobId: IN_SERVICE_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );
    complianceQueue.add(
        RESTRICTIVE_USE_JOB,
        {},
        {
            repeat: { cron: '7 0 * * *' } as any,
            jobId: RESTRICTIVE_USE_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    new Worker(
        QUEUE_NAME,
        async job => {
            switch (job.name) {
                case IN_SERVICE_JOB:
                    logger.info('In-service compliance job triggered');
                    await ComplianceService.processInServiceCompliance();
                    logger.info('In-service compliance job completed');
                    break;
                case RESTRICTIVE_USE_JOB:
                    await withTransaction(async (transaction) => {
                        logger.info('Restrictive-use compliance job triggered');
                        await ComplianceService.processRestrictiveUseCompliance(transaction);
                        logger.info('Restrictive-use compliance job completed');
                    });
                    break;
                default:
                    logger.warn(`No handler for job: ${job.name}`);
            }
        },
        { connection }
    );

    process.on('SIGINT', async () => {
        logger.info('Shutting down complianceQueue...');
        await new Queue(QUEUE_NAME, { connection }).close();
        process.exit(0);
    });
}
