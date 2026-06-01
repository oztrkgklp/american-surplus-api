import { Queue, Worker, Job, JobsOptions } from "bullmq";
import os from "os";
import { randomUUID } from "crypto";
import { sendEmail } from "./mailerHelper";
import { getLogger } from '@/utils/logger';
import { bullmqConnection } from "@/utils/bullmq/connection";

const logger = getLogger('emailQueue');
const EMAIL_QUEUE_NAME = "emailQueue";
const WORKER_NAME = "emailQueueWorker";

const logInfo = (payload: Record<string, unknown>) => {
    logger.info(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
};

const logError = (payload: Record<string, unknown>) => {
    logger.error(JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
};

const getRecipient = (value: unknown): string | undefined => {
    if (Array.isArray(value)) {
        return value.join(",");
    }
    return typeof value === "string" ? value : undefined;
};

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
    connection: bullmqConnection,
    defaultJobOptions: {
        attempts: 3, // Retry failed jobs up to 3 times
        backoff: {
            type: "exponential",
            delay: 5000, // Wait 5s before retrying
        },
        removeOnComplete: 100, // Keep the last 100 completed jobs
        removeOnFail: 500, // Keep 500 failed jobs for debugging
    },
});

const originalEmailQueueAdd = emailQueue.add.bind(emailQueue);
(emailQueue as any).add = async (jobName: string, data: any, opts?: JobsOptions) => {
    const now = Date.now();
    const emailId = data?.emailId || randomUUID();
    const requestId = data?.requestId ?? null;
    const recipient = getRecipient(data?.to);
    const template = data?.template || data?.templateName || jobName;

    logInfo({
        event: "email_queue_enqueue_start",
        emailId,
        requestId,
        recipient,
        template,
    });

    const enrichedData = {
        ...data,
        emailId,
        requestId,
        template,
        queued_at: now,
    };

    try {
        const job = await originalEmailQueueAdd(jobName, enrichedData, opts);
        logInfo({
            event: "email_queue_enqueued",
            emailId,
            requestId,
            queueJobId: job.id,
            queued_at: now,
        });
        return job;
    } catch (error: any) {
        logError({
            event: "email_queue_enqueue_failed",
            emailId,
            requestId,
            error: error?.message || String(error),
            stack: error?.stack,
        });
        throw error;
    }
};

const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job: Job) => {
        const queuedAt = Number(job.data?.queued_at || Date.now());
        const dequeuedAt = Date.now();
        const emailId = job.data?.emailId;

        logInfo({
            event: "email_job_dequeued",
            queueJobId: job.id,
            emailId,
            queued_at: queuedAt,
            dequeued_at: dequeuedAt,
            queue_wait_ms: Math.max(0, dequeuedAt - queuedAt),
            worker_pid: process.pid,
            hostname: os.hostname(),
            pod_name: process.env.POD_NAME || process.env.HOSTNAME || os.hostname(),
            workerName: WORKER_NAME,
        });

        try {
            logger.info(`Processing email job: ${job.name}:${job.id}`);
            job.data.queueJobId = job.id;
            await sendEmail(job.data);
            logger.info(`Email job ${job.name}:${job.id} processed`);
        } catch (error) {
            logger.error(`Email job ${job.name}:${job.id} failed`, error);
            throw error; // Allow BullMQ to retry
        }
    },
    {
        connection: bullmqConnection,
        concurrency: 5, // Process 5 jobs at a time
    }
);

(worker as any).on("ready", () => {
    logInfo({
        event: "email_worker_ready",
        workerName: WORKER_NAME,
    });
});

(worker as any).on("active", (job: Job) => {
    logInfo({
        event: "email_worker_active",
        queueJobId: job?.id,
        emailId: job?.data?.emailId,
        workerName: WORKER_NAME,
    });
});

worker.on("failed", (job: Job | undefined, err: Error) => {
    logError({
        event: "email_worker_failed",
        queueJobId: job?.id,
        emailId: job?.data?.emailId,
        workerName: WORKER_NAME,
        error: err?.message || String(err),
        stack: (err as any)?.stack,
    });
    logger.error(`Job ${job?.parentKey}:${job?.id} failed:`, err);
});

worker.on("completed", (job: Job) => {
    logInfo({
        event: "email_worker_completed",
        queueJobId: job?.id,
        emailId: job?.data?.emailId,
        workerName: WORKER_NAME,
    });
    logger.info(`Job ${job.name}:${job.id} completed`);
});

(worker as any).on("stalled", (jobId: string) => {
    logError({
        event: "email_worker_stalled",
        queueJobId: jobId,
        workerName: WORKER_NAME,
    });
});

(worker as any).on("error", (err: any) => {
    logError({
        event: "email_worker_error",
        workerName: WORKER_NAME,
        error: err?.message || String(err),
        stack: err?.stack,
    });
});

(worker as any).on("closing", () => {
    logInfo({
        event: "email_worker_closing",
        workerName: WORKER_NAME,
    });
});

(worker as any).on("closed", () => {
    logInfo({
        event: "email_worker_closed",
        workerName: WORKER_NAME,
    });
});

process.on("SIGTERM", async () => {
    logger.info("Shutting down email queue...");
    await worker.close();
    await emailQueue.close();
    logger.info("Email queue shut down.");
    process.exit(0);
});

export const addEmailJob = async (jobName: string, data: any, userId: number): Promise<void> => {
    const jobOptions: any = {};
    const jobToken = `${jobName}:user-${userId}`;
    await emailQueue.add(jobToken, data, jobOptions);
};
