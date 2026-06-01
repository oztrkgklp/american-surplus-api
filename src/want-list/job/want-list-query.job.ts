import { Queue } from 'bullmq';
import { bullmqConnection as connection } from '@/utils/bullmq/connection';
import { getLogger } from '@/utils/logger';
import { WANT_LIST_QUERY_JOB, WANT_LIST_QUERY_QUEUE } from '@/want-list/constants/queue';

const logger = getLogger('wantListQueryQueue');

export function initWantListQueryCron() {
    const wantListQueryQueue = new Queue(WANT_LIST_QUERY_QUEUE, { connection });

    wantListQueryQueue.add(
        WANT_LIST_QUERY_JOB,
        {},
        {
            repeat: { cron: '10 8,20 * * *' } as any,
            jobId: WANT_LIST_QUERY_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    logger.info('Want-list query cron registered');

    process.on('SIGINT', async () => {
        logger.info('Shutting down wantListQueryQueue...');
        await wantListQueryQueue.close();
        process.exit(0);
    });
}

export async function enqueueWantListQueryJob() {
    const wantListQueryQueue = new Queue(WANT_LIST_QUERY_QUEUE, { connection });

    try {
        return await wantListQueryQueue.add(
            WANT_LIST_QUERY_JOB,
            {},
            {
                jobId: `${WANT_LIST_QUERY_JOB}:manual:${Date.now()}`,
                removeOnComplete: true,
                attempts: 3,
            }
        );
    } finally {
        await wantListQueryQueue.close();
    }
}
