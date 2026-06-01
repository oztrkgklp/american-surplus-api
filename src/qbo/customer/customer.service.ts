import OAuthClient from 'intuit-oauth';
import { CustomerData, CreateCustomerDto, UpdateCustomerDto, CustomerQueryResult } from './customer.interface';
import Organization from '../../organization/models/Organization';
import DoneeAccount from '../../organization/models/DoneeAccount';
import { OrganizationAddressService } from '@/organization/services/organizationAddress.service';
import { QBOAuthService } from '../auth/auth.service';
import { QBOHttpService } from '../services/qbo-http.service';
import { getLogger } from '@/utils/logger';

const logger = getLogger('QBOCustomerService');

/**
 * QuickBooks Online Customer Service
 * Handles customer-related operations
 */
export class QBOCustomerService {
    private httpService: QBOHttpService;

    constructor() {
        const authService = new QBOAuthService();
        this.httpService = new QBOHttpService(authService);
        logger.info('QBO customer service initialized');
    }

    /**
     * Create a new customer
     */
    async create(customerData: CreateCustomerDto): Promise<CustomerData> {
        logger.info('Creating QBO customer', { displayName: customerData?.DisplayName });
        logger.info('Customer Payload', customerData);
        const response = await this.httpService.makeApiCall('/customer', 'POST', {
            'Content-Type': 'application/json'
        }, customerData);

        logger.info('QBO create customer response', { response: response?.json });
        logger.info('QBO create customer full response', JSON.stringify(response?.json));

        return response.json.Customer;
    }

    /**
     * Get customer by ID
     */
    async getById(id: string): Promise<CustomerData> {
        logger.info('Fetching QBO customer by id', { customerId: id });
        const response = await this.httpService.makeApiCall(`/customer/${id}`, 'GET');
        logger.info('QBO get customer by id response', { customerId: id, response: response?.json });
        return response.json.Customer;
    }

    /**
     * Update customer
     */
    async update(customerData: UpdateCustomerDto): Promise<CustomerData> {
        logger.info('Updating QBO customer', { customerId: customerData?.Id });
        const response = await this.httpService.makeApiCall('/customer', 'POST', {
            'Content-Type': 'application/json'
        }, customerData);
        logger.info('QBO update customer response', { response: response?.json });
        return response.json.Customer;
    }

    /**
     * Delete customer (set inactive)
     */
    async delete(id: string): Promise<void> {
        logger.info('Deleting QBO customer', { customerId: id });
        const response = await this.httpService.makeApiCall('/customer?operation=delete', 'POST', {
            'Content-Type': 'application/json'
        }, { Id: id });
        logger.info('QBO delete customer response', { customerId: id, response: response?.json });
    }

    /**
     * Query customers
     */
    async query(query: string): Promise<CustomerData[]> {
        logger.info('Running QBO customer query', { query });
        const response = await this.httpService.makeApiCall(`/query?query=${encodeURIComponent(query)}`, 'GET');
        const customers = response.json.QueryResponse?.Customer || [];
        logger.info('QBO customer query response', { query, resultCount: customers.length, response: response?.json });
        return customers;
    }

    /**
     * Get all customers
     */
    async getAll(): Promise<CustomerData[]> {
        const query = 'SELECT * FROM Customer';
        return this.query(query);
    }

    /**
     * Find customer by name
     */
    async findByName(name: string): Promise<CustomerData[]> {
        const query = `SELECT * FROM Customer WHERE Name LIKE '%${name}%'`;
        return this.query(query);
    }

    /**
     * Find customer by email
     */
    async findByEmail(email: string): Promise<CustomerData[]> {
        const query = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email}'`;
        return this.query(query);
    }

    /**
     * Generate customer data from organization
     */
    static async generateCustomerData(organization: Organization, displayName: string, opts?: { primaryPhone?: string; primaryEmail?: string },): Promise<CreateCustomerDto> {
        await OrganizationAddressService.hydrateCompatMailingOnOrganization(organization);
        const phone = (opts?.primaryPhone ?? '').trim();
        const email = (opts?.primaryEmail ?? '').trim();
        logger.info('Generating QBO customer payload from organization', {
            organizationId: organization?.id,
            displayName,
            hasEmail: Boolean(email),
            hasPhone: Boolean(phone),
        });
        const org = organization as Organization & {
            mailing_address_line1?: string;
            mailing_city?: string;
            mailing_state?: string;
            mailing_zip?: string;
        };
        return {
            DisplayName: displayName,
            CompanyName: organization.name,
            BillAddr: {
                Line1: org.mailing_address_line1 ?? '',
                City: org.mailing_city ?? '',
                CountrySubDivisionCode: org.mailing_state ?? '',
                PostalCode: org.mailing_zip ?? '',
            },
            PrimaryPhone: {
                FreeFormNumber: phone || '',
            },
            PrimaryEmailAddr: {
                Address: email || '',
            },
        };
    }
}
