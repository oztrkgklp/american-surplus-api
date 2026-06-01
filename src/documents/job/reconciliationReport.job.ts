import { Queue, Worker } from "bullmq";
import { getLogger } from "@/utils/logger";
import { ReconciliationReportService } from "../services/reconciliation-report.service";
import { bullmqConnection as connection } from "@/utils/bullmq/connection";

const logger = getLogger("reconciliationReportQueue");
const QUEUE_NAME = "reconciliationReportQueue";
const RECONCILIATION_JOB = "reconciliationReportJob";

export function initReconciliationReportCron() {
    const queue = new Queue(QUEUE_NAME, { connection });

    // Runs at 15th of every month at 01:00 AM
    queue.add(
        RECONCILIATION_JOB,
        {},
        {
            repeat: { cron: "0 1 15 * *" } as any,
            jobId: RECONCILIATION_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    new Worker(
        QUEUE_NAME,
        async job => {
            switch (job.name) {
                case RECONCILIATION_JOB:
                    logger.info("Reconciliation report job triggered");
                    await ReconciliationReportService.generateMonthlyReport();
                    logger.info("Reconciliation report job completed");
                    break;
                default:
                    logger.warn(`No handler for job: ${job.name}`);
            }
        },
        { connection }
    );

    process.on("SIGINT", async () => {
        logger.info("Shutting down reconciliationReportQueue...");
        await queue.close();
        process.exit(0);
    });
}
