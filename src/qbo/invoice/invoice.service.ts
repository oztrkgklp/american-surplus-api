import OAuthClient from 'intuit-oauth';
import { InvoiceData, CreateInvoiceDto, UpdateInvoiceDto, InvoiceQueryResult } from './invoice.interface';
import Request from '@/properties/models/Request';
import { QBOAuthService } from '../auth/auth.service';
import { QBOHttpService } from '../services/qbo-http.service';
import { getLogger } from '@/utils/logger';

const logger = getLogger('QBOInvoiceService');

/**
 * QuickBooks Online Invoice Service
 * Handles invoice-related operations
 */
export class QBOInvoiceService {
    private httpService: QBOHttpService;

    constructor() {
        const authService = new QBOAuthService();
        this.httpService = new QBOHttpService(authService);
    }

    /**
     * Create a new invoice
     */
    async create(invoiceData: CreateInvoiceDto): Promise<InvoiceData> {
        const response = await this.httpService.makeApiCall('/invoice', 'POST', {
            'Content-Type': 'application/json'
        }, invoiceData);
        logger.info('QBO create invoice response', { response: response?.json });
        return response.json.Invoice;
    }

    /**
     * Get invoice by ID
     */
    async getById(id: string): Promise<InvoiceData> {
        const response = await this.httpService.makeApiCall(`/invoice/${id}`, 'GET');
        logger.info('QBO get invoice by id response', { invoiceId: id, response: response?.json });
        return response.json.Invoice;
    }

    /**
     * Update invoice
     */
    async update(invoiceData: UpdateInvoiceDto): Promise<InvoiceData> {
        const response = await this.httpService.makeApiCall('/invoice', 'POST', {
            'Content-Type': 'application/json'
        }, invoiceData);
        logger.info('QBO update invoice response', { response: response?.json });
        return response.json.Invoice;
    }

    /**
     * Delete invoice (set inactive)
     */
    async delete(Id: string, SyncToken: string): Promise<any> {
        // Delete with both Id and SyncToken
        const response = await this.httpService.makeApiCall('/invoice?operation=delete', 'POST',
            { 'Content-Type': 'application/json' },
            { Id, SyncToken });

        logger.info('QBO delete invoice response', { invoiceId: Id, syncToken: SyncToken, response: response?.json });
        return response.json;
    }

    /**
     * Cancel (void) invoice in QBO.
     * Use this for cancellation flows instead of delete.
     */
    async cancel(Id: string, SyncToken: string): Promise<any> {
        const response = await this.httpService.makeApiCall('/invoice?operation=void', 'POST',
            { 'Content-Type': 'application/json' },
            { Id, SyncToken });

        logger.info('QBO cancel (void) invoice response', { invoiceId: Id, syncToken: SyncToken, response: response?.json });
        return response.json;
    }

    /**
     * Query invoices
     */
    async query(query: string): Promise<InvoiceData[]> {
        const response = await this.httpService.makeApiCall(`/query?query=${encodeURIComponent(query)}`, 'GET');
        logger.info('QBO invoice query response', { query, response: response?.json });
        return response.json.QueryResponse?.Invoice || [];
    }

    /**
     * Get all invoices
     */
    async getAll(): Promise<InvoiceData[]> {
        const query = 'SELECT * FROM Invoice';
        return this.query(query);
    }

    /**
     * Find invoices by customer ID
     */
    async findByCustomer(customerId: string): Promise<InvoiceData[]> {
        const query = `SELECT * FROM Invoice WHERE CustomerRef = '${customerId}'`;
        return this.query(query);
    }

    /**
     * Find invoices by date range
     */
    async findByDateRange(startDate: string, endDate: string): Promise<InvoiceData[]> {
        const query = `SELECT * FROM Invoice WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`;
        return this.query(query);
    }

    /**
     * Send invoice by email
     */
    async sendByEmail(id: string, emailAddress?: string): Promise<void> {
        const data = emailAddress ? { SendTo: emailAddress } : {};
        const response = await this.httpService.makeApiCall(`/invoice/${id}/send`, 'POST', {
            'Content-Type': 'application/json'
        }, data);
        logger.info('QBO send invoice email response', { invoiceId: id, emailAddress, response: response?.json });
    }

    /**
     * Get invoice PDF
     */
    async getPdf(id: string): Promise<Buffer> {
        const response = await this.httpService.makeApiCall(`/invoice/${id}/pdf`, 'GET');
        logger.info('QBO get invoice pdf response', { invoiceId: id, bodyLength: response?.body?.length });
        return Buffer.from(response.body);
    }

    /**
     * Generate invoice data from request and asset information
     * Creates detailed line items for each property with complete information
     * without relying on pre-created QBO items
     */
    static generateInvoiceData(request: Request, invoiceNo: string, invoiceDate: Date, dueDate: Date, assetInformation: any): CreateInvoiceDto {
        if (!request.doneeAccount?.qbo_ref_id) throw new Error('Donee account does not have a QBO customer reference ID');

        const lines: any[] = [];

        assetInformation.propertyDetails.forEach((property: any) => {
            const description = [
                `TCN: ${request.tcn}`,
                `ICN: ${property.assetId}`,
                `Property: ${property.description}`,
                `Quantity: ${property.quantity}`,
                `UOM: ${property.uom || 'N/A'}`,
                `Fee Percentage: ${property.stateFeePercentage || 'N/A'}%`,
                property.original_value ? `OAC: $${Number(property.original_value).toFixed(2)}` : undefined,
                property.isFlatFee ? `Flat Fee: ${property.isFlatFee}` : undefined
            ].filter(Boolean).join(' | ');

            lines.push({
                DetailType: 'SalesItemLineDetail',
                Description: description,
                Amount: property.lineTotal,
                SalesItemLineDetail: {
                    Qty: 1,
                    UnitPrice: property.lineTotal
                }
            });
        });

        return {
            CustomerRef: { value: request.doneeAccount.qbo_ref_id },
            Line: lines,
            TxnDate: invoiceDate.toISOString().split('T')[0],
            DueDate: dueDate.toISOString().split('T')[0],
            DocNumber: invoiceNo
        };
    }
}
