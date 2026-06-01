import { FindAndCountOptions, Op, Transaction, where } from 'sequelize';
import User from '@/authn/models/User';
import State from '@/states/models/State';
import Request from '@/properties/models/Request';
import Property from '@/properties/models/Property';
import DoneeAccount from '@/organization/models/DoneeAccount';
import { cache } from '@/utils/cache';
import { cacheKeys } from '@/utils/cache/keys';
import { AppError } from '@/utils/response/appError';
import { paginateSequelize } from '@/utils/pagination';
import { sanitizeSequelizeUpdates } from '@/utils/validators';
import Organization from '@/organization/models/Organization';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import { RequestStatusEnum } from '@/enums/request-property-status.enum';
import { RequestFilterKeys } from '@/enums/requestFilterKeys.enum';
import { database } from '@/utils/database';
import { getSequelizeCondition, getSequelizeDateCondition, getSequelizeTimestampCondition, getSequelizeCaseInsensitiveCondition, filtersFromLegacy, shouldApplyFilter, type FilterSpec } from '@/utils/filteringOperations';
import Invoice, { InvoiceStatus } from '@/documents/models/Invoice.entity';
import InvoiceActivityLog, { InvoiceActivity } from '@/documents/models/InvoiceActivityLogs.entity';
import { QBOInvoiceService } from '@/qbo/invoice/invoice.service';
import OrganizationAddress from '@/organization/models/OrganizationAddress';

export class RequestService {
   /**
    * Fetch all requests for a specific organization by its ID across all its donee accounts.
    * @param organizationId - Organization ID to filter requests.
    * @returns A list of requests scoped to the organization ID.
    * @throws AppError if no requests are found for the organization.
    */
   static async getAllRequestsByOrganizationId(organizationId: string, page: number, limit: number, filterKey?: RequestFilterKeys, operator?: string, filterValue?: string, sortBy?: string, sortOrder?: string, filters?: FilterSpec[]) {
      const effective = filtersFromLegacy(filterKey, operator, filterValue, filters);
      const query = organizationId
         ? this.generateRequestsQuery(undefined, organizationId, effective, sortBy, sortOrder)
         : {};

      const requests = await paginateSequelize<Request>(Request, page, limit, query);

      return requests;
   }

   /**
    * Get counts of requests grouped by status for a specific organization
    * Always returns unfiltered counts for all statuses
    * @param organizationId - The ID of the organization to get request counts for
    * @returns Object containing counts for each request status
    */
   static async getAllRequestsCounts(organizationId: string) {
      const whereClause: any = {
         '$doneeAccount.organizationId$': organizationId,
      };


      const counts = await Request.findAll({
         attributes: [
            'status',
            [database.sequelize.fn('COUNT', database.sequelize.col('Request.id')), 'count']
         ],
         where: whereClause,
         include: [
            {
               model: DoneeAccount,
               as: 'doneeAccount',
               required: true,
               attributes: []
            }
         ],
         group: ['status']
      });

      // Transform the results into a more usable format
      const statusCounts = counts.reduce((acc: Record<string, number>, curr: any) => {
         acc[curr.status] = parseInt(curr.getDataValue('count'));
         return acc;
      }, {});

      // Initialize all possible statuses with 0 count
      Object.values(RequestStatusEnum).forEach(status => {
         if (!statusCounts[status]) {
            statusCounts[status] = 0;
         }
      });

      return statusCounts;
   }

   /**
    * Fetch a request by its ID.
    * @param requestId - The ID of the request.
    * @returns The requested object if found.
    * @throws AppError if the request is not found.
    */
   static async getRequestById(requestId: number, useCacheRecord = true) {
      const requestCache = cacheKeys.request;
      const cacheKey = requestCache.key(requestId.toString());

      if (useCacheRecord) {
         const cachedRequest = await cache.get<Request>(cacheKey);
         if (cachedRequest) {
            return cachedRequest;
         }
      }

      const request = await Request.findByPk(requestId, {
         include: [
            {
               model: DoneeAccount,
               as: 'doneeAccount',
               include: [
                  {
                     model: State,
                     as: 'state',
                  },
                  {
                     model: Organization,
                     as: 'organization',
                     include: [
                        {
                           model: OrganizationAddress,
                           as: 'organization_addresses'
                        }
                     ]
                  },
               ],
            },
            {
               model: User,
               as: 'requestorUser',
               attributes: ['id', 'name', 'email'],
            },
         ],
      });

      if (!request) {
         throw new AppError(404, 'Request not found');
      }

      const ttl = requestCache.ttl;

      // Set cache for the request
      await cache.set<Request>(cacheKey, request, ttl);

      return request;
   }

   /**
    * Create a new request.
    * @param requestData - The request data.
    * @returns The newly created request object.
    */
   static async createRequest(requestorUserId: string, doneeAccountId: number, transaction?: Transaction) {
      const request = await Request.create(
         {
            requestor: requestorUserId,
            donee_account: doneeAccountId,
            status: RequestStatusEnum.PENDING,
         },
         { transaction }
      );

      const requestCache = cacheKeys.request;
      const cacheKey = requestCache.key(request.id.toString());
      const ttl = requestCache.ttl;

      // Set cache for the new request
      await cache.set<Request>(cacheKey, request, ttl);

      return request;
   }

   /**
    * Update the TCN (Transaction Control Number) for a request.
    * @param requestId - The ID of the request.
    * @param tcn - The TCN value to update.
    * @returns The updated request object.
    * @throws AppError if the request is not found.
    */
   static async updateRequestTcn(requestId: number, tcn: string, transaction?: Transaction) {
      if (!tcn) {
         throw new AppError(400, 'TCN is required');
      }

      // Reuse getRequestById for consistency, but skip cache check
      const request = await this.getRequestById(requestId, false);

      if (!request) {
         throw new AppError(404, 'Request not found');
      }

      if (!sanitizeSequelizeUpdates(request, { tcn })) {
         throw new AppError(400, 'No changes detected');
      }

      const requestCache = cacheKeys.request;

      if (request.tcn === tcn) {
         throw new AppError(400, 'No changes detected');
      }

      const updates: Partial<Request> = {
         tcn,
      };

      // Update the status if the request is new.
      if (request.status == RequestStatusEnum.PENDING) {
         updates.status = RequestStatusEnum.SUMITTED_TO_GSA;
      }

      const updatedRequest = await request.update(updates, { transaction });

      // Refresh the cache for the updated request
      await cache.deleteSmart(requestCache, updatedRequest.id);

      return updatedRequest;
   }

   /**
    * Update an existing request by its ID.
    * @param requestId - The ID of the request.
    * @param updates - The updates to apply.
    * @returns The updated request object.
    * @throws AppError if the request is not found.
    */
   static async updateRequest(requestId: number, updates: Partial<Request>, transaction?: Transaction) {
      // Reuse getRequestById for consistency, but skip cache to get fresh data
      const request = await this.getRequestById(requestId, false);
      if (!request) throw new AppError(404, 'Request not found');

      const requestCache = cacheKeys.request;
      await cache.deleteSmart(requestCache, request.id);

      return request.update(updates, {
         where: { id: requestId },
         transaction,
      });
   }

   /**
    * Get user by request id
    * @param requestId - The ID of the request.
    * @returns The user of request
    *  @throws AppError if the user is not found.
    */
   static async getUserByRequestId(requestId: number) {
      const request = await Request.findOne({
         where: { id: requestId },
         include: [
            {
               model: User,
               as: 'requestorUser', // Ensure this alias matches the association in your model
               attributes: ['id', 'name', 'email'], // Include desired user attributes
            },
         ],
      });

      if (!request || !request.requestorUser) {
         throw new AppError(404, 'User not found for the given request');
      }

      return request.requestorUser;
   }

   /**
    * Get user by request id
    * @param userId - The ID of the Sasp User.
    * @returns The requests in sasp user's state
    *  @throws AppError if the user or request is not found.
    */
   static async getAllSaspRequest(userId: string, page: number, limit: number, filterKey?: RequestFilterKeys, operator?: string, filterValue?: string, sortBy?: string, sortOrder?: string, filters?: FilterSpec[]) {
      const saspUser = await SaspUser.findOne({
         where: { userId },
      });

      if (!saspUser || saspUser.stateId === undefined) {
         throw new AppError(404, 'Sasp User not found');
      }

      const effective = filtersFromLegacy(filterKey, operator, filterValue, filters);
      const query = this.generateRequestsQuery(saspUser.stateId, undefined, effective, sortBy, sortOrder);

      const requests = await paginateSequelize<Request>(Request, page, limit, query);

      return requests;
   }

   /**
    * Apply a single FilterSpec to a Sequelize whereClause for request queries.
    * Mutates whereClause; AND-combination via sequential calls writing to distinct keys.
    * Edge case preserved: STATUS=allocated forces equals to avoid matching partially_allocated.
    */
   private static applyRequestFilter(whereClause: any, filter: FilterSpec): void {
      const { key, op, value } = filter;
      if (!key || !shouldApplyFilter(op, value)) return;
      const sequelize = database.sequelize;
      const loweredValue = typeof value === 'string' ? value.toLowerCase() : value;

      switch (key as RequestFilterKeys) {
         case RequestFilterKeys.ID:
            whereClause.id = getSequelizeCondition(op, value, 'number');
            break;
         case RequestFilterKeys.STATUS:
            const statusOp = loweredValue === 'allocated' ? 'equals' : op;
            whereClause.status = getSequelizeCaseInsensitiveCondition(sequelize, 'Request.status', statusOp, value);
            break;
         case RequestFilterKeys.ORGANIZATION:
            whereClause['$doneeAccount.organization.name$'] =
               getSequelizeCaseInsensitiveCondition(sequelize, 'doneeAccount.organization.name', op, value);
            break;
         case RequestFilterKeys.REQUESTOR:
            whereClause['$requestorUser.name$'] =
               getSequelizeCaseInsensitiveCondition(sequelize, 'requestorUser.name', op, value);
            break;
         case RequestFilterKeys.DONE_ACCOUNT:
            whereClause['$doneeAccount.name$'] =
               getSequelizeCaseInsensitiveCondition(sequelize, 'doneeAccount.name', op, value);
            break;
         case RequestFilterKeys.TCN:
            whereClause.tcn = getSequelizeCaseInsensitiveCondition(sequelize, 'Request.tcn', op, value);
            break;
         case RequestFilterKeys.CREATED_AT:
         case RequestFilterKeys.UPDATED_AT:
            whereClause[key === RequestFilterKeys.CREATED_AT ? 'createdAt' : 'updatedAt'] =
               getSequelizeDateCondition(op, value);
            break;
         case RequestFilterKeys.ALLOCATED_DATE: {
            /** A request has no allocated date column — filter on the earliest allocated date across its properties. */
            const earliestAllocatedDate = sequelize.literal(
               '(SELECT MIN(p.property_allocated_date) FROM properties AS p WHERE p.request_id = Request.id)',
            );
            whereClause[Op.and] = whereClause[Op.and] || [];
            if (op === 'doesNotEqual') {
               /** Each Op.or branch must be a complete where() — the subquery literal cannot be distributed across an Op.or value. */
               whereClause[Op.and].push({
                  [Op.or]: [
                     where(earliestAllocatedDate, getSequelizeTimestampCondition('isBefore', value)),
                     where(earliestAllocatedDate, getSequelizeTimestampCondition('isAfter', value)),
                  ],
               });
            } else {
               whereClause[Op.and].push(where(earliestAllocatedDate, getSequelizeTimestampCondition(op, value)));
            }
            break;
         }
      }
   }

   private static generateRequestsQuery(
      stateId?: number,
      organizationId?: string,
      filters: FilterSpec[] = [],
      sortBy: string = "createdAt",
      sortOrder: string = "DESC"
   ) {
      const whereClause: any = {};

      if (stateId) whereClause['$doneeAccount.stateId$'] = stateId;
      if (organizationId) whereClause['$doneeAccount.organizationId$'] = organizationId;

      for (const filter of filters) {
         this.applyRequestFilter(whereClause, filter);
      }

      let query: FindAndCountOptions<Request> = {
         where: whereClause,
         include: [
            {
               model: DoneeAccount,
               as: 'doneeAccount',
               required: true,
               attributes: ['id', 'name', 'organizationId', 'stateId'],
               include: [
                  {
                     model: Organization,
                     as: 'organization',
                     required: true,
                     attributes: ['id', 'name'],
                  },
                  {
                     model: State,
                     as: 'state',
                     attributes: ['stateId', 'stateName'],
                  },
               ],
            },
            {
               model: User,
               as: 'requestorUser',
               attributes: ['id', 'name'],
            },
            {
               model: Property,
               as: 'properties',
               required: false,
               limit: 3,
               order: [['createdAt', 'ASC']],
            },
         ],
      };


      const earliestAllocatedDateExpr = database.sequelize.literal(`(
         SELECT MIN(p.property_allocated_date)
         FROM properties AS p
         WHERE p.request_id = Request.id
      )`);

      const sortMapping: Record<string, any[]> = {
         createdAt: ['createdAt'],
         updatedAt: ['updatedAt'],
         id: ['id'],
         status: ['status'],
         tcn: ['tcn'],
         organization: [
            { model: DoneeAccount, as: 'doneeAccount' },
            { model: Organization, as: 'organization' },
            'name'
         ],
         doneeAccount: [
            { model: DoneeAccount, as: 'doneeAccount' },
            'name'
         ],
         requestor: [
            { model: User, as: 'requestorUser' },
            'name'
         ],
         allocated_date: [earliestAllocatedDateExpr],
      };

      const resolvedSort = sortMapping[sortBy] || ['createdAt'];
      const orderItem: any[] = Array.isArray(resolvedSort) ? [...resolvedSort] : [resolvedSort];
      orderItem.push(sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC');
      query.order = [orderItem as any];

      return query;
   }

   /**
    * Get counts of requests grouped by status for a specific state
    * Always returns unfiltered counts for all statuses
    * @param stateId - The ID of the state to get request counts for
    * @returns Object containing counts for each request status
    */
   static async getRequestCountsByStatus(stateId: number) {
      const whereClause: any = {
         '$doneeAccount.stateId$': stateId,
      };


      const counts = await Request.findAll({
         attributes: [
            'status',
            [database.sequelize.fn('COUNT', database.sequelize.col('Request.id')), 'count']
         ],
         where: whereClause,
         include: [
            {
               model: DoneeAccount,
               as: 'doneeAccount',
               required: true,
               attributes: []
            }
         ],
         group: ['status']
      });

      // Transform the results into a more usable format
      const statusCounts = counts.reduce((acc: Record<string, number>, curr: any) => {
         acc[curr.status] = parseInt(curr.getDataValue('count'));
         return acc;
      }, {});

      // Initialize all possible statuses with 0 count
      Object.values(RequestStatusEnum).forEach(status => {
         if (!statusCounts[status]) {
            statusCounts[status] = 0;
         }
      });

      return statusCounts;
   }

   public static async requestToMarkInvoiceAsPaid(payload: { requestAttachmentId: number, signedBy: User, memo?: string }, transaction?: Transaction) {
      const invoice = await Invoice.findOne({ where: { attachment_id: payload.requestAttachmentId } });
      if (!invoice) throw new AppError(404, 'Invoice not found');

      await invoice.update(
         {
            status: InvoiceStatus.PAYMENT_REQUESTED,
            ...(payload.memo && { memo_organization: payload.memo }),
         }, { transaction }
      );

      InvoiceActivityLog.create({
         invoice_id: invoice.id,
         activity: InvoiceActivity.INVOICE_PAYMENT_REQUESTED,
         metadata: {
            invoice_no: invoice.invoice_no,
         },
         activator: payload.signedBy.id,
      }, { transaction });
   }

   public static async markInvoiceAsPaid(payload: { requestAttachmentId: number, paidBy: User, memo?: string }, transaction?: Transaction) {
      const invoice = await Invoice.findOne({ where: { attachment_id: payload.requestAttachmentId } });
      if (!invoice) throw new AppError(404, 'Invoice not found');

      await invoice.update(
         {
            status: InvoiceStatus.PAID,
            ...(payload.memo && { memo_sasp: payload.memo }),
         }, { transaction }
      );

      InvoiceActivityLog.create({
         invoice_id: invoice.id,
         activity: InvoiceActivity.INVOICE_PAID,
         metadata: {
            invoice_no: invoice.invoice_no,
         },
         activator: payload.paidBy.id,
      }, { transaction });
   }

   /**
    * Attempt to cancel an invoice if it's unpaid and before 5 days past due.
    * Cancels (voids) the invoice in QBO when it has a reference ID.
    */
   public static async requestToCancelInvoice(payload: { requestAttachmentId: number, canceledBy: User }, transaction?: Transaction) {
      const invoice = await Invoice.findOne({ where: { attachment_id: payload.requestAttachmentId } });
      if (!invoice) throw new AppError(404, 'Invoice not found');

      // Ensure not already paid or cancelled
      if (invoice.status === InvoiceStatus.PAID) throw new AppError(400, 'This invoice is paid, so it cannot be canceled.');
      if (invoice.status === InvoiceStatus.CANCELED) throw new AppError(400, 'Invoice is already canceled');

      const dueDate = (invoice as any).due_date as Date | undefined | null;
      if (!dueDate) throw new AppError(400, 'Invoice due date not set');

      const now = Date.now();
      const overdueMs = now - new Date(dueDate).getTime();
      const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
      if (overdueMs > fiveDaysMs) throw new AppError(400, 'Invoice is beyond cancel window (more than 5 days past due)');

      // Cancel on QBO side if invoice has a QBO reference ID
      if (invoice.qbo_ref_id) {
         try {
            const qboInvoiceService = new QBOInvoiceService();
            // First, get the invoice from QBO to retrieve payment state and sync token
            const qboInvoice = await qboInvoiceService.getById(invoice.qbo_ref_id);
            if (!qboInvoice) throw new AppError(400, `Failed to fetch invoice from QBO side for invoice ${invoice.invoice_no}`);

            const isPaidInQbo = typeof qboInvoice.Balance === 'number' ? qboInvoice.Balance <= 0 : false;
            if (isPaidInQbo) throw new AppError(400, `Invoice ${invoice.invoice_no} is paid in QuickBooks and cannot be canceled.`);

            const syncToken = qboInvoice.SyncToken;
            if (!syncToken) throw new AppError(400, `Missing sync token for invoice ${invoice.invoice_no}`);

            const cancelResponse = await qboInvoiceService.cancel(invoice.qbo_ref_id, syncToken);
            if (!cancelResponse || !cancelResponse.Invoice || !cancelResponse.Invoice.Id) {
               throw new AppError(400, `Failed to cancel invoice on QBO side for invoice ${invoice.invoice_no}`);
            }
         } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(500, `Failed to cancel invoice in QBO: ${error instanceof Error ? error.message : 'Unknown error'}`);
         }
      }

      await invoice.update({ status: InvoiceStatus.CANCELED }, { transaction });
      InvoiceActivityLog.create({
         invoice_id: invoice.id,
         activity: InvoiceActivity.INVOICE_CANCELED,
         metadata: { invoice_no: invoice.invoice_no },
         activator: payload.canceledBy.id,
      }, { transaction });
   }

   public static async updateInvoiceMemo(attachmentId: number, memo_sasp?: string, memo_organization?: string, transaction?: Transaction) {
      const invoice = await Invoice.findOne({ where: { attachment_id: attachmentId } });
      if (!invoice) throw new AppError(404, 'Invoice not found');

      await invoice.update(
         {
            ...(memo_sasp && { memo_sasp }),
            ...(memo_organization && { memo_organization }),
         },
         { transaction }
      );
   }
}
