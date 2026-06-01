import { Queue, Worker, Job, JobsOptions } from 'bullmq';
import { bullmqConnection } from '@/utils/bullmq/connection';
import { getLogger } from '@/utils/logger';
import { QBOWebhookService, WebhookPayload } from '@/qbo/services/qbo-webhook.service';

const logger = getLogger('qboWebhookQueue');
const QBO_WEBHOOK_QUEUE_NAME = 'qboWebhookQueue';

export interface QboInvoiceWebhookJobData {
    payload: WebhookPayload;
    rawBody: string;
    intuitSignature: string;
    receivedAt: string;
}

export const qboWebhookQueue = new Queue(QBO_WEBHOOK_QUEUE_NAME, {
    connection: bullmqConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 3000,
        },
        removeOnComplete: 1000,
        removeOnFail: 1000,
    },
});

const worker = new Worker(
    QBO_WEBHOOK_QUEUE_NAME,
    async (job: Job<QboInvoiceWebhookJobData>) => {
        logger.info(`Processing QBO webhook job ${job.name}:${job.id}`);
        const webhookService = new QBOWebhookService();
        webhookService.authenticateWebhook(job.data.rawBody, job.data.intuitSignature);
        await webhookService.handleWebhook(job.data.payload);
        logger.info(`Processed QBO webhook job ${job.name}:${job.id}`);
    },
    {
        connection: bullmqConnection,
        concurrency: 10,
    }
);

worker.on('failed', (job, err) => {
    logger.error(`QBO webhook job ${job?.name}:${job?.id} failed`, { error: err });
});

worker.on('completed', (job) => {
    logger.info(`QBO webhook job ${job.name}:${job.id} completed`);
});

export const addInvoiceWebhookJob = async (data: QboInvoiceWebhookJobData, opts?: JobsOptions) => {
    return qboWebhookQueue.add('invoice-webhook', data, opts);
};

