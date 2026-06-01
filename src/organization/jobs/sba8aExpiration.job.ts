import { Queue, Worker } from 'bullmq';
import { getLogger } from '@/utils/logger';
import { Sba8aService } from '../services/sba8a.service';
import { bullmqConnection as connection } from '@/utils/bullmq/connection';

const logger = getLogger('sba8aExpirationQueue');
const QUEUE_NAME = 'sba8aExpirationQueue';
const SBA8A_WARNING_JOB = 'sba8aWarning';
const SBA8A_EXPIRE_JOB = 'sba8aExpire';

export function initSba8aExpirationCron() {
    const sba8aQueue = new Queue(QUEUE_NAME, { connection });

    sba8aQueue.add(SBA8A_WARNING_JOB, {}, { repeat: { cron: '10 0 * * *' } as any, jobId: SBA8A_WARNING_JOB, removeOnComplete: true, attempts: 3 });
    sba8aQueue.add(SBA8A_EXPIRE_JOB, {}, { repeat: { cron: '15 0 * * *' } as any, jobId: SBA8A_EXPIRE_JOB, removeOnComplete: true, attempts: 3 });

    new Worker(
        QUEUE_NAME,
        async (job) => {
            switch (job.name) {
                case SBA8A_WARNING_JOB:
                    logger.info('SBA 8(a) warning job triggered');
                    await Sba8aService.sendWarningNotifications();
                    logger.info('SBA 8(a) warning job completed');
                    break;
                case SBA8A_EXPIRE_JOB:
                    logger.info('SBA 8(a) expiration job triggered');
                    await Sba8aService.sendExpirationNotifications();
                    logger.info('SBA 8(a) expiration job completed');
                    break;
                default:
                    logger.warn(`No handler for job: ${job.name}`);
            }
        },
        { connection }
    );

    process.on('SIGINT', async () => {
        logger.info('Shutting down sba8aExpirationQueue...');
        await sba8aQueue.close();
        process.exit(0);
    });
}
