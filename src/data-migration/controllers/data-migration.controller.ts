import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper'
import envvars from '@/config/envvars';
import { AppError } from '@/utils/response/appError';
import { DataMigrationService } from '../services/data-migration.services';
import path from 'path'
import { StoragePaths } from '@/utils/storage/paths';
import { SinglePropertyMigrationDto } from '../interfaces/SinglePropertyMigration.dto';
import { EligibilityService } from '../../eligibility/services/eligibility.service';
import { OrganizationAddressService } from '@/organization/services/organizationAddress.service';

export const migrate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey, stateName } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');
        if (!stateName) throw new AppError(400, 'stateName must be provided');

        const fileName = `${stateName}_migration.xlsx`;
        const migrationFileDirectory = StoragePaths.data_migration;
        const migrationFilePath = path.join(migrationFileDirectory, fileName);
        const migrationResults = await DataMigrationService.migrateFromExcel(migrationFilePath);

        sendSuccess(res, migrationResults);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const fixMalformedEligibilityApplications = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        await EligibilityService.fixMalformedEligibilityApplications();
        sendSuccess(res, { message: 'process completed' });
    } catch (error) {
        sendError(req, res, error);
    }
};


export const fixRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const response = await DataMigrationService.fixMalformedRequests();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const fixRequestManually = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey, canonicalId, otherRequestIds } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');
        if (!canonicalId || !otherRequestIds || otherRequestIds.length < 1) throw new AppError(400, 'is active must be a boolean');

        const response = await DataMigrationService.fixMalformedRequestsManually(canonicalId, otherRequestIds);
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const cleanUpMergedRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const response = await DataMigrationService.cleanupMergedRequests();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
}


export const revertCanonicalRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const response = await DataMigrationService.cleanupCanonicalRequestProperties();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
}


export const revertMergedRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey, requestIds, newStatus } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');
        if (!Array.isArray(requestIds) || !requestIds.every((id: any) => typeof id === 'number')) throw new AppError(400, 'requestIds must be an array of numbers');
        if (typeof newStatus === 'undefined' || newStatus === null) throw new AppError(400, 'newStatus must be provided');

        const response = await DataMigrationService.revertMergedRequestStatuses(requestIds, newStatus);
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const importLegacyPropertyData = async (req: Request, res: Response) => {
    try {
        const { migrationKey, stateName } = req.body
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');
        if (!stateName) throw new AppError(400, 'stateName must be provided');

        const fileName = `${stateName}_legacy_property_migration.xlsx`;
        const migrationFileDirectory = StoragePaths.data_migration;
        const migrationFilePath = path.join(migrationFileDirectory, fileName);
        const migrationResults = await DataMigrationService.importLegacyPropertyData(migrationFilePath);
        sendSuccess(res, migrationResults);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const migrateSba8aCertificationDate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const result = await EligibilityService.migrateAllSba8aCertificationDates();
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const migrateOrganizationAddresses = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const result = await OrganizationAddressService.migrateAllOrganizationsFromLatestForm1();
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
}

export const migrateLegacyPropertyRecord = async (req: Request, res: Response): Promise<void> => {
    try {
        const dto = req.body as SinglePropertyMigrationDto;
        if (typeof dto.id !== 'number') throw new AppError(400, 'Field "id" must be provided and a number');

        const result = await DataMigrationService.migrateSingleLegacyData(dto);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const requestLegacyPropertyMigration = async (req: Request, res: Response): Promise<void> => {
    try {
        const legacyPropertyId = Number(req.params.legacyPropertyId);
        const doneeAccountId = Number(req.params.doneeAccountId);

        if (isNaN(legacyPropertyId) || isNaN(doneeAccountId)) throw new AppError(400, 'legacyPropertyId and doneeAccountId must be valid numbers');

        const result = await DataMigrationService.requestLegacyPropertyMigration(legacyPropertyId, doneeAccountId);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const rejectLegacyPropertyMigration = async (req: Request, res: Response): Promise<void> => {
    try {
        const { legacyPropertyId } = req.body;

        const result = await DataMigrationService.rejectPropertyMigration(legacyPropertyId);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getAllLegacyPropertyData = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            stateId,
            doneeAccountId,
            page = 1,
            limit = 10,
            search,
            sortBy,
            sortOrder,
            filterKey,
            filterValue,
            operator = 'contains',
            migrationStatus,
        } = req.query;

        const stateIdNum = stateId != null && stateId !== '' && !isNaN(Number(stateId)) ? Number(stateId) : undefined;
        const doneeAccountIdNum = doneeAccountId != null && doneeAccountId !== '' && !isNaN(Number(doneeAccountId)) ? Number(doneeAccountId) : undefined;
        const payload = { stateId: stateIdNum, doneeAccountId: doneeAccountIdNum };

        const result = await DataMigrationService.getAllLegacyPropertyData(
            payload,
            Number(page),
            Number(limit),
            search as string,
            sortBy as string | undefined,
            (sortOrder as 'asc' | 'desc') || 'asc',
            filterKey as string | undefined,
            filterValue as string | undefined,
            (operator as string) || 'contains',
            migrationStatus as string | undefined,
        );
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getAllLegacyPropertyCounts = async (req: Request, res: Response): Promise<void> => {
    try {
        const { stateId, doneeAccountId, search } = req.query;
        const stateIdNum = stateId != null && stateId !== '' && !isNaN(Number(stateId)) ? Number(stateId) : undefined;
        const doneeAccountIdNum = doneeAccountId != null && doneeAccountId !== '' && !isNaN(Number(doneeAccountId)) ? Number(doneeAccountId) : undefined;
        const payload = { stateId: stateIdNum, doneeAccountId: doneeAccountIdNum };
        const result = await DataMigrationService.getLegacyPropertyCounts(payload, search as string);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getLegacyPropertyData = async (req: Request, res: Response): Promise<void> => {
    try {
        const legacyPropertyId = Number(req.params.legacyPropertyId);
        if (isNaN(legacyPropertyId)) throw new AppError(400, 'legacyPropertyId must be a valid number');

        const result = await DataMigrationService.getLegacyPropertyData(legacyPropertyId);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const invoiceSchemaUpdate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const response = await DataMigrationService.invoiceSchemaUpdate();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const invoicesDisposalConditionCodeUpdate = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const response = await DataMigrationService.invoicesDisposalConditionCodeUpdate();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const fixDeniedPropertiesAndRequestStatuses = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const response = await DataMigrationService.fixDeniedPropertiesAndRequestStatuses();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const generateQboCustomers = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const { limit, offset, doneeAccountIds } = req.query;

        const parsedLimit = limit !== undefined ? Number(limit) : undefined;
        if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
            throw new AppError(400, 'limit query parameter must be a positive integer');
        }

        const parsedOffset = offset !== undefined ? Number(offset) : undefined;
        if (parsedOffset !== undefined && (!Number.isInteger(parsedOffset) || parsedOffset < 0)) {
            throw new AppError(400, 'offset query parameter must be a non-negative integer');
        }

        const parsedDoneeAccountIds = typeof doneeAccountIds === 'string' && doneeAccountIds.trim().length > 0
            ? doneeAccountIds.split(',').map((id) => Number(id.trim()))
            : undefined;

        if (parsedDoneeAccountIds && parsedDoneeAccountIds.some((id) => !Number.isInteger(id) || id <= 0)) {
            throw new AppError(400, 'doneeAccountIds query parameter must be a comma-separated list of positive integers');
        }

        const response = await DataMigrationService.generateQboCustomers({
            limit: parsedLimit,
            offset: parsedOffset,
            doneeAccountIds: parsedDoneeAccountIds,
        });
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const generateQboInvoices = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const { batch_size } = req.query;
        if (batch_size === undefined || batch_size === '') throw new AppError(400, 'batch_size query parameter is required');
        const parsed_batch_size = Number(batch_size);
        if (!Number.isInteger(parsed_batch_size) || parsed_batch_size <= 0) {
            throw new AppError(400, 'batch_size query parameter must be a positive integer');
        }

        const response = await DataMigrationService.generateQboInvoices(parsed_batch_size);
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const markInvoicesPaidAndCompleteRequests = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey, invoiceIds } = req.body;
        const migration = envvars.migration;

        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');
        if (!Array.isArray(invoiceIds) || invoiceIds.length < 1 || !invoiceIds.every((id: unknown) => typeof id === 'number' && Number.isFinite(id))) {
            throw new AppError(400, 'invoiceIds must be a non-empty array of numbers');
        }

        const response = await DataMigrationService.markInvoicesPaidAndCompleteRequests(invoiceIds);
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const backfill3040Mappings = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'isActive must be a boolean');

        const response = await DataMigrationService.backfill3040MappingsForExistingOrganizations();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const migrateEligibilityApplicationSignatures = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'Migration key is invalid');

        const response = await DataMigrationService.migrateEligibilityApplicationSignatures();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const assignPrimaryContactFromHeadWhereMissing = async (req: Request, res: Response): Promise<void> => {
    try {
        const { migrationKey } = req.body;
        const migration = envvars.migration;
        if (migrationKey !== migration.key) throw new AppError(400, 'Migration key is invalid');

        const response = await DataMigrationService.assignPrimaryContactFromHeadWhereMissing();
        sendSuccess(res, response);
    } catch (error) {
        sendError(req, res, error);
    }
};


