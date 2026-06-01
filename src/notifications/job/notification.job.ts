import { Queue, Worker, Job, JobsOptions } from "bullmq";
import { getLogger } from '@/utils/logger';
import Notification from "../models/Notification.entity";
import NotificationService from "../services/notification.service";
import { getIO } from "@/utils/socket";
import { bullmqConnection } from "@/utils/bullmq/connection";
import NotificationFactory, { NotificationType } from "../services/notification-factory.service";

const logger = getLogger('notificationQueue');
const NOTIFICATION_QUEUE_NAME = "notificationQueue";

export const WANT_LIST_MATCH_JOB_NAME = "wantListMatch";

export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
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

const worker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job) => {
        try {
            logger.info(`Processing notification job: ${job.name}:${job.id}`);

            if (job.name.startsWith(WANT_LIST_MATCH_JOB_NAME)) {
                const { matchIds, doneeAccountId, keyword } = job.data as { matchIds: number[]; doneeAccountId: number; keyword: string };
                await NotificationFactory.createNotification(NotificationType.WANT_LIST_MATCH_FOUND, { matchIds, doneeAccountId, keyword });
                logger.info(`notification job ${job.name}:${job.id} processed (wantListMatch fan-out)`);
                return;
            }

            const { userId, type, payload } = job.data as { userId: string; type: string; payload: any; };

            const io = getIO();
            const notification = await Notification.create({ user_id: userId, type, payload, });
            io.to(`user_${userId}`).emit('new_notification', notification);

            logger.info(`notification job ${job.name}:${job.id} processed`);
        } catch (error) {
            logger.error(`notification job ${job.name}:${job.id} failed`, error);
            throw error;
        }
    }, { connection: bullmqConnection, concurrency: 5, }
);

worker.on("failed", (job, err) => {
    logger.error(`Job ${job?.parentKey}:${job?.id} failed:`, err);
});

worker.on("completed", (job) => {
    logger.info(`Job ${job.name}:${job.id} completed`);
});

process.on("SIGTERM", async () => {
    logger.info("Shutting down notification queue...");
    await worker.close();
    await notificationQueue.close();
    logger.info("notification queue shut down.");
    process.exit(0);
});

export async function addNotificationJob(jobType: string, data: { userId: string; type: string; payload: any }, opts?: JobsOptions) {
    const jobName = `${jobType}:user-${data.userId}`;
    return notificationQueue.add(jobName, data, opts);
}
