import { Queue, Worker } from 'bullmq';
import { bullmqConnection as connection } from '@/utils/bullmq/connection';
import { getLogger } from '@/utils/logger';
import { WantListService } from '../services/want-list.service';

const logger = getLogger('wantListQueue');
const QUEUE_NAME = 'wantListQueue';

const WANT_LIST_EXPIRY_JOB = 'wantListExpiryJob';

export function initWantListExpiryCron() {
    const wantListQueue = new Queue(QUEUE_NAME, { connection });

    wantListQueue.add(
        WANT_LIST_EXPIRY_JOB,
        {},
        {
            repeat: { cron: '0 8,20 * * *' } as any,
            jobId: WANT_LIST_EXPIRY_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    new Worker(
        QUEUE_NAME,
        async job => {
            switch (job.name) {
                case WANT_LIST_EXPIRY_JOB: {
                    logger.info('Want-list expiry job triggered');

                    const archivedMatchesCount = await WantListService.archiveExpiredMatches();
                    const deactivatedKeywordsCount = await WantListService.deactivateStaleKeywords();

                    logger.info(`Want-list expiry job completed. Archived matches: ${archivedMatchesCount}, deactivated keywords: ${deactivatedKeywordsCount}`);
                    break;
                }
                default:
                    logger.warn(`No handler for job: ${job.name}`);
            }
        },
        { connection }
    );

    process.on('SIGINT', async () => {
        logger.info('Shutting down wantListQueue...');
        await wantListQueue.close();
        process.exit(0);
    });
}
