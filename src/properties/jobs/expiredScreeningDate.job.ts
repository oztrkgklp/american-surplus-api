import { Queue, Worker } from 'bullmq';
import { getLogger } from '@/utils/logger';
import { PropertyService } from '../services/property';
import { bullmqConnection as connection } from '@/utils/bullmq/connection';

const logger = getLogger('propertiesQueue');
const QUEUE_NAME = 'propertiesQueue';

const EXPIRED_SCREENING_DATE_JOB = 'expiredScreeningDateJob';

export function initExpiredScreeningDateCron() {
    const propertiesQueue = new Queue(QUEUE_NAME, { connection });

    propertiesQueue.add(
        EXPIRED_SCREENING_DATE_JOB,
        {},
        {
            repeat: { cron: '0 0 * * *' } as any, // Daily at 00:00
            jobId: EXPIRED_SCREENING_DATE_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    new Worker(
        QUEUE_NAME,
        async job => {
            switch (job.name) {
                case EXPIRED_SCREENING_DATE_JOB:
                    logger.info('Expired screening date job triggered');
                    // await PropertyService.processExpiredScreeningDates();
                    logger.info('Expired screening date job completed');
                    break;
                default:
                    logger.warn(`No handler for job: ${job.name}`);
            }
        },
        { connection }
    );

    process.on('SIGINT', async () => {
        logger.info('Shutting down propertiesQueue...');
        await new Queue(QUEUE_NAME, { connection }).close();
        process.exit(0);
    });
}
