import { getLogger } from "@/utils/logger";
import { AppError } from "@/utils/response/appError";
import { QBOInvoiceService } from "@/qbo/invoice/invoice.service";
import { QBOPaymentService } from "@/qbo/payment/payment.service";
import Invoice, { InvoiceStatus } from "@/documents/models/Invoice.entity";
import Request from "@/properties/models/Request";
import { RequestStatusEnum } from "@/enums/request-property-status.enum";
import InvoiceActivityLog, { InvoiceActivity } from "@/documents/models/InvoiceActivityLogs.entity";
import envVars from "@/config/envvars";
import { createHmac } from "crypto";
import { withTransaction } from "@/utils/transactionalOperation";

const logger = getLogger("QBOWebhookService");

export interface WebhookPayload {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: Array<{
        id: string;
        operation: string;
        name: string;
        lastUpdated: string;
      }>;
    };
  }>;
}

export class QBOWebhookService {
  private qboInvoiceService: QBOInvoiceService;
  private qboPaymentService: QBOPaymentService;

  constructor() {
    this.qboInvoiceService = new QBOInvoiceService();
    this.qboPaymentService = new QBOPaymentService();
  }

  /**
   * Authenticate incoming webhook payload using HMAC-SHA256
   * Verifies that the webhook is genuinely from QBO
   * 
   * @param payload - Raw request body as string or buffer
   * @param intuitSignature - The intuit-signature header value
   * @throws AppError if webhook signature is invalid or webhook token not configured
   */
  authenticateWebhook(payload: string | Buffer, intuitSignature: string): void {
    const webhookToken = envVars.quickbooks.webhookToken;

    if (!webhookToken) {
      logger.error("QBO_WEBHOOK_TOKEN environment variable not set");
      throw new AppError(500, "Webhook token not configured");
    }

    if (!intuitSignature) {
      logger.warn("Missing intuit-signature header in webhook request");
      throw new AppError(401, "Missing intuit-signature header");
    }

    const payloadStr = Buffer.isBuffer(payload) ? payload.toString('utf-8') : payload;
    const computedSignature = createHmac('sha256', webhookToken).update(payloadStr).digest('base64');

    // Compare computed signature with provided signature
    if (computedSignature !== intuitSignature) {
      logger.warn('Webhook signature verification failed', {
        expected: intuitSignature.substring(0, 10) + '...',
        computed: computedSignature.substring(0, 10) + '...',
      });
      throw new AppError(401, 'Invalid webhook signature');
    }

    logger.info('Webhook signature verified successfully');
  }

  /**
   * Handle incoming QBO webhook notification
   * Currently handles invoice updates
   */
  async handleWebhook(payload: WebhookPayload): Promise<void> {
    logger.info('handleWebhook started..');
    if (!payload.eventNotifications || payload.eventNotifications.length === 0) {
      logger.warn("Webhook received with no event notifications");
      return;
    }

    for (const notification of payload.eventNotifications) {
      if (notification.dataChangeEvent?.entities.length === 0) {
        logger.error(`Webhook does not include entity continue to next one`);
        continue;
      }

      for (const entity of notification.dataChangeEvent.entities) {
        if (entity.name === "Payment") {
          await this.handlePaymentUpdate(entity.id);
        } else {
          logger.warn(`This event is not going to be proceed since it is not invoice related, entity.name:${entity.name}, entity.operation:${entity.operation}`);
        }
      }
    }
  }

  /**
   * Handle payment update from QBO webhook
   * Resolve linked invoice from payment, then verify invoice balance
   */
  private async handlePaymentUpdate(qboPaymentId: string): Promise<void> {
    try {
      logger.info("Processing payment webhook entity", { qboPaymentId });

      const qboPayment = await this.qboPaymentService.getById(qboPaymentId);

      if (!qboPayment) {
        logger.warn(`No QBO payment found for payment ID: ${qboPaymentId}`);
        return;
      }

      const qboInvoiceId = this.qboPaymentService.getLinkedInvoiceId(qboPayment);

      if (!qboInvoiceId) {
        logger.warn(`No linked invoice found on QBO payment ID: ${qboPaymentId}`);
        return;
      }

      logger.info("Resolved invoice id from payment webhook", {
        qboPaymentId,
        qboInvoiceId,
        paymentTotal: qboPayment.TotalAmt,
        unappliedAmount: qboPayment.UnappliedAmt,
      });

      const invoice = await Invoice.findOne({ where: { qbo_ref_id: qboInvoiceId }, include: [{ model: Request, as: "request" }] });

      if (!invoice) {
        logger.warn(`No local invoice found for QBO invoice ID: ${qboInvoiceId}`);
        return;
      }

      logger.info("Matched local invoice for payment webhook", {
        qboPaymentId,
        qboInvoiceId,
        localInvoiceId: invoice.id,
        invoiceNo: invoice.invoice_no,
        invoiceStatus: invoice.status,
        requestId: invoice.request?.id || null,
      });

      if (!invoice.request) {
        logger.error(`No request found for this qboInvoice${qboInvoiceId}, american-surplus invoice no:${invoice.invoice_no}`);
        return;
      }

      const qboInvoice = await this.qboInvoiceService.getById(qboInvoiceId);
      logger.info("Fetched QBO invoice for payment webhook", {
        qboPaymentId,
        qboInvoiceId,
        qboInvoiceBalance: qboInvoice.Balance,
        qboInvoiceDocNumber: qboInvoice.DocNumber,
      });

      if (qboInvoice.Balance == 0 && invoice.status !== InvoiceStatus.PAID) {
        logger.info(`Invoice no:${invoice.invoice_no} payment detected from QBO payment:${qboPaymentId}`);

        await withTransaction(async (transaction) => {

          await invoice.update({ status: InvoiceStatus.PAID }, { transaction });
          await Request.update({ status: RequestStatusEnum.COMPLETED }, { where: { id: invoice?.request?.id }, transaction });
          await InvoiceActivityLog.create({
            invoice_id: invoice.id,
            activity: InvoiceActivity.INVOICE_PAID,
            metadata: { invoice_no: invoice.invoice_no, qbo_ref_id: qboInvoiceId, qbo_payment_id: qboPaymentId },
            activator: "Incoming-Webhook", //
          }, { transaction });

          logger.info("Webhook payment transaction committed", {
            qboPaymentId,
            qboInvoiceId,
            localInvoiceId: invoice.id,
            invoiceNo: invoice.invoice_no,
            updatedInvoiceStatus: InvoiceStatus.PAID,
            updatedRequestStatus: RequestStatusEnum.COMPLETED,
            requestId: invoice?.request?.id,
          });
        })
      } else {
        logger.warn("Skipping payment webhook update", {
          qboPaymentId,
          qboInvoiceId,
          qboInvoiceBalance: qboInvoice.Balance,
          localInvoiceStatus: invoice.status,
          localInvoiceId: invoice.id,
          invoiceNo: invoice.invoice_no,
        });
      }
    } catch (error) {
      logger.error(`Failed to handle payment update for QBO payment ID ${qboPaymentId}:`, { error: error instanceof Error ? error.message : String(error), });
      // Don't throw - webhook should not fail if processing a single invoice fails
      // Log and continue to process other entities
    }
  }
}
