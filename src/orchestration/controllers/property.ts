import { Request, Response } from 'express';

import { sendSuccess, sendError } from '@/utils/response/responseHelper';

import { automaticPropertySchema, manualPropertySchema, updatePropertySchema } from '@/properties/validators/propertySchema';
import { parseId } from '@/utils/validators';

import { PropertyService } from '@/properties/services/property';
import { RequestMetadataService } from '@/metadata/services/request';
import { getAllMetadata } from '@/metadata/services/metadata';
import { withTransaction } from '@/utils/transactionalOperation';
import { RequestService } from '@/properties/services/request';
import { PropertyDataService } from '@/ppms/services/propertyData';
import { mapDiskPropertyToDbSchema } from '@/utils/property';
import { AppError } from '@/utils/response/appError';
import { PropertyCreationAttributes } from '../../properties/models/Property';
import { DoneeAccountService } from '@/organization/services/donee';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import { PropertyFilterKeys } from '@/enums/propertyFilterKeys.enum';
import Compliance from '@/compliance-utilization/models/Compliance.entity';
import { ComplianceService } from '@/compliance-utilization/services/Compliance.service';
import { ComplianceFilterKeys } from '@/enums/complianceFilterKeys.enum';
import { parseFiltersFromQuery } from '@/utils/filteringOperations';

/**
 * Returns donee submitted property data by propertyId.
 */
export const getDoneePropertyById = async (req: Request, res: Response) => {
    try {
        const propertyId = parseId(req.params.propertyId);
        const property = await PropertyService.getPropertyById(propertyId);
        sendSuccess(res, property);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Updates donee submitted property data by propertyId.
 */
export const updateDoneeProperty = async (req: Request, res: Response) => {
    try {
        const propertyId = parseId(req.params.propertyId);

        // Prevent updates to these fields
        delete req.body.donee_account;
        delete req.body.property_control_number;

        // Fetch metadata for validation
        const metadata = await getAllMetadata();
        const schemaProps = {
            propertyTypes: metadata.propertyTypes.map((p) => p.code).filter((v): v is string => !!v),
            disposalConditions: metadata.disposalConditions.map((d) => d.code).filter((v): v is string => !!v),
            supplyConditions: metadata.supplyConditions.map((s) => s.code).filter((v): v is string => !!v),
            demilConditions: metadata.demilConditions.map((d) => d.code).filter((v): v is string => !!v),
            ignoreSurplusReleaseDate: true
        };

        // Validate updates against the schema (in update mode)
        const validatedUpdates = await updatePropertySchema(schemaProps).validate(req.body, { abortEarly: false, stripUnknown: true });

        // Remove null values from updates
        const sanitizedUpdates = Object.fromEntries(
            Object.entries(validatedUpdates).filter(([_, value]) => value !== null)
        );

        // Update in DB
        const updatedProperty = await PropertyService.updateProperty(propertyId, sanitizedUpdates);
        await NotificationFactory.createNotification(NotificationType.REQUEST_UPDATED, { property: updatedProperty, updatedBy: req.user?.id });
        sendSuccess(res, updatedProperty);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Creates a new donee submitted property with manual input.
 */
export const createDoneePropertyManual = async (req: Request, res: Response) => {
    try {
        // Get all metadata for property schema validation
        const metadata = await getAllMetadata();
        const schemaProps = {
            propertyTypes: metadata.propertyTypes.map((p) => p.code).filter((v): v is string => !!v),
            disposalConditions: metadata.disposalConditions.map((d) => d.code).filter((v): v is string => !!v),
            supplyConditions: metadata.supplyConditions.map((s) => s.code).filter((v): v is string => !!v),
            demilConditions: metadata.demilConditions.map((d) => d.code).filter((v): v is string => !!v),
            ignoreSurplusReleaseDate: false
        };

        // Validate the request body against the property schema
        const validatedProperty = await manualPropertySchema(schemaProps).validate(req.body, { abortEarly: false });

        const userId = req.user.id; // User ID assigned by the middleware
        const userDoneeAccountId = req.doneeAccount.id; // Donee account ID assigned by the middleware

        await withTransaction(async (transaction) => {
            await PropertyService.checkDuplicatePropertyByICN(
                validatedProperty.property_control_number,
                req.doneeAccount,
                transaction
            );

            const existingRequestId = await PropertyService.geRequestIdFortMatchingProperty(
                validatedProperty.property_control_number,
                req.doneeAccount.id,
                validatedProperty.property_surplus_release_date,
                validatedProperty.property_location_city as string,
                validatedProperty.property_location_region_state as string,
                validatedProperty.property_location_postal_code as string,
            );

            let requestId;
            if (!existingRequestId) {
                const request = await RequestService.createRequest(userId, userDoneeAccountId, transaction);
                requestId = request.id;
            }

            const propertyData = {
                request_id: existingRequestId ?? requestId,
                ...validatedProperty
            };

            const property = await PropertyService.createProperty(
                propertyData as PropertyCreationAttributes,
                transaction
            );
            sendSuccess(res, property);
        });
    } catch (error) {
        sendError(req, res, error);
    }
}

/**
 * Creates a new donee submitted property with ICN.
 */
export const createDoneePropertyWithICN = async (req: Request, res: Response) => {
    try {
        const userId = req.user.id; // User ID assigned by the middleware
        const userDoneeAccountId = req.doneeAccount.id; // Donee account ID assigned by the middleware
        const validatedBody = await automaticPropertySchema().validate(req.body, { abortEarly: false });

        await withTransaction(async (transaction) => {
            const diskPropertyData = await PropertyDataService.getPropertyDetails(validatedBody.property_control_number);

            // Fetch Summary data for surplus release date 
            const summaryData = await PropertyDataService.getPropertySummaryByICN(validatedBody.property_control_number);
            const surplusReleaseDate = summaryData?.surplusReleaseDate || diskPropertyData.data.surplusReleaseDate;

            const unixTimeNow = new Date().getTime();
            const endOfReleaseDay = new Date(new Date(surplusReleaseDate).setHours(23, 59, 59, 999)).getTime();
            const isSurplusReleaseDatePassed = unixTimeNow > endOfReleaseDay;

            if (isSurplusReleaseDatePassed) {
                throw new AppError(400, 'The surplus release date has passed.');
            }

            if (validatedBody.property_quantity > diskPropertyData.data.quantity) {
                throw new AppError(400, 'The quantity requested exceeds the available quantity for this property.');
            }

            await PropertyService.checkDuplicatePropertyByICN(
                validatedBody.property_control_number,
                req.doneeAccount,
                transaction
            );

            const existingRequestId = await PropertyService.geRequestIdFortMatchingProperty(
                diskPropertyData.data.itemControlNumber,
                req.doneeAccount.id,
                new Date(surplusReleaseDate).getTime(),
                diskPropertyData.data.propertyLocation.city as string,
                diskPropertyData.data.propertyLocation.stateCode as string,
                diskPropertyData.data.propertyLocation.zip as string,
            );

            let requestId;
            if (!existingRequestId) {
                const request = await RequestService.createRequest(userId, userDoneeAccountId, transaction);
                requestId = request.id
            }

            // Map the disk property data to the database schema 
            const newPropertyData = await mapDiskPropertyToDbSchema(
                diskPropertyData,
                existingRequestId ?? requestId as number,
                validatedBody.property_justification,
                validatedBody.property_justification_extended ?? '',
                validatedBody.property_quantity
            );

            const property = await PropertyService.createProperty(newPropertyData, transaction);
            await NotificationFactory.createNotification(NotificationType.PROPERTY_REQUESTED_VIA_ICN, { property, doneeAccount: req.doneeAccount });
            sendSuccess(res, property);
        });
    } catch (error) {
        sendError(req, res, error);
    }
}

/*
* Gets state fees by donee account id 
*/
export const getStateFeesForDoneeAccount = async (req: Request, res: Response) => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);

        const fees = await DoneeAccountService.getStateFeesById(doneeAccountId)

        sendSuccess(res, fees);
    } catch (error) {

    }
}

/*
* Gets all properties by organization id
*/
export const getAllPropertiesByOrganizationId = async (req: Request, res: Response) => {
    try {
        const organizationId = req.params.organizationId;
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10);
        const filterKey = req.query.filterKey as PropertyFilterKeys;
        const operator = req.query.operator as string;
        const filterValue = req.query.filterValue as string;
        const sortBy = (req.query.sortBy as string) || 'createdAt';
        const sortOrder = (req.query.sortOrder as string) || 'desc';
        const filters = parseFiltersFromQuery(req.query);
        const properties = await PropertyService.getAllPropertiesByOrganizationId(organizationId, page, limit, filterKey, operator, filterValue, sortBy, sortOrder, filters);
        sendSuccess(res, properties);
    } catch (error) {
        sendError(req, res, error);
    }
}

/*
* Gets all property counts by organization id
*/
export const getAllPropertyCountsByOrganizationId = async (req: Request, res: Response) => {
    try {
        const organizationId = req.params.organizationId;
        // Don't apply filters to counts - always return unfiltered totals for all statuses
        const counts = await PropertyService.getAllPropertyCountsByOrganizationId(organizationId);
        sendSuccess(res, counts);
    } catch (error) {
        sendError(req, res, error);
    }
}

/*
* Gets all properties by state id
*/
export const getAllPropertiesByStateId = async (req: Request, res: Response) => {
    try {
        const stateId = parseId(req.params.stateId);
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
        const limit = Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10);
        const filterKey = req.query.filterKey as PropertyFilterKeys;
        const operator = req.query.operator as string;
        const filterValue = req.query.filterValue as string;
        const sortBy = (req.query.sortBy as string) || 'createdAt';
        const sortOrder = (req.query.sortOrder as string) || 'desc';
        const filters = parseFiltersFromQuery(req.query);
        const properties = await PropertyService.getAllPropertiesByStateId(stateId, page, limit, filterKey, operator, filterValue, sortBy, sortOrder, filters);
        sendSuccess(res, properties);
    } catch (error) {
        sendError(req, res, error);
    }
}

/*
* Gets all property counts by state id
*/
export const getAllPropertyCountsByStateId = async (req: Request, res: Response) => {
    try {
        const stateId = parseId(req.params.stateId);
        // Don't apply filters to counts - always return unfiltered totals for all statuses
        const counts = await PropertyService.getAllPropertyCountsByStateId(stateId);
        sendSuccess(res, counts);
    } catch (error) {
        sendError(req, res, error);
    }
}


// ------------------------ COMPLIANCE -------------------------------------------

/**
 * Uploads evidence file for a property.
 * Checks for display_name and description in the request body.
 */
export const uploadEvidence = async (req: Request, res: Response) => {
    try {
        const { propertyId } = req.params;
        const file = req.file;
        const { display_name, description } = req.body;

        if (!display_name) throw new AppError(400, 'display_name is required for file upload.');
        if (!description) throw new AppError(400, 'description is required for file upload.');

        await withTransaction(async (transaction) => {
            const response = await ComplianceService.uploadEvidence({ propertyId: Number(propertyId), file, fileName: display_name, uploadedBy: req.user.id, description }, transaction);
            sendSuccess(res, { response, message: 'Evidence uploaded successfully.' });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Approves or rejects evidence for a property.
 * Expects { isApproved, comments } in the request body.
 */
export const evidenceApproval = async (req: Request, res: Response) => {
    try {
        const { isApproved, complianceDetails } = req.body;
        const { propertyId } = req.params;

        if (typeof isApproved !== 'boolean') throw new AppError(400, 'compliance must be approved or rejected.');

        await withTransaction(async (transaction) => {
            const result = await ComplianceService.approveOrRejectEvidence({
                isApproved,
                propertyId: Number(propertyId),
                reviewedBy: req.user.id,
                complianceDetails,
            }, transaction);
            sendSuccess(res, { result, message: `Evidence ${isApproved ? 'approved' : 'rejected'} successfully.` });
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Returns property with compliance
 */
export const getPropertyWithCompliance = async (req: Request, res: Response) => {
    try {
        const { propertyId } = req.params;
        const result = await ComplianceService.getPropertyWithComplianceDetails(Number(propertyId));
        sendSuccess(res, { result });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Returns all compliances
 */
export const getAllCompliancesForDonee = async (req: Request, res: Response) => {
    try {
        const { doneeAccountId } = req.params;
        const { page, limit, sortBy, sortOrder, filterKey, operator, filterValue } = req.query;
        const paginationDetails = {
            page: Number(page) || 1,
            limit: Number(limit) || 10,
        };
        const sortByStr = typeof sortBy === 'string' ? sortBy : undefined;
        const sortOrderStr = typeof sortOrder === 'string' && (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined;
        const filterKeyStr = typeof filterKey === 'string' ? filterKey : undefined;
        const operatorStr = typeof operator === 'string' ? operator : 'contains';
        const filterValueStr = typeof filterValue === 'string' ? filterValue : undefined;
        const filters = parseFiltersFromQuery(req.query);

        const result = await ComplianceService.getPropertiesByDoneeAccountId(
            Number(doneeAccountId),
            paginationDetails,
            sortByStr,
            sortOrderStr,
            (filterKeyStr as ComplianceFilterKeys),
            operatorStr,
            filterValueStr,
            filters,
        );
        sendSuccess(res, { result });
    } catch (error) {
        sendError(req, res, error);
    }
};


/**
 * Returns all compliances
 */
export const getAllCompliancesForState = async (req: Request, res: Response) => {
    try {
        const { stateId } = req.params;
        const { page, limit, sortBy, sortOrder, filterKey, operator, filterValue } = req.query;
        const paginationDetails = {
            page: Number(page) || 1,
            limit: Number(limit) || 10,
        };
        const sortByStr = typeof sortBy === 'string' ? sortBy : undefined;
        const sortOrderStr = typeof sortOrder === 'string' && (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined;
        const filterKeyStr = typeof filterKey === 'string' ? filterKey : undefined;
        const operatorStr = typeof operator === 'string' ? operator : 'contains';
        const filterValueStr = typeof filterValue === 'string' ? filterValue : undefined;
        const filters = parseFiltersFromQuery(req.query);

        const result = await ComplianceService.getPropertiesForSaspByState(
            Number(stateId),
            paginationDetails,
            sortByStr,
            sortOrderStr,
            (filterKeyStr as ComplianceFilterKeys),
            operatorStr,
            filterValueStr,
            filters,
        );
        sendSuccess(res, { result });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Downloads a compliance attachment by its ID.
 */
export const downloadComplianceAttachment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { attachmentId } = req.params;

        // Delegate to ComplianceService
        const { buffer, originalName, mimeType } = await ComplianceService.getComplianceAttachment(Number(attachmentId));

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
        res.send(buffer);
    } catch (err) {
        sendError(req, res, err);
    }
};

/**
 * Get properties with expired screening dates for a specific state (paginated).
 */
export const getPropertiesHavingExpiredScreeningDates = async (req: Request, res: Response) => {
    try {
        const { stateId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await PropertyService.getPropertiesHavingExpiredScreeningDatesWithPagination(Number(stateId), page, limit);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Get properties with screening dates expiring today for a specific state (paginated).
 */
export const getPropertiesHavingScreeningDatesExpiredToday = async (req: Request, res: Response) => {
    try {
        const { stateId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await PropertyService.getPropertiesHavingScreeningDatesExpiredTodayWithPagination(Number(stateId), page, limit);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Get properties with screening dates expiring in three days for a specific state (paginated).
 */
export const getPropertiesHavingScreeningDatesExpiredThreeDaysFromNow = async (req: Request, res: Response) => {
    try {
        const { stateId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const result = await PropertyService.getPropertiesHavingScreeningDatesExpiredThreeDaysFromNowWithPagination(Number(stateId), page, limit);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};
