import { Op, Order, Transaction, FindAndCountOptions, WhereOptions } from 'sequelize';
import Property, { PropertyCreationAttributes } from '@/properties/models/Property';
import DoneeAccount from '@/organization/models/DoneeAccount';
import Request from '@/properties/models/Request';
import User from '@/authn/models/User';
import State from '@/states/models/State';
import { cache } from '@/utils/cache';
import { cacheKeys } from '@/utils/cache/keys';
import { paginateSequelize } from '@/utils/pagination';
import { PaginatedResponse } from '@/utils/pagination/interfaces';
import { AppError } from '@/utils/response/appError';
import { PropertyDataService } from '@/ppms/services/propertyData';
import { PropertyStatusEnum, RequestStatusEnum } from '@/enums/request-property-status.enum';
import { PropertyFSCCode } from '@/enums/property-fsc-code.enum';
import { PropertyFees } from '@/enums/propertyFees.enum';
import { SpecialPropertyAmericanSurplusFees } from '@/enums/propertyFees.enum';
import { PropertyFilterKeys } from '@/enums/propertyFilterKeys.enum';
import { getSequelizeCondition, getSequelizeDateCondition, getSequelizeTimestampCondition, getSequelizeCaseInsensitiveCondition, filtersFromLegacy, shouldApplyFilter, type FilterSpec } from '@/utils/filteringOperations';
import Organization from '@/organization/models/Organization';
import OrganizationUser from '@/organization/models/OrganizationUser';
import { database } from '@/utils/database';
import NotificationFactory, { NotificationType, } from '@/notifications/services/notification-factory.service';
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import UserScope from '@/authz/models/UserScope';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import { getLogger } from '@/utils/logger';
import RequestAttachment from '@/properties/models/RequestAttachment';
import Invoice from '@/documents/models/Invoice.entity';

export class PropertyService {
    /**
     * Fetch all properties for a specific request.
     * @param requestId - The ID of the request.
     * @param page - The page number for pagination.
     * @param limit - The number of items per page for pagination.
     * @returns A paginated list of properties for the given request.
     * @throws AppError if no properties are found.
     */
    static async getPaginatedPropertiesByRequestId(requestId: number, page = 1, limit = 10): Promise<PaginatedResponse<Property>> {

        const result = await paginateSequelize<Property>(Property, page, limit, { where: { request_id: requestId } });
        if (!result.items.length) throw new AppError(404, 'No properties found for this request');

        return result;
    }

    static async getAllPropertiesByRequestId(requestId: number, options?: { excludeIds?: number[], allocation?: boolean, isCanceled?: boolean, isDenied?: boolean }, transaction?: Transaction): Promise<Property[]> {
        const whereClause: any = { request_id: requestId };

        if (options?.excludeIds && options.excludeIds.length) {
            whereClause.property_id = {
                [Op.notIn]: options.excludeIds,
            };
        }

        if (options?.allocation !== undefined) {
            const operator = options.allocation === true ? Op.ne : Op.eq;
            whereClause.property_allocated_date = {
                [operator]: null,
            }
        }

        if (options?.isCanceled !== undefined) {
            const operator = options.isCanceled === true ? Op.eq : Op.ne;
            whereClause.is_cancelled = {
                [operator]: true,
            }
        }

        if (options?.isDenied !== undefined) {
            const operator = options.isDenied === true ? Op.eq : Op.ne;
            whereClause.is_denied = {
                [operator]: true,
            }
        }

        const result = await Property.findAll({
            where: whereClause,
            transaction,
        });

        return result;
    }


    /**
     * Determines the overall allocation status for a set of properties.
     * @param properties - Array of Property instances.
     * @returns The request status enum value.
     */
    static getRequestAllocationStatus(properties: Property[]): RequestStatusEnum | undefined {
        const active = properties.filter(p => !p.is_cancelled);
        if (active.length === 0) return RequestStatusEnum.CANCELED;

        const totalQty = active.reduce((sum, p) => sum + (p.property_quantity || 0), 0);
        const sumAllocated = active.reduce((sum, p) => sum + (p.property_allocated_quantity || 0), 0);
        const sumDenied = active.reduce((sum, p) => sum + (p.property_denied_quantity || 0), 0);

        if (sumAllocated === totalQty && sumDenied === 0) return RequestStatusEnum.ALLOCATED;
        if (sumDenied === totalQty && sumAllocated === 0) return RequestStatusEnum.DENIED;
        if (sumDenied === 0 && sumAllocated === 0) return

        if(sumAllocated > 0)
        return RequestStatusEnum.PARTIALLY_ALLOCATED; // revisit this logic => consider only denial but left 1-2 prop without allocation ?

        return;
    }



    /**
     * Fetch all properties for a specific request.
     * @param requestId - The ID of the request.
     * @returns A list of properties for the given request.
     * @throws AppError if no properties are found.
     */
    /** Apply a single FilterSpec to the per-request properties whereClause. Mutates whereClause. */
    private static applyRequestPropertyFilter(whereClause: any, filter: FilterSpec): void {
        const { key, op, value } = filter;
        if (!key || !shouldApplyFilter(op, value)) return;
        const sequelize = database.sequelize;

        switch (key as PropertyFilterKeys) {
            case PropertyFilterKeys.PROPERTY_ID:
                whereClause.property_id = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.REQUEST_ID:
                whereClause.request_id = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_QUANTITY:
                whereClause.property_quantity = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_CONTROL_NUMBER:
                whereClause.property_control_number =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_control_number', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_NAME:
                whereClause.property_name =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_name', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_ORIGINAL_VALUE:
                whereClause.property_original_value = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_TOTAL_VALUE:
                whereClause.property_total_value = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_STATUS:
                whereClause.property_status =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_status', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_DESCRIPTION:
                whereClause.property_description =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_description', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_JUSTIFICATION:
                whereClause.property_justification =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_justification', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_CANCELLATION_DATE:
                whereClause.property_cancellation_date = getSequelizeTimestampCondition(op, value);
                break;
            case PropertyFilterKeys.PROPERTY_DENIAL_DATE:
                whereClause.property_denial_date = getSequelizeTimestampCondition(op, value);
                break;
            case PropertyFilterKeys.PROPERTY_PICKUP_DATE:
                whereClause.property_pickup_date = getSequelizeTimestampCondition(op, value);
                break;
            case PropertyFilterKeys.PROPERTY_ALLOCATED_DATE:
                whereClause.property_allocated_date = getSequelizeTimestampCondition(op, value);
                break;
            case PropertyFilterKeys.UPDATED_AT:
                whereClause.updatedAt = getSequelizeDateCondition(op, value);
                break;
            case PropertyFilterKeys.CREATED_AT:
                whereClause.createdAt = getSequelizeDateCondition(op, value);
                break;
        }
    }

    static async getPropertiesByRequestId(requestId: number, sortBy?: string, sortOrder?: string, operator: string = 'contains', filterKey?: PropertyFilterKeys, filterValue?: string, filters?: FilterSpec[]): Promise<Property[]> {
        const whereClause: any = { request_id: requestId };

        const effective = filtersFromLegacy(filterKey, operator, filterValue, filters);
        for (const filter of effective) {
            this.applyRequestPropertyFilter(whereClause, filter);
        }

        const order = sortBy && sortOrder ? [[sortBy, sortOrder === 'asc' ? 'ASC' : 'DESC']] : undefined;

        const properties = await Property.findAll({
            where: whereClause,
            order: order as Order,
            include: [
                {
                    model: Request,
                    as: 'request',
                    required: true,
                    include: [
                        {
                            model: User,
                            as: 'requestorUser',
                            attributes: ['email'],
                        }
                    ],
                }
            ]
        });

        if (!properties.length) {
            throw new AppError(404, 'No properties found for this request');
        }

        return properties;
    }

    /**
     * Fetch a property by its ID.
     * @param propertyId - The ID of the property.
     * @returns The property object.
     */
    static async getPropertyById(propertyId: number): Promise<Property> {
        const cacheKey = cacheKeys.doneeProperty.key(propertyId.toString());

        const cachedProperty = await cache.get<Property>(cacheKey);
        if (cachedProperty) {
            return cachedProperty;
        }

        const property = await Property.findByPk(propertyId);
        if (!property) {
            throw new AppError(404, 'Property not found');
        }

        await cache.set(cacheKey, property);
        return property;
    }

    /**
     * Update an existing property by its ID.
     * @param propertyId - The ID of the property.
     * @param updates - The updates to apply.
     * @returns The updated property object.
     */
    static async updateProperty(propertyId: number, updates: Partial<PropertyCreationAttributes>, transaction?: Transaction): Promise<Property> {
        // Use the static update method and then fetch the updated record
        await Property.update(updates, {
            where: { property_id: propertyId },
            transaction,
        });

        // Fetch the updated property
        const updatedProperty = await Property.findByPk(propertyId, {
            transaction,
        });
        if (!updatedProperty) {
            throw new AppError(404, 'Updated property not found');
        }

        // Clear the cache
        await cache.deleteSmart(cacheKeys.doneeProperty, propertyId.toString());

        return updatedProperty;
    }

    /**
     * Create a new property for a specific request.
     * @param propertyData - The property data.
     * @returns The created property object.
     */
    static async createProperty(propertyData: PropertyCreationAttributes, transaction?: Transaction): Promise<Property> {
        if (propertyData.property_supply_condition?.trim() === '') propertyData.property_supply_condition = null;
        const property = await Property.create(propertyData, { transaction });

        const isCompeting = await this.isCompeting(propertyData.property_control_number);
        if (isCompeting) {
            await Property.update(
                { property_status: PropertyStatusEnum.COMPETING },
                {
                    where: {
                        property_control_number: property.property_control_number,
                        is_cancelled: false,
                        is_denied: false,
                    },
                    transaction,
                }
            );
        }

        const cacheKey = cacheKeys.doneeProperty.key(property.property_id.toString());
        await cache.set(cacheKey, property);

        return property;
    }

    static async isCompeting(icn: string): Promise<boolean> {
        const allProperties = await Property.findAll({ where: { property_control_number: icn, is_cancelled: false, is_denied: false } });
        if (!allProperties) return false;

        const property = await PropertyDataService.getPropertyDetails(icn);
        const propertyQuantity = property.data.quantity;
        const propertyRequestedQuantity = allProperties.reduce((sum, prop) => sum + (prop.property_quantity || 0), 0);

        return propertyRequestedQuantity > propertyQuantity ? true : false;
    }

    /**
     * Re-evaluates and updates the competing status for all properties with the given ICN.
     * Should be called after a property is cancelled or denied.
     * Only updates the competing flag if the cancellation/denial affects the competitions.
     * @param propertyId - The ID of the property being cancelled or denied.
     */
    static async updateCompetingStatusAfterChange(propertyId: number, transaction?: Transaction): Promise<void> {
        // Get the property being cancelled/denied
        const property = await Property.findByPk(propertyId, { transaction });
        if (!property) return;

        //if its not competeting at all then no need to check anything
        const hasCompetingFlag = property.property_status === PropertyStatusEnum.COMPETING;
        if (!hasCompetingFlag) return;

        const icn = property.property_control_number;

        // Get all non-cancelled properties for this ICN
        const allProperties = await Property.findAll({
            where: {
                property_control_number: icn,
                is_cancelled: false,
            },
            transaction,
        });

        // Calculate total requested quantity excluding the cancelled property and denied quantities
        const requestedQuantityExcludingCurrentProperty = allProperties
            .filter(p => p.property_id !== propertyId)
            .reduce((sum, p) => sum + ((p.property_quantity - (property.property_denied_quantity ?? 0)) || 0), 0);

        // Get the available quantity for this ICN
        const propertyDetails = await PropertyDataService.getPropertyDetails(icn);
        const availableQuantity = propertyDetails.data.quantity;

        //check isCompetingContinues after cancelled/denied if so no need to do anything
        const isCompetingContinues = requestedQuantityExcludingCurrentProperty >= availableQuantity;
        if (isCompetingContinues) return;


        // Update all non-cancelled, non-denied properties if icn is still in competitions
        await Property.update(
            { property_status: undefined },
            {
                where: {
                    property_control_number: icn,
                    is_cancelled: false,
                    is_denied: false,
                },
                transaction,
            }
        );
    }

    /** 
     * Checks duplicate properties by ICN for an organization.
     * @param icn - The ICN to search for.
     * @param doneeAccount - The DoneeAccount to search within.
     * @returns The property object if found, otherwise null.
     */
    static async checkDuplicatePropertyByICN(icn: string, doneeAccount: DoneeAccount, transaction?: Transaction) {
        const duplicate = await Property.findOne({
            where: {
                property_control_number: icn,
                is_cancelled: {
                    [Op.ne]: true
                }
            },
            include: [
                {
                    model: Request,
                    as: 'request',
                    required: true,
                    include: [
                        {
                            model: DoneeAccount,
                            as: 'doneeAccount',
                            required: true,
                            where: {
                                organizationId: doneeAccount.organizationId,
                            },
                        },
                    ],
                },
            ],
            transaction,
        });

        if (duplicate) {
            const requestedBy = duplicate.request?.donee_account;
            if (requestedBy === doneeAccount.id) {
                throw new AppError(400, 'You have already submitted a request for this property in this donee account.');
            } else {
                throw new AppError(400, 'This property has already been requested by another donee account in your organization.');
            }
        }
    }

    static async getRequestByUserId(userId: string, attributes: string[] = ['property_control_number'], includeCanceled: boolean = true) {
        let whereClause: WhereOptions<Property> = {};
        if (!includeCanceled) {
            whereClause = {
                is_cancelled: false,
            };
        }
        return Property.findAll({
            where: whereClause,
            attributes,
            include: [
                {
                    model: Request,
                    as: 'request',
                    required: true,
                    include: [
                        {
                            model: DoneeAccount,
                            as: 'doneeAccount',
                            required: true,
                            include: [
                                {
                                    model: Organization,
                                    as: 'organization',
                                    required: true,
                                    include: [
                                        {
                                            model: OrganizationUser,
                                            as: 'members',
                                            required: true,
                                            where: {
                                                userId: userId
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });
    }

    /**
     * Returns ICNs (property_control_number) that have been requested by the given donee account
     * (i.e. exist in the properties table linked to a request for this donee).
     * Used e.g. to mark want-list matches as already requested.
     */
    static async getRequestedControlNumbersByDoneeAccountId(
        doneeAccountId: number,
        includeCanceled = false,
    ): Promise<string[]> {
        const whereClause: WhereOptions<Property> = {};
        if (!includeCanceled) {
            whereClause.is_cancelled = false;
        }
        const properties = await Property.findAll({
            where: whereClause,
            attributes: ['property_control_number'],
            include: [
                {
                    model: Request,
                    as: 'request',
                    required: true,
                    where: { donee_account: doneeAccountId },
                },
            ],
        });
        return properties.map((p) => p.property_control_number);
    }

    /**
    * Check if there is a flat fee exist
    * @param icn - The ICN to search for.
    * @returns flat fee if conditions meet otherwise false
    */
    static async getFlatFeeIfExist(icn: string) {
        const property = await PropertyDataService.getPropertyDetails(icn);
        // IF NOT AIRCRAFT RETURN FALSE
        if (property.data.categoryCode !== 2) return false;

        // IF ITS DRONE RETURN FALSE
        if (property.data.fscCode === PropertyFSCCode.DRONES) return false;

        // IF ITS NASA ASSETS RETURN FALSE
        if (property.data.propertyPOC.email && property.data.propertyPOC.email.toLowerCase().includes('nasa')) return false;
        if (property.data.propertyCustodian.email && property.data.propertyCustodian.email.toLowerCase().includes('nasa')) return false;
        const nasaKeywords = ['nasa', 'national aeronautics space adm'];

        const containsNASAKeywords = (value?: string) =>
            value &&
            nasaKeywords.some(keyword => value.toLowerCase().includes(keyword));

        if (containsNASAKeywords(property.data.propertyLocation.line1)) return false;
        if (containsNASAKeywords(property.data.propertyLocation.line2)) return false;
        if (containsNASAKeywords(property.data.reportingAgencyAddress.line1)) return false;
        if (containsNASAKeywords(property.data.reportingAgencyAddress.line2)) return false;

        switch (property.data.conditionCode) {
            case 'N':
                return PropertyFees.NEW_UNUSED_AIRCRAFT;
            case 'U':
                return PropertyFees.USABLE_AIRCRAFT;
            case 'R':
                return PropertyFees.REPAIRABLE_AIRCRAFT;
            case 'X':
                return PropertyFees.SALVAGE_AIRCRAFT;
            case 'S':
                return PropertyFees.SCRAP_AIRCRAFT;
            default:
                return false;
        }
    }


    /**
    * if there is a flat fee exist call this method to get 
    * @param icn - The ICN to search for.
    * @returns flat fee if conditions meet otherwise false
    */
    static async getFlatAmericanSurplusFee(icn: string) {
        const property = await PropertyDataService.getPropertyDetails(icn);
        if (!property) throw new AppError(404, 'Property not found');

        switch (property.data.conditionCode) {
            case 'N':
                return SpecialPropertyAmericanSurplusFees.NEW_UNUSED_AIRCRAFT;
            case 'U':
                return SpecialPropertyAmericanSurplusFees.USABLE_AIRCRAFT;
            case 'R':
                return SpecialPropertyAmericanSurplusFees.REPAIRABLE_AIRCRAFT;
            case 'X':
                return SpecialPropertyAmericanSurplusFees.SALVAGE_AIRCRAFT;
            case 'S':
                return SpecialPropertyAmericanSurplusFees.SCRAP_AIRCRAFT;
            default:
                return false;
        }

    }


    /**
     * Finds a pending request ID for a donee account that already has a property
     * with a matching ICN prefix and location details.
     * @param icn - The property control number (ICN) to check (prefix match, first 10 chars).
     * @param doneeAccountId - The ID of the donee account.
     * @param surplusReleaseDate - The surplus release date of the property.
     * @param locationCity - The city of the property's location.
     * @param locationRegionState - The region/state of the property's location.
     * @param locationPostalCode - The postal code of the property's location.
     * @returns The request ID if a matching pending request exists, otherwise null.
     */
    static async geRequestIdFortMatchingProperty(
        icn: string,
        doneeAccountId: number,
        surplusReleaseDate: number,
        locationCity: string,
        locationRegionState: string,
        locationPostalCode: string
    ): Promise<number | null> {
        const prefixLength = 6;
        const icnPrefix = icn.substring(0, prefixLength);

        const existingProperty = await Property.findOne({
            where: {
                property_control_number: {
                    [Op.like]: `${icnPrefix}%`
                },
                property_surplus_release_date: surplusReleaseDate,
                property_location_city: locationCity,
                property_location_region_state: locationRegionState,
                property_location_postal_code: locationPostalCode
            },
            include: [
                {
                    model: Request,
                    as: 'request',
                    required: true,
                    where: {
                        donee_account: doneeAccountId,
                        status: RequestStatusEnum.PENDING,
                    }
                }
            ]
        });

        if (existingProperty?.request) return existingProperty.request.id;

        return null;
    }


    static async getAllPropertiesByOrganizationId(organizationId: string, page: number, limit: number, filterKey?: PropertyFilterKeys, operator?: string, filterValue?: string, sortBy?: string, sortOrder?: string, filters?: FilterSpec[]) {
        const properties = await this.getAllPropertiesWithFiltering(organizationId, undefined, page, limit, filterKey, operator, filterValue, sortBy, sortOrder, filters);
        return properties;
    }

    static async getAllPropertiesByStateId(stateId: number, page: number, limit: number, filterKey?: PropertyFilterKeys, operator?: string, filterValue?: string, sortBy?: string, sortOrder?: string, filters?: FilterSpec[]) {
        const properties = await this.getAllPropertiesWithFiltering(undefined, stateId, page, limit, filterKey, operator, filterValue, sortBy, sortOrder, filters);
        return properties;
    }

    /**
     * Get all properties with filtering and pagination for a specific organization or state
     * @param organizationId - Organization ID to filter properties
     * @param stateId - State ID to filter properties
     * @param page - Page number for pagination
     * @param limit - Number of items per page
     * @param filterKey - Filter key to apply
     * @param operator - Filter operator
     * @param filterValue - Filter value
     * @param sortBy - Field to sort by
     * @param sortOrder - Sort order (ASC/DESC)
     * @returns Paginated properties with request and organization information
     */
    static async getAllPropertiesWithFiltering(
        organizationId?: string,
        stateId?: number,
        page: number = 1,
        limit: number = 10,
        filterKey?: PropertyFilterKeys,
        operator?: string,
        filterValue?: string,
        sortBy?: string,
        sortOrder?: string,
        filters?: FilterSpec[]
    ) {
        const effective = filtersFromLegacy(filterKey, operator, filterValue, filters);
        const query = this.generatePropertiesQuery(organizationId, stateId, effective, sortBy, sortOrder);
        const properties = await paginateSequelize<Property>(Property, page, limit, query);

        // Hydrate one invoice-backed attachment per request after pagination to avoid hasMany join duplication.
        const requestIds = Array.from(
            new Set(
                properties.items
                    .map((property) => property.request?.id)
                    .filter((requestId): requestId is number => typeof requestId === 'number')
            )
        );

        if (requestIds.length) {
            const invoiceAttachments = await RequestAttachment.findAll({
                where: { request_id: { [Op.in]: requestIds } },
                include: [
                    {
                        model: Invoice,
                        as: 'invoice',
                        required: true,
                        attributes: ['id', 'status', 'invoice_no', 'attachment_id'],
                    },
                ],
                order: [['id', 'DESC']],
            });

            const invoiceAttachmentByRequestId = new Map<number, RequestAttachment>();
            for (const attachment of invoiceAttachments) {
                if (!invoiceAttachmentByRequestId.has(attachment.request_id)) {
                    invoiceAttachmentByRequestId.set(attachment.request_id, attachment);
                }
            }

            for (const property of properties.items) {
                const requestId = property.request?.id;
                if (!requestId || !property.request) continue;
                const attachment = invoiceAttachmentByRequestId.get(requestId);
                (property.request as any).setDataValue(
                    'attachments',
                    attachment ? [attachment] : []
                );
            }
        }

        return properties;
    }

    /**
     * Generate query options for properties with filtering and sorting
     * @param organizationId - Organization ID to filter by
     * @param stateId - State ID to filter by
     * @param filterKey - Field to filter by
     * @param operator - Filter operator (contains, equals, etc.)
     * @param filterValue - Value to filter by
     * @param sortBy - Field to sort by
     * @param sortOrder - Sort order (ASC/DESC)
     * @returns FindAndCountOptions for Property queries
     */
    /**
     * Apply a single FilterSpec to a Sequelize whereClause for property queries.
     * Mutates whereClause; AND-combination is achieved by sequential calls writing to distinct keys.
     * Edge cases preserved from the legacy switch (e.g. REQUEST_STATUS=allocated forces equals to avoid matching partially_allocated).
     */
    private static applyPropertyFilter(whereClause: any, filter: FilterSpec): void {
        const { key, op, value } = filter;
        if (!key || !shouldApplyFilter(op, value)) return;
        const sequelize = database.sequelize;
        const loweredValue = typeof value === 'string' ? value.toLowerCase() : value;

        switch (key as PropertyFilterKeys) {
            case PropertyFilterKeys.PROPERTY_ID:
                whereClause.property_id = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_NAME:
                whereClause.property_name = getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_name', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_TYPE:
                whereClause.property_type = getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_type', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_STATUS:
                whereClause.property_status = getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_status', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_CONTROL_NUMBER:
                whereClause.property_control_number = getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_control_number', op, value);
                break;
            case PropertyFilterKeys.ORGANIZATION:
                whereClause['$request.doneeAccount.organization.name$'] =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'request.doneeAccount.organization.name', op, value);
                break;
            case PropertyFilterKeys.DONEE_ACCOUNT:
                whereClause['$request.doneeAccount.name$'] =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'request.doneeAccount.name', op, value);
                break;
            case PropertyFilterKeys.REQUESTOR:
                whereClause['$request.requestorUser.name$'] =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'request.requestorUser.name', op, value);
                break;
            case PropertyFilterKeys.REQUESTOR_EMAIL:
                whereClause['$request.requestorUser.email$'] =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'request.requestorUser.email', op, value);
                break;
            case PropertyFilterKeys.INVOICE_NUMBER: {
                const latestInvoiceNoExpr = sequelize.literal(`(
                    SELECT i.invoice_no
                    FROM request_attachments AS ra
                    INNER JOIN invoices AS i ON i.attachment_id = ra.id
                    WHERE ra.request_id = request.id
                    ORDER BY i.id DESC
                    LIMIT 1
                )`);
                whereClause[Op.and] = whereClause[Op.and] || [];
                whereClause[Op.and].push(sequelize.where(latestInvoiceNoExpr, getSequelizeCondition(op, value)));
                break;
            }
            case PropertyFilterKeys.REQUEST_STATUS:
                /** Force exact match for "allocated" so it does not match "partially_allocated" */
                const statusOp = loweredValue === 'allocated' ? 'equals' : op;
                whereClause['$request.status$'] = getSequelizeCaseInsensitiveCondition(sequelize, 'request.status', statusOp, value);
                break;
            case PropertyFilterKeys.REQUEST_TCN:
                whereClause['$request.tcn$'] = getSequelizeCaseInsensitiveCondition(sequelize, 'request.tcn', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_QUANTITY:
                whereClause.property_quantity = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_ORIGINAL_VALUE:
                whereClause.property_original_value = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_TOTAL_VALUE:
                whereClause.property_total_value = getSequelizeCondition(op, value, 'number');
                break;
            case PropertyFilterKeys.PROPERTY_ALLOCATED_DATE:
                whereClause.property_allocated_date = getSequelizeTimestampCondition(op, value);
                break;
            case PropertyFilterKeys.PROPERTY_LOCATION_CITY:
                whereClause.property_location_city =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_location_city', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_LOCATION_REGION_STATE:
                whereClause.property_location_region_state =
                    getSequelizeCaseInsensitiveCondition(sequelize, 'Property.property_location_region_state', op, value);
                break;
            case PropertyFilterKeys.PROPERTY_SURPLUS_RELEASE_DATE:
                whereClause.property_surplus_release_date = getSequelizeTimestampCondition(op, value);
                break;
            case PropertyFilterKeys.CREATED_AT:
            case PropertyFilterKeys.UPDATED_AT:
                whereClause[key === PropertyFilterKeys.CREATED_AT ? 'createdAt' : 'updatedAt'] =
                    getSequelizeDateCondition(op, value);
                break;
        }
    }

    private static generatePropertiesQuery(
        organizationId?: string,
        stateId?: number,
        filters: FilterSpec[] = [],
        sortBy: string = "createdAt",
        sortOrder: string = "DESC"
    ): FindAndCountOptions<Property> {
        const whereClause: any = {};
        const sequelize = database.sequelize;
        const latestInvoiceNoExpr = sequelize.literal(`(
            SELECT i.invoice_no
            FROM request_attachments AS ra
            INNER JOIN invoices AS i ON i.attachment_id = ra.id
            WHERE ra.request_id = request.id
            ORDER BY i.id DESC
            LIMIT 1
        )`);

        // Filter by state through request -> doneeAccount -> state
        if (stateId) {
            whereClause['$request.doneeAccount.stateId$'] = stateId;
        }

        // Filter by organization through request -> doneeAccount -> organization
        if (organizationId) {
            whereClause['$request.doneeAccount.organizationId$'] = organizationId;
        }

        for (const filter of filters) {
            this.applyPropertyFilter(whereClause, filter);
        }

        const query: FindAndCountOptions<Property> = {
            where: whereClause,
            subQuery: false,
            distinct: true,
            include: [
                {
                    model: Request,
                    as: 'request',
                    required: true,
                    // Keep FK columns required by nested joins when Sequelize builds subqueries for pagination.
                    attributes: ['id', 'requestor', 'donee_account', 'status', 'tcn', 'createdAt', 'updatedAt'],
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
                            attributes: ['id', 'name', 'email'],
                        }
                    ],
                }
            ],
        };

        // Define sort mapping
        const sortMapping: Record<string, any[]> = {
            createdAt: ['createdAt'],
            updatedAt: ['updatedAt'],
            property_id: ['property_id'],
            property_surplus_release_date: ['property_surplus_release_date'],
            property_name: ['property_name'],
            property_type: ['property_type'],
            property_status: ['property_status'],
            property_control_number: ['property_control_number'],
            property_quantity: ['property_quantity'],
            property_original_value: ['property_original_value'],
            property_total_value: ['property_total_value'],
            property_allocated_date: ['property_allocated_date'],
            property_location_city: ['property_location_city'],
            property_location_region_state: ['property_location_region_state'],
            organization: [
                { model: Request, as: 'request' },
                { model: DoneeAccount, as: 'doneeAccount' },
                { model: Organization, as: 'organization' },
                'name',
            ],
            doneeAccount: [
                { model: Request, as: 'request' },
                { model: DoneeAccount, as: 'doneeAccount' },
                'name',
            ],
            requestor: [
                { model: Request, as: 'request' },
                { model: User, as: 'requestorUser' },
                'name',
            ],
            requestor_email: [
                { model: Request, as: 'request' },
                { model: User, as: 'requestorUser' },
                'email',
            ],
            invoice_no: [latestInvoiceNoExpr],
            request_status: [{ model: Request, as: 'request' }, 'status'],
            request_tcn: [{ model: Request, as: 'request' }, 'tcn'],
        };

        const resolvedSort = sortMapping[sortBy] || ['createdAt'];
        const orderItem: any[] = Array.isArray(resolvedSort) ? [...resolvedSort] : [resolvedSort];
        const sortDirection =
            String(sortOrder ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        orderItem.push(sortDirection);
        query.order = [orderItem as any, ['property_id', 'DESC']];

        return query;
    }

    //Always returns unfiltered counts for all statuses
    static async getAllPropertyCountsByOrganizationId(organizationId: string) {
        const counts = await this.getPropertyCountsByRequestStatus(undefined, organizationId);
        return counts;
    }

    //Always returns unfiltered counts for all statuses
    static async getAllPropertyCountsByStateId(stateId: number) {
        const counts = await this.getPropertyCountsByRequestStatus(stateId, undefined);
        return counts;
    }

    /**
     * Get counts of properties grouped by request status for a specific state or organization
     * @param stateId - The ID of the state to get property counts for
     * @param organizationId - The ID of the organization to get property counts for
     * @param filterKey - Filter key to apply
     * @param operator - Filter operator
     * @param filterValue - Filter value
     * @returns Object containing counts for each request status
     */
    static async getPropertyCountsByRequestStatus(stateId?: number, organizationId?: string, filterKey?: PropertyFilterKeys, operator: string = 'contains', filterValue?: string, filters?: FilterSpec[]) {
        const whereClause: any = {};

        if (stateId) whereClause['$request.doneeAccount.stateId$'] = stateId;
        if (organizationId) whereClause['$request.doneeAccount.organizationId$'] = organizationId;

        const effective = filtersFromLegacy(filterKey, operator, filterValue, filters);
        for (const filter of effective) {
            this.applyPropertyFilter(whereClause, filter);
        }

        const counts = await Property.findAll({
            attributes: [
                [database.sequelize.col('request.status'), 'status'],
                [database.sequelize.fn('COUNT', database.sequelize.col('Property.property_id')), 'count']
            ],
            where: whereClause,
            include: [
                {
                    model: Request,
                    as: 'request',
                    required: true,
                    attributes: [],
                    include: [
                        {
                            model: DoneeAccount,
                            as: 'doneeAccount',
                            required: true,
                            attributes: [],
                            include: [
                                {
                                    model: Organization,
                                    as: 'organization',
                                    required: true,
                                    attributes: [],
                                },
                            ],
                        },
                        {
                            model: User,
                            as: 'requestorUser',
                            attributes: [],
                        }
                    ],
                }
            ],
            group: [database.sequelize.col('request.status')]
        });

        // Transform the results into a more usable format
        const statusCounts = counts.reduce((acc: Record<string, number>, curr: any) => {
            acc[curr.getDataValue('status')] = parseInt(curr.getDataValue('count'));
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

    static async getPropertiesHavingExpiredScreeningDatesWithPagination(stateId: number, page: number = 1, limit: number = 10) {
        const today = new Date().setHours(0, 0, 0, 0);

        const includeSection = [
            {
                model: Request,
                as: 'request',
                where: {
                    status: RequestStatusEnum.PENDING,
                },
                include: [
                    {
                        model: DoneeAccount,
                        as: 'doneeAccount',
                        where: {
                            stateId: stateId,
                        },
                        required: true,
                        include: [
                            {
                                model: Organization,
                                as: 'organization',
                            },
                            {
                                model: State,
                                as: 'state',
                            }
                        ]
                    }
                ]
            }
        ]

        const query: FindAndCountOptions<Property> = {
            where: {
                property_surplus_release_date: {
                    [Op.lt]: today,
                },
                is_cancelled: {
                    [Op.ne]: true
                }
            },
            include: includeSection
        };

        const properties = await paginateSequelize<Property>(Property, page, limit, query);
        return properties;
    }

    static async getPropertiesHavingScreeningDatesExpiredTodayWithPagination(stateId: number, page: number = 1, limit: number = 10) {
        const today = new Date().setHours(0, 0, 0, 0);
        const tomorrow = new Date(today + 24 * 60 * 60 * 1000).getTime();

        const includeSection = [
            {
                model: Request,
                as: 'request',
                where: {
                    status: RequestStatusEnum.PENDING,
                },
                include: [
                    {
                        model: DoneeAccount,
                        as: 'doneeAccount',
                        where: {
                            stateId: stateId,
                        },
                        required: true,
                        include: [
                            {
                                model: Organization,
                                as: 'organization',
                            },
                            {
                                model: State,
                                as: 'state',
                            }
                        ]
                    }
                ]
            }
        ]

        const query: FindAndCountOptions<Property> = {
            where: {
                property_surplus_release_date: {
                    [Op.gte]: today,
                    [Op.lt]: tomorrow,
                },
                is_cancelled: {
                    [Op.ne]: true
                }
            },
            include: includeSection
        };

        const properties = await paginateSequelize<Property>(Property, page, limit, query);
        return properties;
    }

    static async getPropertiesHavingScreeningDatesExpiredThreeDaysFromNowWithPagination(stateId: number, page: number = 1, limit: number = 10) {
        const today = new Date().setHours(0, 0, 0, 0);
        const tomorrow = new Date(today + 24 * 60 * 60 * 1000).getTime();
        const threeDaysFromNow = new Date(today + 3 * 24 * 60 * 60 * 1000).getTime();

        const includeSection = [
            {
                model: Request,
                as: 'request',
                where: {
                    status: RequestStatusEnum.PENDING,
                },
                include: [
                    {
                        model: DoneeAccount,
                        as: 'doneeAccount',
                        where: {
                            stateId: stateId,
                        },
                        required: true,
                        include: [
                            {
                                model: Organization,
                                as: 'organization',
                            },
                            {
                                model: State,
                                as: 'state',
                            }
                        ]
                    }
                ]
            }
        ]

        const query: FindAndCountOptions<Property> = {
            where: {
                property_surplus_release_date: {
                    [Op.gte]: tomorrow,
                    [Op.lt]: threeDaysFromNow,
                },
                is_cancelled: {
                    [Op.ne]: true
                }
            },
            include: includeSection
        };

        const properties = await paginateSequelize<Property>(Property, page, limit, query);
        return properties;
    }

    static async getPropertiesHavingExpiredScreeningDates() {
        const today = new Date().setHours(0, 0, 0, 0);
        const tomorrow = new Date(today + 24 * 60 * 60 * 1000).getTime();
        const threeDaysFromNow = new Date(today + 3 * 24 * 60 * 60 * 1000).getTime();

        const includeSection = [
            {
                model: Request,
                as: 'request',
                where: {
                    status: RequestStatusEnum.PENDING,
                },
                include: [
                    {
                        model: DoneeAccount,
                        as: 'doneeAccount',
                        required: true,
                        include: [
                            {
                                model: Organization,
                                as: 'organization',
                            },
                            {
                                model: State,
                                as: 'state',
                            }
                        ]
                    }
                ]
            }
        ]


        const whereClause: WhereOptions<Property> = {
            is_cancelled: false,
        };

        const propertiesHavingScreeningDatesExpired: Property[] = await Property.findAll({
            where: {
                property_surplus_release_date: {
                    [Op.lt]: today,
                },
                ...whereClause,
            },
            include: includeSection
        });
        const propertiesHavingScreeningDatesExpiredToday: Property[] = await Property.findAll({
            where: {
                property_surplus_release_date: {
                    [Op.gte]: today,
                    [Op.lt]: tomorrow,
                },
                ...whereClause,
            },
            include: includeSection
        });
        const propertiesHavingScreeningDatesExpiredThreeDaysFromNow: Property[] = await Property.findAll({
            where: {
                property_surplus_release_date: {
                    [Op.gte]: tomorrow,
                    [Op.lt]: threeDaysFromNow,
                },
                ...whereClause,
            },
            include: includeSection
        });

        return {
            propertiesHavingScreeningDatesExpired,
            propertiesHavingScreeningDatesExpiredToday,
            propertiesHavingScreeningDatesExpiredThreeDaysFromNow
        };
    }

    static async triggerExpiredScreeningDateCron() {
        await this.processExpiredScreeningDates();
    }

    static async processExpiredScreeningDates() {
        const logger = getLogger('processExpiredScreeningDates');
        try {
            const {
                propertiesHavingScreeningDatesExpired,
                propertiesHavingScreeningDatesExpiredToday,
                propertiesHavingScreeningDatesExpiredThreeDaysFromNow
            } = await PropertyService.getPropertiesHavingExpiredScreeningDates();

            logger.info(`Found ${propertiesHavingScreeningDatesExpired.length} properties having expired screening dates`);
            for (const property of propertiesHavingScreeningDatesExpired) {
                try {
                    logger.info(`Processing property ${property.property_control_number}`);

                    const renderData = {
                        templateName: TemplateEnum.EXPIRED_SCREENING_DATE,
                        data: { property },
                    };
                    const mailContent = await renderEmail(renderData);
                    const stateId = property.request?.doneeAccount?.stateId;
                    const recipients = await UserScope.findAll({
                        include: [
                            {
                                association: 'saspUser',
                                where: { stateId, is_active: true },
                                include: [{ model: User, as: 'user', attributes: ['email'] }],
                                required: true,
                            },
                        ],
                    });
                    const mailData = {
                        to: recipients.map(recipient => (recipient.saspUser as SaspUser & { user: User })?.user?.email ?? []),
                        subject: 'The screening date for property ' + property.property_control_number + ' has expired',
                        html: mailContent as string,
                    };
                    logger.info(`Sending email to ${recipients.map(recipient => recipient.user?.email)}`);
                    await emailQueue.add('verificationCodeNotification', mailData, { removeOnComplete: true, attempts: 3, });
                    NotificationFactory.createNotification(NotificationType.EXPIRED_SCREENING_DATE, { property });
                } catch (error) {
                    logger.error(`Error processing property ${property.property_control_number}`, error);
                }
            }

            logger.info(`Found ${propertiesHavingScreeningDatesExpiredToday.length} properties having expired screening dates today`);
            for (const property of propertiesHavingScreeningDatesExpiredToday) {
                try {
                    logger.info(`Processing property ${property.property_control_number}`);

                    const renderData = {
                        templateName: TemplateEnum.EXPIRED_SCREENING_DATE_TODAY,
                        data: { property },
                    };
                    const mailContent = await renderEmail(renderData);
                    const stateId = property.request?.doneeAccount?.stateId;
                    const recipients = await UserScope.findAll({
                        include: [
                            {
                                association: 'saspUser',
                                where: { stateId, is_active: true },
                                include: [{ model: User, as: 'user', attributes: ['email'] }],
                                required: true,
                            },
                        ],
                    });
                    const mailData = {
                        to: recipients.map(recipient => (recipient.saspUser as SaspUser & { user: User })?.user?.email ?? []),
                        subject: 'The screening date for property ' + property.property_control_number + ' going to expire today',
                        html: mailContent as string,
                    };
                    logger.info(`Sending email to ${recipients.map(recipient => recipient.user?.email)}`);
                    await emailQueue.add('verificationCodeNotification', mailData, { removeOnComplete: true, attempts: 3, });
                    NotificationFactory.createNotification(NotificationType.EXPIRED_SCREENING_DATE_TODAY, { property });
                } catch (error) {
                    logger.error(`Error processing property ${property.property_control_number}`, error);
                }
            }

            logger.info(`Found ${propertiesHavingScreeningDatesExpiredThreeDaysFromNow.length} properties having expired screening dates three days from now`);
            for (const property of propertiesHavingScreeningDatesExpiredThreeDaysFromNow) {
                try {
                    logger.info(`Processing property ${property.property_control_number}`);

                    const renderData = {
                        templateName: TemplateEnum.EXPIRED_SCREENING_DATE_THREE_DAYS_FROM_NOW,
                        data: { property },
                    };
                    const mailContent = await renderEmail(renderData);
                    const stateId = property.request?.doneeAccount?.stateId;
                    const recipients = await UserScope.findAll({
                        include: [
                            {
                                association: 'saspUser',
                                where: { stateId, is_active: true },
                                include: [{ model: User, as: 'user', attributes: ['email'] }],
                                required: true,
                            },
                        ],
                    });
                    const mailData = {
                        to: recipients.map(recipient => (recipient.saspUser as SaspUser & { user: User })?.user?.email ?? []),
                        subject: 'The screening date for property ' + property.property_control_number + ' going to expire in 3 days',
                        html: mailContent as string,
                    };
                    logger.info(`Sending email to ${recipients.map(recipient => recipient.user?.email)}`);
                    await emailQueue.add('verificationCodeNotification', mailData, { removeOnComplete: true, attempts: 3, });
                    NotificationFactory.createNotification(NotificationType.EXPIRED_SCREENING_DATE_THREE_DAYS_FROM_NOW, { property });
                } catch (error) {
                    logger.error(`Error processing property ${property.property_control_number}`, error);
                }
            }
        } catch (error) {
            logger.error(`Error processing expired screening dates`, error);
        }
    }
}