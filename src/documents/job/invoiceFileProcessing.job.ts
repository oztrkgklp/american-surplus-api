import { Queue, Worker } from "bullmq";
import { getLogger } from "@/utils/logger";
import { InvoiceFileProcessingService } from "../services/invoice-file-processing.service";
import { bullmqConnection as connection } from "@/utils/bullmq/connection";

const logger = getLogger("invoiceQueue");
const QUEUE_NAME = "invoiceQueue";

const EXPORT_JOB = "invoiceExportJob";
const IMPORT_JOB = "invoiceImportJob";
const PAYMENT_CHECK_JOB = "paymentCheckJob";

export function initInvoiceFileProcessingCron() {
    const invoiceQueue = new Queue(QUEUE_NAME, { connection });

    // Export job: runs daily at 6 PM
    invoiceQueue.add(
        EXPORT_JOB,
        {},
        {
            repeat: { cron: "0 18 * * *" } as any,
            jobId: EXPORT_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    // Import job: runs daily at 9 PM
    invoiceQueue.add(
        IMPORT_JOB,
        {},
        {
            repeat: { cron: "0 21 * * *" } as any,
            jobId: IMPORT_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    // Payment check job: runs daily at 5:30 AM
    invoiceQueue.add(
        PAYMENT_CHECK_JOB,
        {},
        {
            repeat: { cron: "30 5 * * *" } as any,
            jobId: PAYMENT_CHECK_JOB,
            removeOnComplete: true,
            attempts: 3,
        }
    );

    new Worker(
        QUEUE_NAME,
        async job => {
            switch (job.name) {
                case EXPORT_JOB:
                    logger.info("Invoice export job triggered");
                    await InvoiceFileProcessingService.exportInvoicesToCsv();
                    logger.info("Invoice export job completed");
                    break;
                case IMPORT_JOB:
                    logger.info("Invoice import job triggered");
                    await InvoiceFileProcessingService.importQboStatusFromCsv();
                    logger.info("Invoice import job completed");
                    break;
                case PAYMENT_CHECK_JOB:
                    logger.info("Payment check job triggered");
                    await InvoiceFileProcessingService.checkAndUpdatePaymentStatus();
                    logger.info("Payment check job completed");
                    break;
                default:
                    logger.warn(`No handler for job: ${job.name}`);
            }
        },
        { connection }
    );

    process.on("SIGINT", async () => {
        logger.info("Shutting down invoiceQueue...");
        await new Queue(QUEUE_NAME, { connection }).close();
        process.exit(0);
    });
}
