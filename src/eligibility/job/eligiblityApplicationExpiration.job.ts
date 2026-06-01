// src/cron/eligibilityCron.ts
import { Queue, Worker } from 'bullmq';
import { getLogger } from '@/utils/logger';
import { EligibilityService } from '../services/eligibility.service';
import { bullmqConnection as connection } from '@/utils/bullmq/connection';


const logger = getLogger('eligibilityQueue');
const QUEUE_NAME = 'eligibilityQueue';

const EXPIRE_JOB = 'eligibilityExpire';
const WARNING_JOB = 'eligibilityExpireWarning';

export function initEligibilityCron() {
    const eligibilityQueue = new Queue(QUEUE_NAME, { connection });

    // daily warning at 00:01
    eligibilityQueue.add(
        WARNING_JOB,
        {},
        {
            repeat: { cron: '1 0 * * *' } as any,
            jobId: WARNING_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    // daily expire at 00:05
    eligibilityQueue.add(
        EXPIRE_JOB,
        {},
        {
            repeat: { cron: '3 0 * * *' } as any,
            jobId: EXPIRE_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    new Worker(
        QUEUE_NAME,
        async (job) => {
            switch (job.name) {
                case WARNING_JOB:
                    logger.info(`expire job triggered`);
                    await EligibilityService.warnForms();
                    await EligibilityService.warnApplications();
                    logger.info(`expire job completed`);
                    break;

                case EXPIRE_JOB:
                    logger.info(`warning job triggered`);
                    await EligibilityService.expireForms();
                    await EligibilityService.expireApplications();
                    logger.info('warning job completed');
                    break;

                default:
                    logger.warn(`No handler for job: ${job.name}`);
            }
        },
        { connection }
    );

    // graceful shutdown of the queue
    process.on('SIGINT', async () => {
        logger.info('Shutting down eligibilityQueue...');
        await eligibilityQueue.close();
        process.exit(0);
    });
}
