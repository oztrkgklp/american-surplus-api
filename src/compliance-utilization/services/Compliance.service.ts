import Property from '@/properties/models/Property';
import { Op, Order, Transaction } from 'sequelize';
import fs from 'fs/promises';
import Compliance, { ComplianceStatus } from '../models/Compliance.entity';
import { PropertyStatusEnum, RequestStatusEnum } from '@/enums/request-property-status.enum';
import { AppError } from '@/utils/response/appError';
import DoneeAccount from '@/organization/models/DoneeAccount';
import Request from '@/properties/models/Request'
import { StoragePaths } from '@/utils/storage/paths';
import { fileExists, saveUploadedFile } from '@/utils/storage/fileSystem';
import ComplianceAttachment from '../models/ComplianceAttachment.entity';
import ComplianceActivityLog, { ComplianceActivty } from '../models/ComplianceActivityLogs.entity';
import { addMonthsSafe } from '@/utils/timeHelper';
import { getLogger } from '@/utils/logger';
import { TemplateEnum } from '@/enums/mailEnum';
import { emailQueue } from '@/utils/mail/emailQueue';
import { renderEmail } from '@/utils/mail/render';
import UserScope from '@/authz/models/UserScope';
import User from '@/authn/models/User';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import { PaginatedResult, PaginationMeta, PaginationParams } from '@/utils/pagination-db/paginations.interface';
import Organization from '@/organization/models/Organization';
import { ComplianceFilterKeys } from '@/enums/complianceFilterKeys.enum';
import { getSequelizeDateCondition, getSequelizeTimestampCondition, getSequelizeCaseInsensitiveCondition, getSequelizeCondition, filtersFromLegacy, shouldApplyFilter, type FilterSpec } from '@/utils/filteringOperations';
import { database } from '@/utils/database';
const logger = getLogger('Compliance Service');


export class ComplianceService {
    /**
     * Handles the uploading of compliance evidence for a property.
     * - Loads the property and its associations (request, donee account).
     * - Validates property status and compliance status.
     * - Creates or updates a Compliance record as needed.
     * - Saves the uploaded evidence file to the appropriate storage directory.
     * - Creates a ComplianceAttachment record for the uploaded file.
     * - Logs the evidence submission activity.
     * 
     * @param payload - Contains propertyId, file, fileName, and uploadedBy.
     * @param transaction - Optional Sequelize transaction for atomic operations.
     * @returns The updated or created Compliance and ComplianceAttachment records.
     * @throws Error if property not found, or if property/compliance status is invalid.
     */
    static async uploadEvidence(payload: { propertyId: number, file: any, fileName: string, uploadedBy: string, description: string }, transaction?: Transaction): Promise<{ compliance: Compliance, complianceAttachment: ComplianceAttachment }> {
        // Load the property with its full chain of associations
        const property = await Property.findByPk(payload.propertyId, {
            include: [{
                model: Request,
                as: 'request',
                include: [{
                    model: DoneeAccount,
                    as: 'doneeAccount',
                }]
            }]
        });

        if (!property || !property.property_status) throw new Error('Property not found');
        if (property.property_status === PropertyStatusEnum.FULLY_TRANSFERRED) throw new AppError(400, "Property is fully transferred no evidence required!");

        const acceptablePropertyStatuses = [PropertyStatusEnum.PICKUP_APPROVED, PropertyStatusEnum.IN_SERVICE] as string[];
        if (!acceptablePropertyStatuses.includes(property.property_status)) throw new AppError(400, "Property is not picked up nor in service!");

        const requestId = property.request_id;
        const organizationId = property.request?.doneeAccount?.organizationId as string;
        const doneeAccountId = property.request?.donee_account as number;

        const storageDir = StoragePaths.private
            .orgs.org(organizationId)
            .donees.donee(doneeAccountId.toString())
            .requests.request(requestId.toString())
            .path;


        let compliance = await Compliance.findOne({ where: { property_id: property.property_id }, transaction });

        if (!compliance) {
            // First time: in_service evidence compliance record
            if (!property.property_pickup_date) throw new AppError(400, "Property pickup date is missing!");
            const pickupDate = new Date(property.property_pickup_date);
            const twelveMonthsLater = addMonthsSafe(pickupDate, 12).getTime();
            if (Date.now() > twelveMonthsLater) throw new AppError(400, "Cannot submit evidence: 12 months have passed since pickup date.");

            // Create initial metadata array with the first evidence submission
            const metadata = [{ description: payload.description, uploadedBy: payload.uploadedBy, uploadedAt: new Date().toISOString() }];
            compliance = await Compliance.create({
                donee_account_id: doneeAccountId,
                request_id: requestId,
                property_id: property.property_id,
                status: ComplianceStatus.EVIDENCE_SUBMITTED,
                metadata
            }, { transaction });
        } else {
            // There is already a compliance record
            const acceptableComplianceStatuses = [ComplianceStatus.AWAITING_EVIDENCE, ComplianceStatus.EVIDENCE_SUBMITTED, ComplianceStatus.EVIDENCE_REJECTED] as string[];
            if (compliance.next_reporting_date && Date.now() > compliance.next_reporting_date) throw new AppError(400, 'Cannot submit evidence: reporting period has passed.');
            if (!acceptableComplianceStatuses.includes(compliance.status)) throw new AppError(400, 'Evidence can only be submitted when compliance status is awaiting evidence or evidence rejected.');

            const metadata = [...compliance.metadata, { description: payload.description, uploadedBy: payload.uploadedBy, uploadedAt: new Date().toISOString() }];
            await compliance.update({ status: ComplianceStatus.EVIDENCE_SUBMITTED, metadata }, { transaction });
        }

        const filePath = await saveUploadedFile(payload.file.buffer, storageDir, payload.file.originalname);
        const metadata = { originalName: payload.file.originalname, mimeType: payload.file.mimetype, size: payload.file.size };
        const complianceAttachment = await ComplianceAttachment.create({ compliance_id: compliance.id, file_path: filePath, metadata }, { transaction })

        await this.logActivity({ compliance, activity: ComplianceActivty.EVIDENCE_SUBMITTED, activator: payload.uploadedBy }, transaction);
        await NotificationFactory.createNotification(NotificationType.COMPLIANCE_EVIDENCE_SUBMITTED, { property });
        return { compliance, complianceAttachment };
    }

    /**
     * Approves or rejects submitted compliance evidence for a property.
     * - Loads the property and compliance record.
     * - Validates property and compliance status.
     * - If rejected, updates compliance status and logs activity.
     * - If approved, determines if property is fully transferred or enters restrictive use period.
     * - Handles first-time restrictive use setup and subsequent reporting periods.
     * - Updates property and compliance records, logs activity.
     * 
     * @param payload - Contains propertyId, isApproved, reviewedBy, and optional complianceDetails.
     * @param transaction - Optional Sequelize transaction for atomic operations.
     * @returns The updated Compliance record.
     * @throws Error if property/compliance not found, or if status is invalid.
     */
    static async approveOrRejectEvidence(payload: { propertyId: number, isApproved: boolean, reviewedBy: string, complianceDetails?: { period?: number, term_months?: number, comments?: string, transferFully?: boolean }, }, transaction?: Transaction) {
        // Load the property with its full chain of associations
        const property = await Property.findByPk(payload.propertyId, {
            include: [{
                model: Request,
                as: 'request',
                include: [{
                    model: DoneeAccount,
                    as: 'doneeAccount',
                    attributes: ['id', 'organizationId']
                }]
            }]
        });

        if (!property || !property.property_status) throw new Error('Property not found');
        if (property.property_status === PropertyStatusEnum.FULLY_TRANSFERRED) throw new AppError(400, "Property is fully transferred no approval required!");

        const acceptablePropertyStatuses = [PropertyStatusEnum.PICKUP_APPROVED, PropertyStatusEnum.IN_SERVICE] as string[];
        if (!acceptablePropertyStatuses.includes(property.property_status)) throw new AppError(400, "Property is not picked up nor in service!");

        const compliance = await Compliance.findOne({ where: { property_id: property.property_id }, transaction });
        if (!compliance) throw new AppError(400, "No complience record exist for this property");

        const acceptableComplianceStatuses = [ComplianceStatus.AWAITING_EVIDENCE, ComplianceStatus.EVIDENCE_REJECTED, ComplianceStatus.EVIDENCE_SUBMITTED] as string[];
        if (!acceptableComplianceStatuses.includes(compliance.status)) throw new AppError(400, 'Evidence can only be reviewed when compliance status is awaiting evidence/evidence rejected/evidence submitted.');

        //EVIDENCE REJECTED 
        if (!payload.isApproved) {
            await compliance.update({ status: ComplianceStatus.EVIDENCE_REJECTED }, { transaction });
            await this.logActivity({ compliance, activity: ComplianceActivty.EVIDENCE_REJECTED, activator: payload.reviewedBy, comments: payload.complianceDetails?.comments }, transaction);
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_EVIDENCE_REJECTED, { property });
            return { compliance };
        }

        //fully transfer if oac < 5k or special fsc code exist sasp sends it
        if (payload.complianceDetails?.transferFully) {
            property.update({ property_status: PropertyStatusEnum.FULLY_TRANSFERRED }, { transaction });
            await compliance.update({ status: ComplianceStatus.FULLY_TRANSFERRED }, { transaction });
            await this.logActivity({ compliance, activity: ComplianceActivty.FULLY_TRANSFERED, activator: payload.reviewedBy, comments: payload.complianceDetails?.comments }, transaction)
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_EVIDENCE_APPROVED, { property });
            return { compliance };
        }

        //ALREADY IN RESTRICTIVE USE PERIOD
        if (compliance.term_start) {
            const periodMonths = compliance.period_months;
            // next reporting date is actually last reporting date that we have, we should add period to that for getting next reporting date.
            const lastReportingDate = compliance.next_reporting_date;
            if (lastReportingDate == null) throw new AppError(400, 'Last reporting date is missing.');
            const nextReportingDate = new Date(new Date(lastReportingDate).setMonth(new Date(lastReportingDate).getMonth() + periodMonths!)).getTime();

            if (nextReportingDate > compliance.term_end!) {
                property.update({ property_status: PropertyStatusEnum.FULLY_TRANSFERRED }, { transaction });
                await compliance.update({ status: ComplianceStatus.FULLY_TRANSFERRED }, { transaction });
                await this.logActivity({ compliance, activity: ComplianceActivty.FULLY_TRANSFERED, activator: payload.reviewedBy, comments: payload.complianceDetails?.comments }, transaction)
                return { compliance };
            }
            await compliance.update({ status: ComplianceStatus.IN_RESTRICTIVE_USE_PERIOD, next_reporting_date: nextReportingDate }, { transaction });
            await this.logActivity({ compliance, activity: ComplianceActivty.EVIDENCE_APPROVED, activator: payload.reviewedBy, comments: payload.complianceDetails?.comments }, transaction);
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_EVIDENCE_APPROVED, { property });
            return { compliance };
        } else {
            //PROPERTY WAS IN SERVICE NOW WILL BE IN RESTRICTIVE USE FOR THE FIRST TIME !

            //first time approval must provide term and period!
            if (!payload.complianceDetails?.period || !payload.complianceDetails?.term_months) throw new AppError(400, 'Period and term month is required for restrictive use!');

            const periodMonths = payload.complianceDetails?.period;
            const termMonths = payload.complianceDetails?.term_months;
            const termStart = Date.now();
            const termEnd = addMonthsSafe(new Date(termStart), termMonths).getTime();
            const firstNextReport = addMonthsSafe(new Date(termStart), periodMonths).getTime();

            await property.update({ property_status: PropertyStatusEnum.IN_SERVICE }, { transaction });
            await compliance.update({
                status: ComplianceStatus.IN_RESTRICTIVE_USE_PERIOD,
                term_start: termStart,
                term_end: termEnd,
                period_months: periodMonths,
                term_months: termMonths,
                next_reporting_date: firstNextReport,
            }, { transaction });

            await this.logActivity({ compliance, activity: ComplianceActivty.EVIDENCE_APPROVED, activator: payload.reviewedBy, comments: payload.complianceDetails?.comments }, transaction)
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_EVIDENCE_APPROVED, { property });
            return { compliance };
        }
    }

    /**
     * Apply a single FilterSpec to the compliance filter context. Mutates ctx.
     * Compliance-keyed filters MERGE into complianceWhere (rather than overwrite) so multi-filter
     * across compliance fields (e.g. status + term_start) works correctly.
     */
    private static applyComplianceFilter(
        ctx: { propertyWhere: Record<string, unknown>; complianceWhere: Record<string, unknown>; complianceRequired: boolean },
        filter: FilterSpec,
    ): void {
        const { key, op, value } = filter;
        if (!key || !shouldApplyFilter(op, value)) return;
        const sequelize = database.sequelize;

        switch (key as ComplianceFilterKeys) {
            case ComplianceFilterKeys.PROPERTY_NAME:
                ctx.propertyWhere.property_name = getSequelizeCaseInsensitiveCondition(sequelize, 'property_name', op, value);
                break;
            case ComplianceFilterKeys.PROPERTY_CONTROL_NUMBER:
                ctx.propertyWhere.property_control_number = getSequelizeCaseInsensitiveCondition(sequelize, 'property_control_number', op, value);
                break;
            case ComplianceFilterKeys.PROPERTY_STATUS:
                ctx.propertyWhere.property_status = getSequelizeCaseInsensitiveCondition(sequelize, 'property_status', op, value);
                break;
            case ComplianceFilterKeys.PROPERTY_TYPE:
                ctx.propertyWhere.property_type = getSequelizeCaseInsensitiveCondition(sequelize, 'property_type', op, value);
                break;
            case ComplianceFilterKeys.PROPERTY_QUANTITY:
                ctx.propertyWhere.property_quantity = getSequelizeCondition(op, value, 'number');
                break;
            case ComplianceFilterKeys.COMPLIANCE_STATUS:
                ctx.complianceWhere.status = getSequelizeCondition(op, value);
                ctx.complianceRequired = true;
                break;
            case ComplianceFilterKeys.PROPERTY_SURPLUS_RELEASE_DATE:
                ctx.propertyWhere.property_surplus_release_date = getSequelizeTimestampCondition(op, value);
                break;
            case ComplianceFilterKeys.PROPERTY_ALLOCATED_DATE:
                ctx.propertyWhere.property_allocated_date = getSequelizeTimestampCondition(op, value);
                break;
            case ComplianceFilterKeys.TERM_START:
                ctx.complianceWhere.term_start = getSequelizeTimestampCondition(op, value);
                ctx.complianceRequired = true;
                break;
            case ComplianceFilterKeys.TERM_END:
                ctx.complianceWhere.term_end = getSequelizeTimestampCondition(op, value);
                ctx.complianceRequired = true;
                break;
            case ComplianceFilterKeys.TERM_MONTHS:
                ctx.complianceWhere.term_months = getSequelizeCondition(op, value, 'number');
                ctx.complianceRequired = true;
                break;
            case ComplianceFilterKeys.PERIOD_MONTHS:
                ctx.complianceWhere.period_months = getSequelizeCondition(op, value, 'number');
                ctx.complianceRequired = true;
                break;
            case ComplianceFilterKeys.CREATED_AT:
                ctx.propertyWhere.createdAt = getSequelizeDateCondition(op, value);
                break;
        }
    }

    /**
     * Build where clause and order for compliance list queries.
     */
    private static buildComplianceListFilterAndOrder(
        filterKey?: ComplianceFilterKeys,
        operator: string = 'contains',
        filterValue?: string,
        sortBy: string = 'createdAt',
        sortOrder: 'asc' | 'desc' = 'desc',
        filters?: FilterSpec[],
    ): { propertyWhere: Record<string, unknown>; complianceWhere?: Record<string, unknown>; complianceRequired: boolean; order: Order } {
        const ctx = {
            propertyWhere: {} as Record<string, unknown>,
            complianceWhere: {} as Record<string, unknown>,
            complianceRequired: false,
        };

        const effective = filtersFromLegacy(filterKey, operator, filterValue, filters);
        for (const filter of effective) {
            this.applyComplianceFilter(ctx, filter);
        }

        const complianceWhere = Object.keys(ctx.complianceWhere).length ? ctx.complianceWhere : undefined;

        const dir = (sortOrder === 'asc' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
        const sortField = sortBy || 'createdAt';
        const complianceFields = new Set(['term_start', 'term_end', 'term_months', 'period_months', 'compliance_status']);
        let order: Order;
        if (complianceFields.has(sortField)) {
            order = [['compliance', sortField === 'compliance_status' ? 'status' : sortField, dir]];
        } else {
            order = [[sortField, dir]];
        }

        return { propertyWhere: ctx.propertyWhere, complianceWhere, complianceRequired: ctx.complianceRequired, order };
    }

    /**
    *  Fetch all properties for donee accounts in a given state,
    *  including any existing compliance record.
    * @param stateId        – filter by DoneeAccount.stateId
    * @param pagination     – { limit, offset } for pagination
    */
    static async getPropertiesForSaspByState(
        stateId: number,
        { page, limit }: PaginationParams,
        sortBy?: string,
        sortOrder?: 'asc' | 'desc',
        filterKey?: ComplianceFilterKeys,
        operator: string = 'contains',
        filterValue?: string,
        filters?: FilterSpec[],
    ): Promise<PaginatedResult<Property>> {
        const offset = (page - 1) * limit;
        const { propertyWhere, complianceWhere, complianceRequired, order } = this.buildComplianceListFilterAndOrder(
            filterKey,
            operator,
            filterValue,
            sortBy || 'createdAt',
            sortOrder || 'desc',
            filters,
        );

        const allowedRequestStatuses = [
            RequestStatusEnum.PARTIALLY_ALLOCATED,
            RequestStatusEnum.ALLOCATED,
            RequestStatusEnum.AWATING_PICKUP_APPROVAL,
            RequestStatusEnum.INVOICE_REQUIRED,
            RequestStatusEnum.INVOICE_SIGNATURE_REQUIRED,
            RequestStatusEnum.COMPLETED,
        ];

        const result = await Property.findAndCountAll({
            where: propertyWhere,
            limit,
            offset,
            order,
            include: [
                {
                    model: Request,
                    as: 'request',
                    where: {
                        status: allowedRequestStatuses,
                    },
                    include: [
                        {
                            model: DoneeAccount,
                            as: 'doneeAccount',
                            where: { stateId },
                        },
                    ],
                },
                {
                    model: Compliance,
                    as: 'compliance',
                    required: complianceRequired,
                    ...(complianceWhere && Object.keys(complianceWhere).length ? { where: complianceWhere } : {}),
                },
            ],
        });

        const totalItems = result.count;
        const totalPages = Math.ceil(totalItems / limit);
        const meta: PaginationMeta = {
            totalItems,
            totalPages,
            currentPage: page,
            pageSize: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };

        return { data: result.rows, meta, };
    }

    /**
     *Given a doneeAccountId, fetch all its properties
     * and include any compliance (alias: 'compliance').
     */
    static async getPropertiesByDoneeAccountId(
        doneeAccountId: number,
        { page, limit }: PaginationParams,
        sortBy?: string,
        sortOrder?: 'asc' | 'desc',
        filterKey?: ComplianceFilterKeys,
        operator: string = 'contains',
        filterValue?: string,
        filters?: FilterSpec[],
    ): Promise<PaginatedResult<Property>> {
        const offset = (page - 1) * limit;
        const { propertyWhere, complianceWhere, complianceRequired, order } = this.buildComplianceListFilterAndOrder(
            filterKey,
            operator,
            filterValue,
            sortBy || 'createdAt',
            sortOrder || 'desc',
            filters,
        );

        const allowedRequestStatuses = [
            RequestStatusEnum.PARTIALLY_ALLOCATED,
            RequestStatusEnum.ALLOCATED,
            RequestStatusEnum.AWATING_PICKUP_APPROVAL,
            RequestStatusEnum.INVOICE_REQUIRED,
            RequestStatusEnum.INVOICE_SIGNATURE_REQUIRED,
            RequestStatusEnum.COMPLETED,
        ];

        const result = await Property.findAndCountAll({
            where: propertyWhere,
            limit,
            offset,
            order,
            include: [
                {
                    model: Request,
                    as: 'request',
                    where: { donee_account: doneeAccountId, status: allowedRequestStatuses },
                },
                {
                    model: Compliance,
                    as: 'compliance',
                    required: complianceRequired,
                    ...(complianceWhere && Object.keys(complianceWhere).length ? { where: complianceWhere } : {}),
                },
            ],
        });

        // Build pagination metadata
        const totalItems = result.count;
        const totalPages = Math.ceil(totalItems / limit);
        const meta: PaginationMeta = {
            totalItems,
            totalPages,
            currentPage: page,
            pageSize: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };

        return { data: result.rows, meta, };
    }

    /**
      * Fetch a single property by ID, including its compliance and attachments.
      *
      * @param propertyId – the ID of the Property
      */
    static async getPropertyWithComplianceDetails(propertyId: number): Promise<Property | null> {
        return Property.findByPk(propertyId, {
            include: [
                {
                    model: Compliance,
                    as: 'compliance',
                    required: false,
                    include: [
                        {
                            model: ComplianceAttachment,
                            as: 'attachments',
                            required: false,
                        },
                    ],
                },
            ],
        });
    }


    /**
     * Checks properties with status PICKUP_APPROVED.
     * - Warns 2 weeks before the 1-year pickup anniversary
     * - Logs overdue if 1 year has passed without transfer
     */
    static async processInServiceCompliance(transaction?: Transaction): Promise<void> {
        const now = new Date();
        const warningThresholdMs = 14 * 24 * 60 * 60 * 1000; // 2 weeks

        //  • approaching one-year anniversary: pickup_date ∈ [now–12mo, now+2w–12mo)
        const windowStart = addMonthsSafe(now, -12);
        const windowEnd = addMonthsSafe(new Date(now.getTime() + warningThresholdMs), -12);

        // 1) “About to hit one year” → send warning email & notification
        const approaching = await Property.findAll({
            where: {
                property_status: PropertyStatusEnum.PICKUP_APPROVED,
                property_pickup_date: {
                    [Op.gte]: windowStart.getTime(),
                    [Op.lt]: windowEnd.getTime(),
                },
            },
            include: [{
                model: Request,
                as: 'request',
                include: [{
                    model: DoneeAccount,
                    as: 'doneeAccount',
                    include: [{
                        model: Organization,
                        as: 'organization',
                    }],
                }],
            }],
            transaction,
        });

        await Promise.all(approaching.map(async (prop) => {
            const doneeId = prop.request?.doneeAccount?.id;
            if (!doneeId) {
                logger.warn(`Property ${prop.property_id} has no doneeAccount`);
                return;
            }

            await this.sendComplianceEmailToDonee(prop, doneeId, TemplateEnum.COMPLIANCE_IN_SERVICE_WARNING,);
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_IN_SERVICE_WARNING, { property: prop },);
            logger.info(`Sent in-service warning for property ${prop.property_id}`);
        }));

        // 2) “Already overdue” → only notification
        const overdue = await Property.findAll({
            where: {
                property_status: PropertyStatusEnum.PICKUP_APPROVED,
                property_pickup_date: {
                    [Op.lte]: addMonthsSafe(now, -12).getTime(),
                },
            },
            include: [{
                model: Request,
                as: 'request',
                include: [{
                    model: DoneeAccount,
                    as: 'doneeAccount',
                    include: [{
                        model: Organization,
                        as: 'organization',
                    }],
                }],
            }],
            transaction,
        });

        await Promise.all(overdue.map(async (prop) => {
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_OVERDUE, { property: prop },);
            logger.info(`Sent in-service overdue notice for property ${prop.property_id}`);
        }));
    }

    /**
    * Checks compliance records for properties in service.
    * - Flags AWAITING_EVIDENCE 2 weeks before next reporting date
    * - Logs overdue evidence after reporting date passes
    */
    static async processRestrictiveUseCompliance(transaction?: Transaction): Promise<void> {
        const now = new Date();
        const warningThresholdMs = 14 * 24 * 60 * 60 * 1000; // 2 weeks
        const warningWindowEnd = new Date(now.getTime() + warningThresholdMs);

        const allowedStatuses = [ComplianceStatus.AWAITING_EVIDENCE, ComplianceStatus.EVIDENCE_REJECTED,];

        // 1) "Approaching due date": next_reporting_date in (now, now + 14d]
        const approaching = await Compliance.findAll({
            where: {
                next_reporting_date: {
                    [Op.gt]: now.getTime(),
                    [Op.lte]: warningWindowEnd.getTime(),
                },
                status: { [Op.notIn]: allowedStatuses },
            },
            include: [
                {
                    model: Property,
                    as: 'property',
                    where: { property_status: PropertyStatusEnum.IN_SERVICE },
                    include: [{
                        model: Request,
                        as: 'request',
                        include: [{
                            model: DoneeAccount,
                            as: 'doneeAccount',
                            include: [{
                                model: Organization,
                                as: 'organization',
                            }],
                        }],
                    }],
                },
            ],
            transaction,
        });

        await Promise.all(approaching.map(async (compliance) => {
            await compliance.update({ status: ComplianceStatus.AWAITING_EVIDENCE }, { transaction });
            await this.logActivity({ compliance, activity: ComplianceActivty.AWAITING_EVIDENCE, activator: 'system' }, transaction);
            await this.sendComplianceEmailToDonee(compliance.property as Property, compliance.donee_account_id, TemplateEnum.COMPLIANCE_PERIOD_WARNING);
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_PERIOD_WARNING, { compliance },); logger.info(`Evidence due soon for compliance ${compliance.id}`);
        }));
        // 2) "Overdue": next_reporting_date ≤ now AND status = AWAITING_EVIDENCE
        const overdue = await Compliance.findAll({
            where: {
                next_reporting_date: { [Op.lte]: now.getTime() },
                status: ComplianceStatus.AWAITING_EVIDENCE,
            },
            include: [
                {
                    model: Property,
                    as: 'property',
                    where: { property_status: PropertyStatusEnum.IN_SERVICE },
                    include: [{
                        model: Request,
                        as: 'request',
                        include: [{
                            model: DoneeAccount,
                            as: 'doneeAccount',
                            include: [{
                                model: Organization,
                                as: 'organization',
                            }],
                        }],
                    }],
                },
            ],
            transaction,
        });

        await Promise.all(overdue.map(async (compliance) => {
            // (Optional) update is idempotent here
            await compliance.update({ status: ComplianceStatus.AWAITING_EVIDENCE }, { transaction });
            await this.logActivity({ compliance, activity: ComplianceActivty.OVERDUE, activator: 'system' }, transaction);
            await NotificationFactory.createNotification(NotificationType.COMPLIANCE_OVERDUE, { property: compliance.property as Property },);
            logger.info(`Evidence overdue for compliance ${compliance.id}`);
        }));
    }


    // 2) Helper to log activity
    private static async logActivity(payload: { compliance: Compliance, activity: ComplianceActivty, activator: string, comments?: string }, transaction?: Transaction) {
        const { compliance, activity, activator, comments } = payload;
        await ComplianceActivityLog.create({ compliance_id: compliance.id, activity, activator, metadata: comments, }, { transaction });
    }

    // function to send related emails to the client
    static async sendComplianceEmailToDonee(property: Property, doneeAccountId: number, templateName: TemplateEnum): Promise<void> {
        if (!doneeAccountId) throw new AppError(400, "Donee account could not found!");

        const headAuthOfficial = await UserScope.findOne({
            where: { donee_account_id: doneeAccountId, is_head_representative: true },
            include: [{ model: User, as: 'user' }]
        });

        if (!headAuthOfficial || !headAuthOfficial.user) throw new AppError(404, 'Head authorized official not found');

        const renderData = { templateName, data: { name: headAuthOfficial.user.name, property, } };
        const mailContent = await renderEmail(renderData);

        const mailData = {
            to: headAuthOfficial.user.email as string,
            subject: 'Compliance Notification',
            html: mailContent as string,
        };

        await emailQueue.add('complianceNotification', mailData, { removeOnComplete: true, attempts: 3 });
    }


    /**
     * Retrieves a compliance attachment's file buffer and metadata by attachment ID.
     * @param attachmentId - The ID of the ComplianceAttachment
     * @returns An object containing buffer, originalName, and mimeType
     * @throws AppError if attachment not found or file cannot be read
     */
    static async getComplianceAttachment(attachmentId: number): Promise<{ buffer: Buffer, originalName: string, mimeType: string }> {
        const attachment = await ComplianceAttachment.findByPk(attachmentId);
        if (!attachment) throw new AppError(404, 'Compliance attachment not found');

        // Check if file exists before reading
        const exists = await fileExists(attachment.file_path);
        if (!exists) throw new AppError(404, 'File not found on disk');

        const buffer = await fs.readFile(attachment.file_path);
        const { originalName, mimeType } = attachment.metadata as any;
        return { buffer, originalName, mimeType: String(mimeType) };
    }
}