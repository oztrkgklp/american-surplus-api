import { QBOAuthService } from "../auth/auth.service";
import { QBOHttpService } from "../services/qbo-http.service";
import { getLogger } from "@/utils/logger";
import { LinkedTxn, PaymentData } from "./payment.interface";

const logger = getLogger("QBOPaymentService");

/**
 * QuickBooks Online Payment Service
 * Handles payment-related operations
 */
export class QBOPaymentService {
    private httpService: QBOHttpService;

    constructor() {
        const authService = new QBOAuthService();
        this.httpService = new QBOHttpService(authService);
    }

    /**
     * Get payment by ID via QBO query endpoint.
     * Webhook entity ids for Payment events map to the QBO Payment Id.
     */
    async getById(id: string): Promise<PaymentData | null> {
        logger.info("Fetching QBO payment by id", { paymentId: id });
        const payments = await this.query(`SELECT * FROM Payment WHERE Id = '${id}'`);
        const payment = payments[0] || null;

        logger.info("QBO get payment by id response", {
            paymentId: id,
            found: Boolean(payment),
            linkedTxnCount: (payment?.Line || []).reduce((count, line) => count + (line.LinkedTxn?.length || 0), 0)
        });
        return payment;
    }

    /**
     * Query payments
     */
    async query(query: string): Promise<PaymentData[]> {
        const response = await this.httpService.makeApiCall(`/query?query=${encodeURIComponent(query)}`, "GET");
        logger.info("QBO payment query response", { query, response: response?.json });
        return response.json.QueryResponse?.Payment || [];
    }

    /**
     * Extract the first linked invoice id from a payment.
     */
    getLinkedInvoiceId(payment: PaymentData): string | null {
        const linkedTransactions = (payment.Line || []).flatMap(line => line.LinkedTxn || []);

        logger.info("Inspecting payment linked transactions", {
            paymentId: payment.Id,
            linkedTransactions: linkedTransactions.map(linkedTxn => ({
                txnId: linkedTxn.TxnId,
                txnType: linkedTxn.TxnType
            }))
        });

        const invoiceTxn = linkedTransactions.find((linkedTxn: LinkedTxn) => linkedTxn.TxnType === "Invoice" && linkedTxn.TxnId);
        logger.info("Resolved linked invoice from payment", { paymentId: payment.Id, invoiceId: invoiceTxn?.TxnId || null });
        return invoiceTxn?.TxnId || null;
    }
}
