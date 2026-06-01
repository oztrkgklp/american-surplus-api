import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { parseId } from '@/utils/validators';
import { AppError } from '@/utils/response/appError';
import { paginateArray } from '@/utils/pagination';
import { StoragePaths } from '@/utils/storage/paths';
import { fileExists, getFileMimeType, readFile, saveUploadedFile } from '@/utils/storage/fileSystem';
import { RequestService } from '@/properties/services/request';
import { PropertyService } from '@/properties/services/property';
import { RequestAttachmentService } from '@/properties/services/requestAttachment';
import { PropertyDataService } from '@/ppms/services/propertyData';
import { LoarService } from '@/loar/services/loar';
import { RequestAttachmentTypeEnum } from '@/properties/enums/requestAttachmentTypes';
import { calculateDayDifference, convertUnixTime } from '@/utils/timeHelper';
import { TimeFormat } from '@/enums/timeFormat';
import { automaticPropertySchema } from '@/properties/validators/propertySchema';
import { mapDiskPropertyToDbSchema, isPropertyVehicle } from '@/utils/property';
import { withTransaction } from '@/utils/transactionalOperation';
import { DoneeAccountService } from '@/organization/services/donee';
import { renderEmail } from '@/utils/mail/render';
import { TemplateEnum } from '@/enums/mailEnum';
import { emailQueue } from '@/utils/mail/emailQueue';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import { PropertyStatusEnum, RequestStatusEnum } from '@/enums/request-property-status.enum';
import { RequestFilterKeys } from '@/enums/requestFilterKeys.enum';
import { PropertyFilterKeys } from '@/enums/propertyFilterKeys.enum';
import { parseFiltersFromQuery } from '@/utils/filteringOperations';
import DocumentFactory, { DocumentActionType } from '@/documents/services/document-factory.service';
import UserScope from '@/authz/models/UserScope';
import User from '@/authn/models/User';
import { getLogger } from '@/utils/logger';
import { LogisticsPacketService } from '@/documents/services/logisticsPacket.service';
import { Sf97PacketService } from '@/documents/services/sf97Packet.service';
import envvars from '@/config/envvars';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import { InvoiceService } from '@/documents/services/invoice.service';
import Invoice, { InvoiceStatus } from '@/documents/models/Invoice.entity';
import Sf97Packet from '@/documents/models/Sf97Packet.entity';
import RequestAttachment from '@/properties/models/RequestAttachment';
import { Op } from 'sequelize';
import { ScopeType } from '@/enums/scope.enum';
import { request } from 'http';
import { PropertyElasticsearchService } from '@/ppms/services/propertyElasticsearch.service';
import path from 'path';

const logger = getLogger('RequestController');

/** Insert `_final` before the extension for SASP SF-97 uploads so names stay distinguishable in storage and the UI. */
function ensureSf97FinalUploadDisplayName(originalName: string): string {
    const trimmed = (originalName || '').trim();
    if (!trimmed) return 'SF-97_final.pdf';
    const baseName = path.basename(trimmed.replace(/\0/g, ''));
    const lastDot = baseName.lastIndexOf('.');
    const stem = lastDot > 0 ? baseName.slice(0, lastDot) : baseName;
    const ext = lastDot > 0 ? baseName.slice(lastDot) : '';
    if (/_final$/i.test(stem)) {
        return baseName;
    }
    return `${stem}_final${ext}`;
}

// Shared builder for quantity/justification updates used by both controllers
async function buildPropertyUpdateForQtyAndJustification(
    req: Request,
    property: any,
    logCtx: { requestId?: number; propertyId: number }
) {
    // Determine if quantity actually changed; only then validate and call PPMS
    const incomingQty = req.body.property_quantity;
    const isQtyProvided = incomingQty !== undefined;
    const isQtyChanged = isQtyProvided && incomingQty !== property.property_quantity;

    if (isQtyChanged) {
        if (typeof incomingQty !== 'number' || !Number.isInteger(incomingQty) || incomingQty <= 0) {
            throw new AppError(400, 'Item Quantity must be a positive integer greater than 0');
        }
        const requestId = logCtx.requestId ?? property.request_id;
        const activeInvoice = await Invoice.findOne({ where: { request_id: requestId, }, });
        if (activeInvoice) {
            throw new AppError(400, 'Cannot change quantity because an active invoice exists for this request');
        }

        const isDecreaseOrEqual = incomingQty <= property.property_quantity;
        const allowRelaxed = process.env.ALLOW_NONINCREASE_WITHOUT_PPMS === 'true';
        try {
            const propertyDiskData = await PropertyDataService.getPropertyDetails(property.property_control_number);
            if (!propertyDiskData) {
                if (!isDecreaseOrEqual || !allowRelaxed) {
                    throw new AppError(409, 'Cannot change quantity because listing is unavailable. You can still update justification.');
                }
                logger.warn('PPMS listing missing; allowing non-increase quantity update', {
                    requestId: logCtx.requestId,
                    propertyId: logCtx.propertyId,
                    icn: property.property_control_number,
                    currentQty: property.property_quantity,
                    incomingQty,
                });
            } else {
                if (propertyDiskData.data.quantity < incomingQty) {
                    throw new AppError(400, 'Item Quantity can not be greater than available quantity');
                }
            }
        } catch (err: any) {
            const is404 = err?.status === 404 || err?.statusCode === 404 || (typeof err?.message === 'string' && err.message.toLowerCase().includes('not found'));
            if (is404) {
                if (!isDecreaseOrEqual || !allowRelaxed) {
                    throw new AppError(409, 'Cannot change quantity because listing is unavailable. You can still update justification.');
                }
                logger.warn('PPMS listing 404; allowing non-increase quantity update', {
                    requestId: logCtx.requestId,
                    propertyId: logCtx.propertyId,
                    icn: property.property_control_number,
                    currentQty: property.property_quantity,
                    incomingQty,
                });
            } else {
                throw err;
            }
        }
    }

    // Validate property_justification
    if (req.body.property_justification !== undefined && (typeof req.body.property_justification !== 'string' || req.body.property_justification.length < 2 || req.body.property_justification.length > 100)) {
        throw new AppError(400, 'Item Justification must be between 2 and 100 characters');
    }

    // Validate property_justification_extended (optional)
    if (req.body.property_justification_extended !== undefined) {
        const ext = req.body.property_justification_extended;
        if (typeof ext !== 'string' || ext.length > 5000) {
            throw new AppError(400, 'Additional justification must be at most 5000 characters');
        }
    }

    const updates: Record<string, unknown> = {
        property_justification: req.body.property_justification,
        property_quantity: req.body.property_quantity,
    };
    if (req.body.property_justification_extended !== undefined) {
        updates.property_justification_extended = req.body.property_justification_extended;
    }
    return {
        updates,
        quantityChanged: isQtyChanged,
        oldQuantity: property.property_quantity,
        newQuantity: isQtyChanged ? incomingQty : property.property_quantity,
    };
}

export const updateRequestTcn = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const tcn = req.body.tcn;

        const rx = new RegExp(`^[A-Za-z0-9]{2}-\\d{2}-\\d{6,10}$`); // Inline regex: 2 alnum, dash, current 2â€digit year, dash, 6â€“10 digits
        if (!rx.test(tcn)) throw new AppError(400, 'TCN format is invalid. Expected format: XX-YY-123456 (2 chars/digits, year, 6-10 digits)');

        const updatedRequest = await RequestService.updateRequestTcn(requestId, tcn);
        await NotificationFactory.createNotification(NotificationType.TCN_UPDATED, { requestId });
        sendSuccess(res, updatedRequest);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Update allocated quantity for an allocated property (SASP only use)
 * - Validates state (not canceled/denied/picked up)
 * - Preserves allocated date if already set; sets if missing and qty > 0
 * - Adjusts denied quantity accordingly
 * - Recomputes request status
 */
export const updateAllocatedQuantityInRequest = async (req: Request, res: Response) => {
    let requestId: number = NaN;
    let propertyId: number = NaN;
    try {
        requestId = parseId(req.params.requestId);
        propertyId = parseId(req.params.propertyId);

        const property = await PropertyService.getPropertyById(propertyId);
        if (!property || property.request_id !== requestId) {
            throw new AppError(404, 'Property not found in this request');
        }

        // Guard states
        if (property.is_cancelled) throw new AppError(400, 'Cannot update allocated quantity for a canceled property');
        if (property.is_denied) throw new AppError(400, 'Cannot update allocated quantity for a denied property');

        const incoming = req.body?.property_allocated_quantity;
        if (incoming === undefined) throw new AppError(400, 'property_allocated_quantity is required');
        if (typeof incoming !== 'number' || !Number.isInteger(incoming) || incoming < 0) {
            throw new AppError(400, 'Allocated quantity must be an integer 0 or greater');
        }

        // Allocated cannot exceed requested
        if (incoming > property.property_quantity) {
            throw new AppError(400, 'Allocated quantity cannot exceed requested quantity');
        }

        const isAllocatedQtyChanged = incoming !== property.property_allocated_quantity;
        if (isAllocatedQtyChanged) {
            const activeInvoice = await Invoice.findOne({ where: { request_id: requestId, }, });
            if (activeInvoice) {
                throw new AppError(400, 'Cannot change allocated quantity because an active invoice exists for this request');
            }
        }

        const updates = {
            property_allocated_quantity: incoming,
            property_denied_quantity: Math.max(0, property.property_quantity - incoming),
            property_allocated_date: incoming > 0 ? (property.property_allocated_date || Date.now()) : null,
            // Reset denial date if we (re)allocate
            property_denial_date: incoming > 0 ? null : property.property_denial_date,
            is_denied: false,
        } as const;

        await withTransaction(async (transaction) => {
            const updatedProperty = await PropertyService.updateProperty(propertyId, updates, transaction);

            const currentRequest = await RequestService.getRequestById(requestId, false);
            if (currentRequest?.status !== RequestStatusEnum.INVOICE_REQUIRED) {
                // Recompute request status unless request is already in invoice flow.
                const allProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
                const status = PropertyService.getRequestAllocationStatus(allProperties);
                if (status) {
                    await RequestService.updateRequest(requestId, { status }, transaction);
                }
            }

            sendSuccess(res, updatedProperty);
        });
    } catch (error) {
        logger.error('updateAllocatedQuantityInRequest error', { requestId, propertyId, error });
        sendError(req, res, error);
    }
};

export const getAllRequests = async (req: Request, res: Response) => {
    try {
        const organizationId = req.params.organizationId;

        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const filterKey = req.query.filterKey as RequestFilterKeys;
        const filterValue = req.query.filterValue as string;
        const sortBy = req.query.sortBy as string;
        const sortOrder = req.query.sortOrder as string;
        const operator = req.query.operator as string;
        const filters = parseFiltersFromQuery(req.query);

        const requests = await RequestService.getAllRequestsByOrganizationId(organizationId, page, limit, filterKey, operator, filterValue, sortBy, sortOrder, filters);
        sendSuccess(res, requests);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getAllRequestsCounts = async (req: Request, res: Response) => {
    try {
        const organizationId = req.params.organizationId;
        // Don't apply filters to counts - always return unfiltered totals for all statuses
        const counts = await RequestService.getAllRequestsCounts(organizationId);
        sendSuccess(res, counts);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const getRequestById = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const request = await RequestService.getRequestById(requestId);
        sendSuccess(res, request);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getRequestProperties = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const sortBy = req.query.sort as string;
        const sortOrder = req.query.order as string;
        const filterKey = req.query.filterKey as PropertyFilterKeys;
        const filterValue = req.query.filterValue as string;
        const operator = req.query.operator as string;
        const filters = parseFiltersFromQuery(req.query);

        const properties = await PropertyService.getPropertiesByRequestId(requestId, sortBy, sortOrder, operator, filterKey, filterValue, filters);

        // Transform properties to include requestor_email field from association
        const transformedProperties = properties.map(property => {
            const propertyData = property.toJSON();
            return {
                ...propertyData,
                requestor_email: property.request?.requestorUser?.email || null
            };
        });

        const paginatedProperties = paginateArray(transformedProperties, page, limit);

        sendSuccess(res, paginatedProperties);
    } catch (error) {
        sendError(req, res, error);
    }
};


/**
 * Generate LOAR for a request
 */
export const generateLOAR = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const request = await RequestService.getRequestById(requestId);

        if (!request) throw new AppError(404, 'Request not found');
        if (!request.tcn || request.tcn === '') throw new AppError(400, 'Request TCN is not set');
        if (request.status == RequestStatusEnum.CANCELED) throw new AppError(400, 'Request is canceled, cannot generate LOAR');

        const requestDoneeAccount = request.doneeAccount;
        if (!requestDoneeAccount) throw new AppError(400, "Could not find the request's donee account");

        const properties = await PropertyService.getPropertiesByRequestId(requestId);
        if (!properties || properties.length === 0) throw new AppError(404, 'No properties found for this request');

        // Remove unallocated properties
        const allocatedProperties = properties.filter((property) => property.property_allocated_quantity > 0);
        if (allocatedProperties.length === 0) throw new AppError(400, 'No allocated properties found for this request');

        const icnList = allocatedProperties.map((p) => p.property_control_number);
        const propertyDetails = await PropertyDataService.getManyPropertyDetails(icnList);

        if (propertyDetails.length === 0) throw new AppError(404, 'No property details found for this request');

        const { display_name } = req.body;
        const displayName = display_name || `LOAR-${request.tcn}`;

        await withTransaction(async (transaction) => {
            const attachment = await RequestAttachmentService.createAttachment(
                request.id,
                req.user,
                'emptyPath',
                RequestAttachmentTypeEnum.LOAR,
                displayName,
                transaction
            );

            // Generate LOAR using DocumentFactory with EJS template
            const loarPath = (await DocumentFactory.handler(
                DocumentActionType.GENERATE_LOAR,
                {
                    request,
                    authenticatedUser: req.user,
                    properties: allocatedProperties,
                    propertyDetails,
                    attachmentDate: attachment.createdAt,
                },
                transaction
            )) as string;

            await RequestAttachmentService.updateAttachmentPath(attachment.id, loarPath, req.user, transaction);
            await DocumentFactory.handler(DocumentActionType.GENERATE_LOGISTICS_PACKET, { request, createdBy: req.user }, transaction);
            await NotificationFactory.createNotification(NotificationType.LOAR_GENERATED, { request });
            sendSuccess(res);
        });

    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Update LOAR shipping information
 */
export const updateLoarShipping = async (req: Request, res: Response) => {
    try {
        const user = req.user;
        const requestIdParam = req.params.requestId;
        if (!requestIdParam) throw new AppError(400, 'Request id is required');

        const attachmentIdParam = req.params.attachmentId;
        if (!attachmentIdParam) throw new AppError(400, 'Attachment id is required');

        const shippingName = req.body.shipping_name;
        if (!shippingName) throw new AppError(400, 'Shipping name is required');

        // Validate shipping name - allow letters, numbers, spaces, periods, commas, ampersands, hyphens, and apostrophes
        const trimmedShippingName = shippingName.trim();
        if (!trimmedShippingName || trimmedShippingName.length < 2) throw new AppError(400, 'Shipping name must be at least 2 characters long');
        if (!/^[a-zA-Z0-9\s.,&'-]+$/.test(trimmedShippingName)) throw new AppError(400, 'Shipping name contains invalid characters');

        // Check if the name contains at least one letter or number (not just symbols)
        if (!/[a-zA-Z0-9]/.test(trimmedShippingName)) throw new AppError(400, 'Shipping name must contain at least one letter or number');

        const requestId = parseId(requestIdParam);
        const attachmentId = parseId(attachmentIdParam);

        const loarAttachment = await RequestAttachmentService.getAttachment({
            id: attachmentId,
            request_id: requestId,
            attachment_type: RequestAttachmentTypeEnum.LOAR,
        });

        if (!loarAttachment) throw new AppError(404, 'LOAR attachment not found');

        const properties = await PropertyService.getPropertiesByRequestId(requestId);
        if (!properties || properties.length === 0) throw new AppError(404, 'No properties found for this request');

        // Remove unallocated properties
        const allocatedProperties = properties.filter((property) => property.property_allocated_quantity > 0);
        if (allocatedProperties.length === 0) throw new AppError(400, 'No allocated properties found for this request');

        const icnList = allocatedProperties.map((p) => p.property_control_number);
        const propertyDetails = await PropertyDataService.getManyPropertyDetails(icnList);
        const request = await RequestService.getRequestById(requestId);

        await withTransaction(async (transaction) => {
            const updatedLoarPath = (await DocumentFactory.handler(DocumentActionType.UPDATE_LOAR_SHIPPING, {
                request,
                authenticatedUser: user,
                properties: allocatedProperties,
                propertyDetails,
                shippingName,
                loarAttachment,
            }, transaction)) as string;

            // Update the attachment path with the new LOAR file
            await RequestAttachmentService.updateAttachmentPath(loarAttachment.id, updatedLoarPath, user, transaction);

            await DocumentFactory.handler(DocumentActionType.GENERATE_LOGISTICS_PACKET, {
                request,
                createdBy: user,
                shippingName: trimmedShippingName,
                dontGenerateNewAttachment: true,
            }, transaction);

            await LogisticsPacketService.updateLogisticsPacketShippingName(requestId, trimmedShippingName, transaction);
            await NotificationFactory.createNotification(NotificationType.LOAR_SHIPPING_UPDATED, { requestId });
            sendSuccess(res);
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Sign Logistics Packet for a request
 */
export const signLogisticsPacket = async (req: Request, res: Response) => {
    try {
        const request = req.request;
        const { requestAttachmentId, purposes } = req.body;
        const doneeAccount = request.doneeAccount;

        if (!doneeAccount) throw new AppError(400, "Could not find the request's donee account");

        // Get the current shipping name from the LOAR attachment
        const loarAttachment = await RequestAttachmentService.getAttachment({ request_id: request.id, attachment_type: RequestAttachmentTypeEnum.LOAR });
        // Extract shipping name from LOAR data (we need to regenerate LOAR to get current shipping name)
        let currentShippingName: string | undefined = undefined;

        if (loarAttachment) {
            try {
                const logisticsPacket = await LogisticsPacketService.getLogisticsPacketInfo(request.id);
                currentShippingName = logisticsPacket.shipping_name;
            } catch (error) {
                logger.error('Failed to get current shipping name:', error);
                throw new AppError(400, "Could not find the logistic packet");
            }
        } else {
            throw new AppError(400, "Could not find the loar document");
        }

        await withTransaction(async (transaction) => {
            await DocumentFactory.handler(DocumentActionType.SIGN_LOGISTICS_PACKET, {
                request,
                signedBy: req.user,
                requestAttachmentId,
                stateId: doneeAccount.stateId,
                shippingName: currentShippingName,
                purposes
            }, transaction);
        });

        sendSuccess(res, { message: 'Logistics packet signed successfully' }, 201);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Get Logistics Packet information for a request
 */
export const getLogisticsPacketInfo = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        if (isNaN(requestId)) throw new AppError(400, 'Invalid request ID');

        const info = await LogisticsPacketService.getLogisticsPacketInfo(requestId);
        sendSuccess(res, info);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Generate standalone SF-97 PDF (separate from logistics packet). Donee only; invoice must be paid (enforced in document factory).
 */
export const generateSF97 = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const request = await RequestService.getRequestById(requestId, false);
        if (!request) throw new AppError(404, 'Request not found');
        if (!request.tcn || request.tcn === '') throw new AppError(400, 'Request TCN is not set');
        if (request.status == RequestStatusEnum.CANCELED) throw new AppError(400, 'Request is canceled, cannot generate SF-97');

        const property_control_number = req.body?.property_control_number;
        if (property_control_number == null || String(property_control_number).trim() === '') {
            throw new AppError(400, 'property_control_number is required');
        }

        await withTransaction(async (transaction) => {
            const result = await DocumentFactory.handler(
                DocumentActionType.GENERATE_SF97,
                {
                    request,
                    createdBy: req.user,
                    property_control_number: String(property_control_number).trim(),
                },
                transaction
            );
            sendSuccess(res, result, 201);
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Sign standalone SF-97 (SASP or donee, same pattern as logistics packet signing).
 */
export const signSF97 = async (req: Request, res: Response) => {
    try {
        const request = req.request;
        const { requestAttachmentId } = req.body;
        const doneeAccount = request.doneeAccount;

        if (!doneeAccount) throw new AppError(400, "Could not find the request's donee account");
        if (!requestAttachmentId) throw new AppError(400, 'requestAttachmentId is required');

        await withTransaction(async (transaction) => {
            await DocumentFactory.handler(
                DocumentActionType.SIGN_SF97,
                {
                    request,
                    signedBy: req.user,
                    requestAttachmentId,
                    stateId: doneeAccount.stateId,
                },
                transaction
            );
        });

        sendSuccess(res, { message: 'SF-97 signed successfully' }, 201);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getSf97Info = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        if (isNaN(requestId)) throw new AppError(400, 'Invalid request ID');

        const info = await Sf97PacketService.getSf97Info(requestId);
        sendSuccess(res, info);
    } catch (error) {
        sendError(req, res, error);
    }
};

const ATTACHMENT_DATE_FIELDS = new Set(['createdAt', 'updatedAt']);
const ATTACHMENT_SORTABLE_FIELDS: Record<string, string> = {
    name: 'name',
    attachment_type: 'attachment_type',
    createdByUser: 'createdByUser.name',
    updatedByUser: 'updatedByUser.name',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
};

function getAttachmentRowVal(row: any, field: string): unknown {
    const plain = row?.get?.({ plain: true }) ?? row;
    if (field === 'createdByUser') return plain?.createdByUser?.name;
    if (field === 'updatedByUser') return plain?.updatedByUser?.name;
    return plain?.[field];
}

function attachmentMatchesFilter(
    row: any,
    filterKey: string,
    operator: string,
    filterValue: string
): boolean {
    const val = getAttachmentRowVal(row, filterKey);
    const strVal = String(filterValue).toLowerCase().trim();
    if (ATTACHMENT_DATE_FIELDS.has(filterKey)) {
        const rowDate = val == null ? null : new Date(val as string | number);
        // Normalize filter to date-only (YYYY-MM-DD) so we match by day and ignore time
        const filterValueStr = String(filterValue).trim();
        const filterDateOnly = filterValueStr.length >= 10 ? filterValueStr.slice(0, 10) : filterValueStr;
        const filterDate = new Date(filterDateOnly.includes('-') ? filterDateOnly + 'Z' : filterValueStr);
        if (Number.isNaN(rowDate?.getTime?.()) || Number.isNaN(filterDate.getTime())) return false;
        const rowDay = rowDate?.toISOString?.().slice(0, 10);
        const filterDay = filterDate.toISOString().slice(0, 10);
        if (operator === 'not' || operator === 'doesNotEqual') return rowDay !== filterDay;
        return rowDay === filterDay;
    }
    const rowStr = val != null ? String(val).toLowerCase() : '';
    if (operator === 'not' || operator === 'doesNotEqual') return rowStr !== strVal;
    if (operator === 'is' || operator === 'equals') return rowStr === strVal;
    // containsAny: filterValue is comma-separated; match if name contains any of the parts
    if (operator === 'containsAny') {
        const parts = strVal.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        return parts.length > 0 && parts.some((part) => rowStr.includes(part));
    }
    return rowStr.includes(strVal);
}

function sortAttachments(rows: any[], sortBy: string, sortOrder: 'asc' | 'desc'): void {
    const key = ATTACHMENT_SORTABLE_FIELDS[sortBy] ?? sortBy;
    const dir = sortOrder === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
        const va = getAttachmentRowVal(a, sortBy);
        const vb = getAttachmentRowVal(b, sortBy);
        if (va == null && vb == null) return 0;
        if (va == null) return dir;
        if (vb == null) return -dir;
        if (ATTACHMENT_DATE_FIELDS.has(sortBy)) {
            // Sort by date only (ignore time): use midnight UTC of each day for comparison
            const dayA = new Date(va as string | number).toISOString().slice(0, 10);
            const dayB = new Date(vb as string | number).toISOString().slice(0, 10);
            const ta = new Date(dayA + 'Z').getTime();
            const tb = new Date(dayB + 'Z').getTime();
            return dir * (ta - tb);
        }
        const sa = String(va).toLowerCase();
        const sb = String(vb).toLowerCase();
        return dir * (sa < sb ? -1 : sa > sb ? 1 : 0);
    });
}

export const getRequestAttachments = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const attachments = await RequestAttachmentService.getAttachments({ request_id: requestId });

        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const sortBy = (req.query.sortBy as string) || 'createdAt';
        const sortOrder = ((req.query.sortOrder as string) || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
        const filterKey = req.query.filterKey as string | undefined;
        const operator = (req.query.operator as string) || 'contains';
        const filterValue = req.query.filterValue as string | undefined;

        let list = attachments;
        if (filterKey && filterValue != null && filterValue !== '') {
            list = list.filter((row) =>
                attachmentMatchesFilter(row, filterKey, operator, filterValue)
            );
        }
        sortAttachments(list, sortBy, sortOrder);
        const paginatedAttachments = paginateArray(list, page, limit);

        sendSuccess(res, paginatedAttachments);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getRequestAttachment = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const attachmentId = parseId(req.params.attachmentId);

        const attachment = await RequestAttachmentService.getAttachment({
            id: attachmentId,
            request_id: requestId,
        });

        if (!attachment) {
            throw new AppError(404, "Attachment not found");
        }

        const attachmentPath = attachment.file_path;

        const fileFound = await fileExists(attachmentPath);
        if (!fileFound) {
            throw new AppError(404, `Attachment file not found`);
        }

        const mimeType = getFileMimeType(attachmentPath);
        const attachmentBuffer = await readFile(attachmentPath);

        res.setHeader('Content-Type', mimeType);
        res.send(attachmentBuffer);
    } catch (err) {
        sendError(req, res, err);
    }
}

export const createRequestAttachment = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const file = req.file!;
        const { display_name, attachment_type, property_control_number: bodyPcn } = req.body;

        if (isNaN(requestId)) {
            throw new AppError(400, 'Invalid request ID');
        }

        // Get context info (you stored it on `req.request` in authorizeRequestAccess)
        const request = req.request;

        const doneeAccount = request.doneeAccount;
        if (!doneeAccount) {
            throw new AppError(400, "Could not find the request's donee account");
        }

        const organization = doneeAccount.organization;
        if (!organization) {
            throw new AppError(400, "Could not find the request's organization");
        }

        const doneeAccountId = doneeAccount.id.toString();
        const organizationId = organization.id.toString();

        const attachmentTypeNum = Number(attachment_type);
        if (attachmentTypeNum === RequestAttachmentTypeEnum.SF97) {
            const saspScope = (req.user?.scopes as { type: ScopeType; isActive?: boolean }[])?.find(
                (s) => s.type === ScopeType.SASP && s.isActive
            );
            if (!saspScope) {
                throw new AppError(
                    403,
                    'Only SASP users can upload the final SF-97 form. Donee users generate SF-97 using the dedicated action.'
                );
            }
            if (bodyPcn == null || String(bodyPcn).trim() === '') {
                throw new AppError(400, 'property_control_number is required');
            }
            const icn = String(bodyPcn).trim();

            const paidInvoice = await Invoice.findOne({
                where: { request_id: requestId, status: InvoiceStatus.PAID },
            });
            if (!paidInvoice) {
                throw new AppError(400, 'Invoice must be paid before uploading the SF-97 final form.');
            }

            const packet = await Sf97Packet.findOne({
                where: { request_id: requestId, property_control_number: icn },
            });
            if (!packet) {
                throw new AppError(
                    400,
                    'The donee must generate the SF-97 request form for this ICN before a final PDF can be uploaded.'
                );
            }

            const existingFinal = await RequestAttachment.findOne({
                where: {
                    request_id: requestId,
                    attachment_type: RequestAttachmentTypeEnum.SF97,
                    property_control_number: icn,
                    id: { [Op.ne]: packet.attachment_id },
                },
            });
            if (existingFinal) {
                throw new AppError(400, 'Final SF-97 for this property has already been uploaded.');
            }

            const storageDir = StoragePaths.private
                .orgs.org(organizationId)
                .donees.donee(doneeAccountId)
                .requests.request(requestId.toString())
                .path;

            const storedBaseName = ensureSf97FinalUploadDisplayName(file.originalname);
            const displayLabel = ensureSf97FinalUploadDisplayName(
                (display_name && String(display_name).trim()) || file.originalname
            );
            const filePath = await saveUploadedFile(file.buffer, storageDir, storedBaseName);
            await RequestAttachmentService.createAttachment(
                requestId,
                req.user,
                filePath,
                RequestAttachmentTypeEnum.SF97,
                displayLabel,
                undefined,
                icn
            );
            await NotificationFactory.createNotification(NotificationType.ATTACHMENT_UPLOADED, { userName: req.user?.name, request, doneeAccount });
            sendSuccess(res, {}, 201);
            return;
        }

        const storageDir = StoragePaths.private
            .orgs.org(organizationId)
            .donees.donee(doneeAccountId)
            .requests.request(requestId.toString())
            .path;

        const filePath = await saveUploadedFile(file.buffer, storageDir, file.originalname);

        await RequestAttachmentService.createAttachment(
            requestId,
            req.user,
            filePath,
            attachment_type,
            display_name
        );

        await NotificationFactory.createNotification(NotificationType.ATTACHMENT_UPLOADED, { userName: req.user?.name, request, doneeAccount });
        sendSuccess(res, {}, 201);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getMatchingPropertiesForRequest = async (req: Request, res: Response) => {
    try {
        const requestId = Number(req.params.requestId);
        // Extract pagination parameters from query string
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;

        const properties = await PropertyService.getPropertiesByRequestId(requestId);
        const property = properties ? properties[0] : undefined;
        const existingPropertyControlNumbers = properties.map(p => p.property_control_number);

        if (!property) {
            throw new AppError(404, 'No properties found for this request');
        }

        const propertyControlNumber = property.property_control_number;

        const prefixLength = 6;
        const icnPrefix = propertyControlNumber.substring(0, prefixLength);


        //format the release date based on summary disk's date format
        const propertySurplusReleaseDate = convertUnixTime(property.property_surplus_release_date, TimeFormat.MM_DD_YYYY);

        const propertyLocation = {
            city: property.property_location_city as string,
            stateCode: property.property_location_region_state as string,
            zip: property.property_location_postal_code as string,
        }

        //fetch all properties based on same prefix, release date and location
        const matchingProperties = await PropertyElasticsearchService.searchProperties(
            page, limit,
            { search: icnPrefix, surplusReleaseDateTo: propertySurplusReleaseDate, surplusReleaseDateFrom: propertySurplusReleaseDate, ...propertyLocation, });

        // Filter out properties that already exist in this request
        const filteredMatchingProperties = {
            ...matchingProperties,
            items: matchingProperties.items?.filter((prop: any) => !existingPropertyControlNumbers.includes(prop.property_control_number || prop.icn))
        };

        sendSuccess(res, filteredMatchingProperties);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const addMatchingPropertyToRequest = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const icn = req.params.icn;
        const body = { ...req.body, property_control_number: icn }
        const validatedBody = await automaticPropertySchema().validate(body, { abortEarly: false });
        const diskPropertyData = await PropertyDataService.getPropertyDetails(validatedBody.property_control_number);

        if (validatedBody.property_quantity > diskPropertyData.data.quantity) throw new AppError(400, 'The quantity requested exceeds the available quantity for this property.');

        // Surplus release date validation (uses Summary dataset via mapDiskPropertyToDbSchema)
        const surplusReleaseDate = diskPropertyData.data.surplusReleaseDate;
        const unixTimeNow = new Date().getTime();
        const endOfReleaseDay = new Date(new Date(surplusReleaseDate).setHours(23, 59, 59, 999)).getTime();
        const isSurplusReleaseDatePassed = unixTimeNow > endOfReleaseDay;

        if (isSurplusReleaseDatePassed) throw new AppError(400, 'The surplus release date has passed.');

        const doneeAccount = await DoneeAccountService.getDoneeAccountByRequestId(requestId);

        await withTransaction(async (transaction) => {
            await PropertyService.checkDuplicatePropertyByICN(
                validatedBody.property_control_number,
                doneeAccount,
                transaction
            );
        })

        // Map property data
        const newPropertyData = await mapDiskPropertyToDbSchema(
            diskPropertyData,
            requestId,
            validatedBody.property_justification,
            validatedBody.property_justification_extended ?? '',
            validatedBody.property_quantity
        );

        const property = await PropertyService.createProperty(newPropertyData);
        await NotificationFactory.createNotification(NotificationType.PROPERTY_ADDED_TO_REQUEST, { icn: validatedBody.property_control_number, doneeAccount, requestId });
        sendSuccess(res, property);
    } catch (error) {
        sendError(req, res, error);
    }

}

/**
 * Handles Request's property allocation and rejection
 */
export const allocateRequestProperties = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const allocations = req.body.allocations;

        // Validate that the request has a TCN before allowing allocation
        const request = await RequestService.getRequestById(requestId);
        if (!request.tcn || request.tcn.trim() === '') {
            throw new AppError(400, 'Allocation not allowed this request has no TCN and was never entered into PPMS.');
        }

        const propertyIds = [];
        const propertyUpdateList: { property_id: number, property_denied_quantity: number, property_allocated_quantity: number, property_status: string | null, property_original_value: number, property_control_number: string, is_vehicle: boolean }[] = [];
        const allocatedPropertyList: { property_name: string, ICN: string, allocated_quantity: number }[] = [];

        for (let allocation of allocations) {
            const property = await PropertyService.getPropertyById(
                allocation.property_id
            );

            if (property.request_id !== requestId) throw new AppError(400, 'Property request id not correct');
            if (property.is_cancelled) throw new AppError(400, 'Canceled properties can not be allocated');
            // Skip already-picked-up properties — re-allocation would reset their pickup status.
            if (property.is_picked_up) continue;
            if (allocations?.allocated === 0) throw new AppError(400, 'One or more property has no allocated quantity');

            // Check if property is a vehicle by fetching PPMS details
            let isVehicle = false;
            try {
                const propertyDetails = await PropertyDataService.getPropertyDetails(property.property_control_number);
                isVehicle = isPropertyVehicle(propertyDetails);
            } catch (error) {
                // Fall back to AOC-only logic if PPMS details unavailable
            }

            const propertyUpdates = {
                property_id: allocation.property_id,
                property_denied_quantity: property.property_quantity - allocation.allocated,
                property_allocated_quantity: allocation.allocated,
                property_allocated_date: new Date().getTime(),
                property_status: property.property_status,
                property_original_value: Number(property.property_original_value),
                property_control_number: property.property_control_number,
                is_vehicle: isVehicle
            };

            propertyUpdateList.push(propertyUpdates);
            propertyIds.push(allocation.property_id);
            allocatedPropertyList.push({ property_name: property.property_name, ICN: property.property_control_number, allocated_quantity: allocation.allocated });
        }

        await withTransaction(async (transaction) => {
            await Promise.all(
                propertyUpdateList.map(async (property) => {
                    // Require pickup evidence if:
                    // 1. Property is a vehicle (regardless of AOC), OR
                    // 2. Property value meets the AOC threshold
                    const requiresPickupEvidence = property.is_vehicle ||
                        property.property_original_value >= envvars.businessRules.pickupEvidenceOACThreshold;

                    await PropertyService.updateProperty(property.property_id,
                        {
                            property_allocated_quantity: property.property_allocated_quantity,
                            property_denied_quantity: property.property_denied_quantity,
                            property_allocated_date: new Date().getTime(),
                            is_denied: false,
                            property_denial_date: null,
                            property_status: requiresPickupEvidence ? PropertyStatusEnum.PICKUP_EVIDENCE_REQUIRED : PropertyStatusEnum.PICKUP_READY
                        },
                        transaction
                    );
                })
            )

            const allProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
            const status = PropertyService.getRequestAllocationStatus(allProperties);
            await RequestService.updateRequest(requestId, { status }, transaction)

            //not allocated ones
            // const notAllocatedProperties = await PropertyService.getAllPropertiesByRequestId(requestId, { allocation: false, isCanceled: false }, transaction);
            // const requestStatus = notAllocatedProperties.length === 0 ? RequestStatusEnum.ALLOCATED : RequestStatusEnum.PARTIALLY_ALLOCATED;
            // const request = await RequestService.updateRequest(requestId, { status: requestStatus }, transaction)

            // Email notification for allocated properties
            const user = await RequestService.getUserByRequestId(requestId);
            const allocationDate = new Date().toLocaleDateString('en-US');
            const renderData = {
                templateName: TemplateEnum.Property_Allocation,
                data: {
                    name: user.name,
                    doneeAccountNameAndState: `${request?.doneeAccount?.name} (${request?.doneeAccount?.state?.stateName})`,
                    organizationName: request?.doneeAccount?.organization?.name,
                    tcn: request.tcn,
                    allocatedPropertyList
                }
            };
            const mailContent = await renderEmail(renderData);
            const mailData = {
                to: user.email as string,
                subject: `Properties allocated - ${allocationDate} - ${request?.doneeAccount?.organization?.name} - ${request?.doneeAccount?.name} - ${request.tcn}`,
                html: mailContent as string,
            };
            await emailQueue.add('propertyAllocationNotification', mailData, { removeOnComplete: true, attempts: 3, });
            await NotificationFactory.createNotification(NotificationType.PROPERTIES_ALLOCATED, { request, allocatedPropertyList });

            sendSuccess(res, request);
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const denyPropertiesInRequest = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const propertIds = req.body.propertyIds;

        const denyReason = req.body.denyReason?.trim();
        if (!denyReason) throw new AppError(400, 'Deny reason is required');

        const propertyDenialList: { property_id: number; property_quantity: number, ICN: string, property_name: string, deny_reason: string }[] = [];

        for (let propertyId of propertIds) {
            const property = await PropertyService.getPropertyById(propertyId);

            if (!property || property.request_id !== requestId) throw new AppError(400, 'Property is not belong to this request');
            if (property?.is_picked_up) throw new AppError(400, 'Can not deny picked up properties');
            if (property?.is_cancelled) throw new AppError(400, 'Can not deny cancelled properties');

            propertyDenialList.push({ property_id: propertyId, property_quantity: property.property_quantity, ICN: property.property_control_number, property_name: property.property_name, deny_reason: denyReason })
        }

        await withTransaction(async (transaction) => {
            await Promise.all(
                propertyDenialList.map(async (property) => {
                    await PropertyService.updateProperty(property.property_id,
                        {
                            is_denied: true,
                            property_denial_date: Date.now(),
                            property_denial_reason: property.deny_reason,
                            property_denied_quantity: property.property_quantity,
                            property_allocated_quantity: 0,
                            property_allocated_date: null,
                            property_cancellation_date: null,
                            property_status: PropertyStatusEnum.DENIED,
                        },
                        transaction
                    );
                    await PropertyService.updateCompetingStatusAfterChange(property.property_id, transaction);
                })
            );

            const allProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
            const status = PropertyService.getRequestAllocationStatus(allProperties);
            await RequestService.updateRequest(requestId, { status }, transaction);

            //all properties except cancelled ones
            // const allProperties = await PropertyService.getAllPropertiesByRequestId(requestId, { isCanceled: false }, transaction);
            // const deniedProperties = allProperties.filter((property: any) => property.is_denied);
            // const allocatedProperties = allProperties.filter((property: any) => property.property_allocated_date);

            // let status;
            // if (allProperties.length === deniedProperties.length) status = RequestStatusEnum.DENIED;
            // if (allocatedProperties.length > 0) status = RequestStatusEnum.PARTIALLY_ALLOCATED;
            // await RequestService.updateRequest(requestId, { status }, transaction);
        });

        //mail notification for denied properties 
        const user = await RequestService.getUserByRequestId(requestId);
        const cancellationDateStr = new Date().toLocaleDateString('en-US');
        const renderData = {
            templateName: TemplateEnum.Property_Denial,
            data: {
                name: user.name,
                propertyDenialList,
                denyReason: denyReason,
                cancellationDate: cancellationDateStr,
            }
        }

        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: user.email as string,
            subject: 'Property Denial Notification' as string,
            html: mailContent as string,
        };

        await emailQueue.add('propertyDenialNotification', mailData, { removeOnComplete: true, attempts: 3, });
        await NotificationFactory.createNotification(NotificationType.PROPERTIES_DENIED, { requestId });
        sendSuccess(res);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const cancelPropertiesInRequest = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);


        // Import and use the validation schema
        const { propertyCancellationSchema } = await import('@/properties/validators/propertySchema');
        const validatedBody = await propertyCancellationSchema.validate(req.body, { abortEarly: false });


        const { propertyIds, cancellationReason } = validatedBody as { propertyIds: number[], cancellationReason: string };
        const propertyCancelList: { property_id: number; ICN: string; property_name: string; is_late_cancelled: boolean | undefined; cancellation_reason: string; }[] = [];

        for (let propertyId of propertyIds) {
            const property = await PropertyService.getPropertyById(propertyId);
            let isLateCancellation;

            if (!property || property.request_id !== requestId) throw new AppError(400, 'Property is not belong to this request');
            if (property?.is_picked_up) throw new AppError(400, 'Property is already picked up');
            if (property?.is_cancelled) throw new AppError(400, 'Property is already cancelled');
            if (property?.is_denied) throw new AppError(400, 'Property is already denied');

            if (property?.property_allocated_date) {
                const differenceInTime = calculateDayDifference(property?.property_allocated_date)
                isLateCancellation = differenceInTime > 5;
            }

            propertyCancelList.push({ property_id: propertyId, ICN: property.property_control_number, property_name: property.property_name, is_late_cancelled: isLateCancellation, cancellation_reason: cancellationReason.trim() })
        }

        await withTransaction(async (transaction) => {
            await Promise.all(
                propertyCancelList.map(async (property) => {
                    await PropertyService.updateProperty(property.property_id,
                        {
                            is_cancelled: true,
                            is_late_cancelled: property.is_late_cancelled,
                            property_cancellation_date: new Date().getTime(),
                            property_cancellation_reason: cancellationReason.trim(),
                            property_status: PropertyStatusEnum.CANCELED,
                            property_allocated_date: null,
                            property_allocated_quantity: 0,
                            property_denied_quantity: 0,
                        },
                        transaction
                    );
                    await PropertyService.updateCompetingStatusAfterChange(property.property_id, transaction);
                })
            )

            const allProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
            const status = PropertyService.getRequestAllocationStatus(allProperties);
            if (status) await RequestService.updateRequest(requestId, { status }, transaction)

            //all properties except cancelled ones
            // const allProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
            // const cancelledProperties = allProperties.filter((property: any) => property.is_cancelled);

            // if (allProperties.length === cancelledProperties.length) await RequestService.updateRequest(requestId, { status: RequestStatusEnum.CANCELED }, transaction);
        });

        const request = await RequestService.getRequestById(requestId, false);
        const cancellationDateStr = new Date().toLocaleDateString('en-US');

        const isSaspUser = await SaspUser.findOne({
            where: { userId: req.user.id },
            include: [{ model: User, as: 'user' }]
        });

        if (isSaspUser) {
            //mail notification for cancelled properties 
            const user = await RequestService.getUserByRequestId(requestId);
            const renderData = {
                templateName: TemplateEnum.Property_Cancellation,
                data: {
                    name: user.name,
                    propertyCancelList,
                    cancellationReason: cancellationReason.trim(),
                    cancellationDate: cancellationDateStr,
                    tcn: request?.tcn || 'N/A',
                    canceledByName: req.user?.name,
                    organizationName: request?.doneeAccount?.organization?.name,
                    doneeAccountNumber: request?.doneeAccount?.name,
                }
            }

            const mailContent = await renderEmail(renderData);
            const mailData = {
                to: user.email as string,
                subject: 'Property Cancellation Notification' as string,
                html: mailContent as string,
            };

            await emailQueue.add('propertyCancellationNotification', mailData, { removeOnComplete: true, attempts: 3, });
            await NotificationFactory.createNotification(NotificationType.PROPERTIES_CANCELED_DONEE, { requestId });
        } else {
            const saspRecipients = await UserScope.findAll({
                include: [
                    {
                        association: 'saspUser',
                        where: { stateId: request.doneeAccount?.stateId, is_active: true },
                        required: true,
                    },
                ],
            });

            for (const recipient of saspRecipients) {
                const saspUser = await User.findByPk(recipient.user_id);
                if (!saspUser?.email) continue;
                const renderData = {
                    templateName: TemplateEnum.Property_Cancellation_SASP,
                    data: {
                        name: saspUser.name || 'SASP Member',
                        propertyCancelList,
                        cancellationDate: cancellationDateStr,
                        organizationName: request?.doneeAccount?.organization?.name,
                        doneeAccountNumber: request?.doneeAccount?.name,
                        cancellationReason: cancellationReason.trim(),
                        canceledByName: req.user?.name,
                        tcn: request?.tcn || 'N/A',
                    }
                }
                const mailContent = await renderEmail(renderData);
                const mailData = {
                    to: saspUser.email as string,
                    subject: 'Property Cancellation Alert',
                    html: mailContent as string
                }
                await emailQueue.add('propertyCancellationNotificationSASP', mailData, { removeOnComplete: true, attempts: 3 }
                );
            }

            await NotificationFactory.createNotification(NotificationType.PROPERTIES_CANCELED_SASP, { requestId });
        }

        sendSuccess(res);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const unCancelPropertiesInRequest = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const propertyIds = req.body.propertyIds;
        const propertyUncancelList: { property_id: number }[] = [];
        const request = await RequestService.getRequestById(requestId);

        if (!request) throw new AppError(400, 'Cannot found request');


        for (let propertyId of propertyIds) {
            const property = await PropertyService.getPropertyById(propertyId);

            if (!request?.doneeAccount) throw new AppError(400, 'Could not find the request\'s donee account');
            try {
                await PropertyService.checkDuplicatePropertyByICN(property.property_control_number, request.doneeAccount);
            } catch {
                throw new AppError(400, 'This property already requested by donee in another request for that reason uncancelation is not possible');
            }

            if (!property || property.request_id !== requestId) throw new AppError(400, 'Property does not belong to this request');
            if (!property?.is_cancelled) throw new AppError(400, 'Property is not cancelled');
            if (property?.is_denied) throw new AppError(400, 'Property is denied and cannot be uncancelled');
            if (property?.is_picked_up) throw new AppError(400, 'Property is already picked up and cannot be uncancelled');
            if (property?.property_allocated_date) throw new AppError(400, 'Property must be not allocated to be uncancelled');

            // Check surplusReleaseDate (must not be passed)
            const surplusReleaseDate = property.property_surplus_release_date;
            if (typeof surplusReleaseDate !== 'number' || Date.now() > surplusReleaseDate) throw new AppError(400, 'Cannot uncancel property: surplus release date has passed');

            propertyUncancelList.push({ property_id: propertyId });
        }

        await withTransaction(async (transaction) => {
            await Promise.all(
                propertyUncancelList.map(async (property) => {
                    await PropertyService.updateProperty(property.property_id,
                        {
                            is_cancelled: false,
                            is_late_cancelled: false,
                            property_cancellation_date: null,
                            property_status: null,
                        },
                        transaction
                    );
                    await PropertyService.updateCompetingStatusAfterChange(property.property_id, transaction);
                })
            );

            const allProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
            let status = PropertyService.getRequestAllocationStatus(allProperties);
            if (!status) status = request.tcn ? RequestStatusEnum.SUMITTED_TO_GSA : RequestStatusEnum.PENDING;

            await RequestService.updateRequest(requestId, { status }, transaction);
            await NotificationFactory.createNotification(NotificationType.PROPERTIES_UN_CANCELED, { requestId });
        });

        sendSuccess(res);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const updatePropertyStatusInRequest = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const properties = req.body.properties;
        const propertyUpdateList: { property_id: number, property_status: string }[] = [];

        for (let prop of properties) {
            const property = await PropertyService.getPropertyById(
                prop.property_id
            );

            if (property.request_id !== requestId) throw new AppError(400, 'Property request id not correct');
            if (prop.status !== PropertyStatusEnum.CANNIBALIZE && prop.status !== PropertyStatusEnum.ABANDONN_AND_DESTROY && prop.status !== PropertyStatusEnum.COMPETING) throw new AppError(400, 'Property status not correct');
            if (property.property_status === PropertyStatusEnum.CANCELED) throw new AppError(400, 'Property is already canceled');

            propertyUpdateList.push({
                property_id: property.property_id,
                property_status: prop.status
            });
        }

        await withTransaction(async (transaction) => {
            await Promise.all(
                propertyUpdateList.map(property =>
                    PropertyService.updateProperty(
                        property.property_id,
                        {
                            property_status: property.property_status
                        },
                        transaction
                    )
                )
            );
        })

        sendSuccess(res, { message: 'Properties updated successfuly' });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const markPropertiesAsPickedUpInRequest = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const properties = req.body.properties;
        const propertyUpdateList: { property_id: number, is_picked_up: boolean, property_pickup_date: number, proof_of_possession_path: string | null | undefined }[] = [];
        const allowedPropertyStatusesForPickup = [PropertyStatusEnum.PICKUP_EVIDENCE_REQUIRED, PropertyStatusEnum.PICKUP_READY] as string[];

        const loarAttachment = await RequestAttachmentService.getAttachment({ request_id: requestId, attachment_type: RequestAttachmentTypeEnum.LOAR });
        if (!loarAttachment) throw new AppError(400, 'LOAR is required for pickup');

        for (let { property_id, attachment_id } of properties) {
            const property = await PropertyService.getPropertyById(property_id);

            if (!property || property.request_id !== requestId) throw new AppError(400, 'Property does not belong to this request');
            if (property?.is_picked_up) throw new AppError(400, 'Property is already picked up');
            if (property.property_status && !allowedPropertyStatusesForPickup.includes(property.property_status)) throw new AppError(400, `Property can not be picked up ${property.property_control_number}`);
            if (property.property_status === PropertyStatusEnum.PICKUP_EVIDENCE_REQUIRED && !attachment_id) throw new AppError(400, `Property pickup evidence is required for ${property.property_control_number}`);

            if (property?.is_cancelled) throw new AppError(400, 'Property is already cancelled');
            if (!property?.property_allocated_date) throw new AppError(400, 'Property is not allocated');

            let attachment;
            if (attachment_id) {
                attachment = await RequestAttachmentService.getAttachment({ id: attachment_id });
                if (!attachment) throw new AppError(400, 'Unable to fetch attachment');
            }

            propertyUpdateList.push({
                property_id: property.property_id,
                is_picked_up: true,
                property_pickup_date: property.property_pickup_date ?? new Date().getTime(),
                proof_of_possession_path: attachment?.file_path ?? undefined
            })
        }

        await withTransaction(async (transaction) => {
            await Promise.all(
                propertyUpdateList.map(async (prop: { property_id: number, is_picked_up: boolean, property_pickup_date: number, proof_of_possession_path: string | null | undefined }) => {
                    await PropertyService.updateProperty(prop.property_id,
                        {
                            is_picked_up: prop.is_picked_up,
                            property_pickup_date: prop.property_pickup_date,
                            proof_of_possession_path: prop.proof_of_possession_path,
                            property_status: prop.proof_of_possession_path ? PropertyStatusEnum.PICKUP_EVIDENCE_SUBMITTED : PropertyStatusEnum.PICKUP_APPROVED,
                        },
                        transaction
                    )
                })
            );

            const allRequestProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
            const activeProperties = allRequestProperties.filter(p => !p.is_cancelled && !p.is_denied);
            const pickupApprovedProperties = activeProperties.filter((property: any) => property.property_status === PropertyStatusEnum.PICKUP_APPROVED);
            const pickupEvidenceSubmittedProperties = activeProperties.filter((property: any) => property.property_status === PropertyStatusEnum.PICKUP_EVIDENCE_SUBMITTED);

            // if at least 1 submitted exist and total count equals to submitted ones + picked up than it is waiting for approval 
            const isAwatingApproval = pickupEvidenceSubmittedProperties.length > 0 && pickupApprovedProperties.length + pickupEvidenceSubmittedProperties.length === activeProperties.length ? true : false;
            if (isAwatingApproval) await RequestService.updateRequest(requestId, { status: RequestStatusEnum.AWATING_PICKUP_APPROVAL }, transaction);

            //if the all properties are pickupApproved and oac < 5 for each than no sasp review needed its time to create invoices
            if (pickupApprovedProperties.length === activeProperties.length) await RequestService.updateRequest(requestId, { status: RequestStatusEnum.INVOICE_REQUIRED }, transaction);

        })
        await NotificationFactory.createNotification(NotificationType.PROPERTIES_PICKED_UP, { requestId });
        sendSuccess(res);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const pickupApproval = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const propertyIds = req.body.propertyIds;

        for (let propertyId of propertyIds) {
            const property = await PropertyService.getPropertyById(propertyId);

            if (!property || property.request_id !== requestId) throw new AppError(400, 'Property does not belong to this request');
            if (property?.is_cancelled) throw new AppError(400, 'Property is already cancelled');
            if (!property?.property_allocated_date) throw new AppError(400, 'Property is not allocated');
        }


        await withTransaction(async (transaction) => {
            await Promise.all(
                propertyIds.map(async (id: number) => {
                    await PropertyService.updateProperty(id, { property_status: PropertyStatusEnum.PICKUP_APPROVED }, transaction)
                })
            );

            const allRequestProperties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
            const activeProperties = allRequestProperties.filter(p => !p.is_cancelled && !p.is_denied);
            const pickupApprovedProperties = activeProperties.filter((property: any) => property.property_status === PropertyStatusEnum.PICKUP_APPROVED);
            //if the all properties are pickupApproved and oac < 5 for each than no sasp review needed its time to create invoices
            if (pickupApprovedProperties.length === activeProperties.length) await RequestService.updateRequest(requestId, { status: RequestStatusEnum.INVOICE_REQUIRED }, transaction);
        });

        await NotificationFactory.createNotification(NotificationType.PROPERTIES_PICKED_UP, { requestId });
        sendSuccess(res);
    } catch (error) {
        sendError(req, res, error);
    }
}


export const getRequestForSasp = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.id;
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 10;
        const filterKey = req.query.filterKey as RequestFilterKeys;
        const filterValue = req.query.filterValue as string;
        const operator = req.query.operator as string;
        const sortBy = req.query.sortBy as string;
        const sortOrder = req.query.sortOrder as string;
        const filters = parseFiltersFromQuery(req.query);

        const requests = await RequestService.getAllSaspRequest(
            userId,
            page,
            limit,
            filterKey,
            operator,
            filterValue,
            sortBy,
            sortOrder,
            filters
        );

        sendSuccess(res, requests);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getRequestCountsForSasp = async (req: Request, res: Response) => {
    try {
        const stateId = req.query.stateId as string;
        // Don't apply filters to counts - always return unfiltered totals for all statuses
        const counts = await RequestService.getRequestCountsByStatus(Number(stateId));
        sendSuccess(res, counts);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const generateInvoice = async (req: Request, res: Response) => {
    try {
        const requestId = parseId(req.params.requestId);
        const { invoiceSerie } = req.body;
        const request = req.request;

        if (isNaN(requestId)) throw new AppError(400, 'Invalid request ID');

        const doneeAccount = request.doneeAccount;
        if (!doneeAccount) throw new AppError(400, "Could not find the request's donee account");

        const organization = doneeAccount.organization;
        if (!organization) throw new AppError(400, "Could not find the request's organization");

        await withTransaction(async (transaction) => {
            await DocumentFactory.handler(DocumentActionType.GENERATE_INVOICE, { request, createdBy: req.user, invoiceSerie }, transaction)
            await request.update({ status: RequestStatusEnum.INVOICE_SIGNATURE_REQUIRED }, { transaction });
            await NotificationFactory.createNotification(NotificationType.INVOICE_GENERATED, { request, updatedBy: req.user?.id })
        })
        sendSuccess(res, {}, 201);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const reportInvoicePayment = async (req: Request, res: Response) => {
    try {
        const request = req.request;
        const { requestAttachmentId, memo } = req.body
        const doneeAccount = request.doneeAccount;
        if (!doneeAccount) throw new AppError(400, "Could not find the request's donee account");

        await withTransaction(async (transaction) => {
            await RequestService.requestToMarkInvoiceAsPaid({ requestAttachmentId, signedBy: req.user, memo }, transaction)
            await NotificationFactory.createNotification(NotificationType.INVOICE_PAYMENT_REQUESTED, { request });
        });
        sendSuccess(res, {}, 201);
    } catch (error) {
        sendError(req, res, error);
    }
}



export const updateInvoiceMemo = async (req: Request, res: Response) => {
    try {
        const request = req.request;
        const { requestAttachmentId, memo_sasp, memo_organization } = req.body
        const doneeAccount = request.doneeAccount;
        if (!doneeAccount) throw new AppError(400, "Could not find the request's donee account");

        await RequestService.updateInvoiceMemo(requestAttachmentId, memo_sasp, memo_organization);
        sendSuccess(res, {}, 201);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const sigInvoice = async (req: Request, res: Response) => {
    try {
        const request = req.request;
        const { requestAttachmentId } = req.body
        const doneeAccount = request.doneeAccount;
        if (!doneeAccount) throw new AppError(400, "Could not find the request's donee account");

        await withTransaction(async (transaction) => {
            await DocumentFactory.handler(DocumentActionType.SIGN_INVOICE, { request, signedBy: req.user, requestAttachmentId, stateId: doneeAccount.stateId }, transaction)
            // HOTFIX: Update request status to INVOICE_SIGNED after invoice is signed
            await request.update({ status: RequestStatusEnum.INVOICE_SIGNED }, { transaction });
            await NotificationFactory.createNotification(NotificationType.INVOICE_SIGNED, { request });
        });
        sendSuccess(res, {}, 201);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const cancelInvoice = async (req: Request, res: Response) => {
    try {
        const request = req.request;
        const { requestAttachmentId } = req.body;
        const doneeAccount = request.doneeAccount;
        if (!doneeAccount) throw new AppError(400, "Could not find the request's donee account");

        await withTransaction(async (transaction) => {
            await RequestService.requestToCancelInvoice({ requestAttachmentId, canceledBy: req.user }, transaction);
            await NotificationFactory.createNotification(NotificationType.INVOICE_CANCELED, { requestId: request.id as number, tcn: request.tcn ?? undefined });
        });

        sendSuccess(res, {}, 200);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const updatePropertyInRequest = async (req: Request, res: Response) => {
    let requestId: number = NaN;
    let propertyId: number = NaN;
    try {
        requestId = parseId(req.params.requestId);
        propertyId = parseId(req.params.propertyId);
        const property = await PropertyService.getPropertyById(propertyId);
        if (!property || property.request_id !== requestId) throw new AppError(404, 'Property not found in this request');

        const { updates, quantityChanged, oldQuantity, newQuantity } = await buildPropertyUpdateForQtyAndJustification(req, property, { requestId, propertyId });

        await withTransaction(async (transaction) => {
            const updatedProperty = await PropertyService.updateProperty(propertyId, updates, transaction);
            if (quantityChanged) {
                await NotificationFactory.createNotification(NotificationType.REQUEST_QUANTITY_UPDATED, {
                    property: updatedProperty,
                    updatedBy: req.user?.id,
                    oldQuantity,
                    newQuantity,
                });
            }
            sendSuccess(res, updatedProperty);
        });
    } catch (error) {
        logger.error('updatePropertyInRequest error', { requestId, propertyId, error });
        sendError(req, res, error);
    }
};

export const updatePropertyQuantityJustificationByPropertyId = async (req: Request, res: Response) => {
    let propertyId: number = NaN;
    try {
        propertyId = parseId(req.params.propertyId);
        // removed verbose info log: updatePropertyQuantityJustificationByPropertyId called

        const property = await PropertyService.getPropertyById(propertyId);
        if (!property) {
            throw new AppError(404, 'Property not found');
        }

        const { updates, quantityChanged, oldQuantity, newQuantity } = await buildPropertyUpdateForQtyAndJustification(req, property, { propertyId });

        await withTransaction(async (transaction) => {
            const updatedProperty = await PropertyService.updateProperty(propertyId, updates, transaction);
            if (quantityChanged) {
                await NotificationFactory.createNotification(NotificationType.REQUEST_QUANTITY_UPDATED, {
                    property: updatedProperty,
                    updatedBy: req.user?.id,
                    oldQuantity,
                    newQuantity,
                });
            }
            sendSuccess(res, updatedProperty);
        });
    } catch (error) {
        logger.error('updatePropertyQuantityJustificationByPropertyId error', { propertyId, error });
        sendError(req, res, error);
    }
};

export const checkInvoiceAmountLessThanPenny = async (req: Request, res: Response) => {
    try {
        const { requestId } = req.params;
        const request = await RequestService.getRequestById(Number(requestId), false);
        if (!request) return res.status(404).json({ error: 'Request not found for invoiceId' });

        const assetInfo = await InvoiceService.createAssetInformation(request);
        const isLessThanPenny = assetInfo.total_pennies < 1;

        sendSuccess(res, { isLessThanPenny, total_pennies: assetInfo.total_pennies });
    } catch (err) {
        sendError(req, res, err);
    }
};

