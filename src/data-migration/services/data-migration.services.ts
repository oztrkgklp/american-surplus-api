import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from "@/utils/logger";
import State from '@/states/models/State';
import { withTransaction } from '@/utils/transactionalOperation';
import Organization from '@/organization/models/Organization';
import User from '@/authn/models/User';
import DoneeAccount from '@/organization/models/DoneeAccount';
import { hashPassword } from '@/utils/password';
import OrganizationUser from '@/organization/models/OrganizationUser';
import Role from '@/authz/models/Role';
import { PredefinedRoles } from '@/enums/predefinedRoles.enum';
import { AppError } from '@/utils/response/appError';
import { ScopeType } from '@/enums/scope.enum';
import Scope from '@/authz/models/Scope';
import UserScope from '@/authz/models/UserScope';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import Property from '@/properties/models/Property';
import Request from '@/properties/models/Request';
import { PropertyStatusEnum, RequestStatusEnum } from '@/enums/request-property-status.enum';
import RequestAttachment from '@/properties/models/RequestAttachment';
import { QueryTypes, Op } from 'sequelize';
import { PropertyService } from '@/properties/services/property';
import { RequestService } from '@/properties/services/request';
import LegacyPropertyData, { PropertyMigrationStatus } from '../models/LegacyPropertyData.model';
import { SinglePropertyMigrationDto } from '../interfaces/SinglePropertyMigration.dto';
import Compliance, { ComplianceStatus } from '@/compliance-utilization/models/Compliance.entity';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import Invoice, { InvoiceStatus } from '@/documents/models/Invoice.entity';
import InvoiceActivityLog, { InvoiceActivity } from '@/documents/models/InvoiceActivityLogs.entity';
import DocumentFactory, { DocumentActionType } from '@/documents/services/document-factory.service';
import { InvoiceService } from '@/documents/services/invoice.service';
import { paginateSequelize } from '@/utils/pagination';
import { getSequelizeCondition, getSequelizeTimestampCondition, isValuelessOperator, shouldApplyFilter } from '@/utils/filteringOperations';
import { QBOCustomerService } from '@/qbo/customer/customer.service';
import { QBOInvoiceService } from '@/qbo/invoice/invoice.service';
import Mapping3040 from '@/reports/models/Mapping3040.entity';
import { EligibilityCategoryMapper } from '@/reports/services/eligibility-category.mapper';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Application from '@/eligibility/models/Application.entity';
import ApplicationLog from '@/eligibility/models/ApplicationLogs.entity';
import { EligbilityActions } from '@/enums/eligibilityActions.enum';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import {
    OrganizationType,
    OrganizationSubType,
    PublicPurpose,
    PrimaryActivity,
} from '@/enums/organizationCategories';
import { OrganizationAddressService } from '@/organization/services/organizationAddress.service';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { OrganizationAddressType } from '@/enums/organizationAddressType.enum';
const logger = getLogger('DataMigration');

interface MigrationError {
    row: number;
    error: string;
    dev_error?: string
    data: Record<string, string | null>;
}

interface MergeReport {
    timestamp: Date;
    groups?: { donee_account: number; prefix: string; req_ids: number[], tcn: string }[];
    totalGroupsIdentified: number;
    totalRequestsProcessed: number;
    totalRequestsMerged: number; // Count of requests successfully merged (status changed)
    totalPropertiesCloned: number;
    totalAttachmentsCloned: number;
    skippedRequests: {
        count: number;
        details: Array<{
            id: number;
            reason: string;
            doneeAccount?: number;
            status?: string;
        }>;
    };
    errors: Array<{
        reqId?: number;
        error: string;
        timestamp: Date;
    }>;
    statusMessage: string;
}

interface PropertyMergeReport {
    timestamp: Date;
    totalRows: number;
    importedCount: number;
    failedCount: number;
    errors: MigrationError[];
    statusMessage: string;
}

interface InvoiceSchemaUpdateReport {
    timestamp: Date;
    totalInvoices: number;
    updated: number;
    skipped: number;
    failures: any[];
    statusMessage: string;
}

interface QboCustomerGenerationReport {
    timestamp: Date;
    totalDoneeAccountsFound: number;
    processedCount: number;
    createdCount: number;
    alreadyLinkedCount: number;
    skippedCount: number;
    failedCount: number;
    skipped: Array<{
        doneeAccountId: number;
        organizationId?: string;
        doneeAccountName?: string | null;
        reason: string;
    }>;
    failures: Array<{
        doneeAccountId: number;
        organizationId?: string;
        doneeAccountName?: string | null;
        error: string;
        dev_error?: string;
        timestamp: Date;
    }>;
    statusMessage: string;
}

interface GenerateQboCustomersOptions {
    limit?: number;
    offset?: number;
    doneeAccountIds?: number[];
}

interface HubspotContactGenerationReport {
    timestamp: Date;
    totalDoneeAccountsFound: number;
    processedCount: number;
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    skipped: Array<{
        doneeAccountId: number;
        organizationId?: string;
        doneeAccountName?: string | null;
        reason: string;
    }>;
    failures: Array<{
        doneeAccountId: number;
        organizationId?: string;
        doneeAccountName?: string | null;
        error: string;
        dev_error?: string;
        timestamp: Date;
    }>;
    statusMessage: string;
}

interface GenerateHubspotContactsOptions {
    limit?: number;
    offset?: number;
    doneeAccountIds?: number[];
}

interface QboInvoiceGenerationReport {
    timestamp: Date;
    batchSize: number;
    totalInvoicesFound: number;
    processedCount: number;
    createdCount: number;
    alreadyLinkedCount: number;
    skippedCount: number;
    failedCount: number;
    remainingCount: number;
    skipped: Array<{
        invoiceId: number;
        requestId?: number;
        reason: string;
    }>;
    failures: Array<{
        invoiceId: number;
        requestId?: number;
        error: string;
        dev_error?: string;
        timestamp: Date;
    }>;
    statusMessage: string;
}

interface InvoicePaymentMigrationReport {
    timestamp: Date;
    totalInvoiceIdsReceived: number;
    processedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    skipped: Array<{
        invoiceId: number;
        reason: string;
    }>;
    failures: Array<{
        invoiceId: number;
        error: string;
        dev_error?: string;
        timestamp: Date;
    }>;
    statusMessage: string;
}

interface Mapping3040BackfillReport {
    timestamp: Date;
    organizationsProcessed: number;
    organizationsSkipped: number;
    doneeAccountsProcessed: number;
    mappingsCreated: number;
    mappingsUpdated: number;
    skipped: Array<{
        organizationId: string;
        reason: string;
    }>;
    failures: Array<{
        organizationId?: string;
        doneeAccountId?: number;
        error: string;
        dev_error?: string;
        timestamp: Date;
    }>;
    statusMessage: string;
}

export class DataMigrationService {
    static async backfill3040MappingsForExistingOrganizations(): Promise<Mapping3040BackfillReport> {
        const report: Mapping3040BackfillReport = {
            timestamp: new Date(),
            organizationsProcessed: 0,
            organizationsSkipped: 0,
            doneeAccountsProcessed: 0,
            mappingsCreated: 0,
            mappingsUpdated: 0,
            skipped: [],
            failures: [],
            statusMessage: 'Processing started.',
        };

        try {
            await withTransaction(async (transaction) => {
                const organizations = await Organization.findAll({ transaction });

                for (const organization of organizations) {
                    report.organizationsProcessed++;

                    try {
                        if (!organization.organization_type || !organization.organization_sub_type || !organization.public_purpose) {
                            report.organizationsSkipped++;
                            report.skipped.push({
                                organizationId: organization.id,
                                reason: 'Missing organization_type, organization_sub_type, or public_purpose',
                            });
                            continue;
                        }

                        const olderAmericansActSelected = await EligibilityService.getOlderAmericansActSelected(organization.id, transaction);
                        const externalSelection = EligibilityCategoryMapper.toExternal(
                            {
                                organizationType: organization.organization_type as OrganizationType,
                                organizationSubType: organization.organization_sub_type as OrganizationSubType,
                                publicPurpose: organization.public_purpose as PublicPurpose,
                                primaryActivity: organization.primary_activity as PrimaryActivity | undefined,
                            },
                            olderAmericansActSelected
                        );

                        if (!externalSelection?.subCategory) {
                            report.organizationsSkipped++;
                            report.skipped.push({
                                organizationId: organization.id,
                                reason: 'No mapped external category/subcategory found',
                            });
                            continue;
                        }

                        const doneeAccounts = await DoneeAccount.findAll({
                            where: { organizationId: organization.id },
                            transaction,
                        });

                        for (const doneeAccount of doneeAccounts) {
                            report.doneeAccountsProcessed++;

                            const existing = await Mapping3040.findOne({
                                where: {
                                    donee_account_id: doneeAccount.id,
                                    organization_id: organization.id,
                                    state_id: doneeAccount.stateId,
                                },
                                transaction,
                            });

                            if (existing) {
                                await existing.update({
                                    section: externalSelection.primaryCategory,
                                    category: externalSelection.subCategory,
                                }, { transaction });
                                report.mappingsUpdated++;
                                continue;
                            }

                            await Mapping3040.create({
                                donee_account_id: doneeAccount.id,
                                organization_id: organization.id,
                                state_id: doneeAccount.stateId,
                                section: externalSelection.primaryCategory,
                                category: externalSelection.subCategory,
                            }, { transaction });
                            report.mappingsCreated++;
                        }
                    } catch (error: any) {
                        report.failures.push({
                            organizationId: organization.id,
                            error: error?.message || 'Failed to process organization',
                            dev_error: error?.stack ? String(error.stack) : String(error),
                            timestamp: new Date(),
                        });
                    }
                }
            });

            report.statusMessage = report.failures.length > 0 ? 'Completed with failures' : 'Completed successfully';
            return report;
        } catch (error: any) {
            report.statusMessage = 'Failed';
            report.failures.push({
                error: error?.message || 'Unexpected error during mapping backfill',
                dev_error: error?.stack ? String(error.stack) : String(error),
                timestamp: new Date(),
            });
            return report;
        }
    }

    /**
    * Migrate rows from an Excel file into your tables.
    * Returns a summary of successes and failures.
    */
    static async migrateFromExcel(filePath: string) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('No worksheet found in file.');

        // Build header → columnIndex map
        const headerRow = sheet.getRow(1);
        const headerIndex: Record<string, number> = {};
        headerRow.eachCell((cell, colNumber) => {
            if (typeof cell.value === 'string') headerIndex[cell.value.trim()] = colNumber;
        });

        // List of columns we expect to map
        const columns = [
            'Donee Account Name', 'Agency Purpose', 'Agency Type', 'EIN', 'Email',
            'Extension', 'Fax Number',
            'Mailing Address 1', 'Mailing Address 2',
            'Mailing City', 'Mailing State', 'Mailing Zip',
            'Phone', 'Donee Account Number',
            'Head Authorized Official', 'Head Authorized Official Email'
        ];

        // Preload Florida state ID once
        const florida = await State.findOne({ where: { stateName: 'Florida' } });
        if (!florida) throw new Error('State "Florida" not found!');

        //Preload roles and scopes
        const organizationScope = await Scope.findOne({ where: { type: ScopeType.ORGANIZATION } });
        const doneeScope = await Scope.findOne({ where: { type: ScopeType.DONEE } });
        if (!organizationScope || !doneeScope) throw new AppError(400, 'Could not found scope');

        const organizationAdminRole = await Role.findOne({ where: { role_name: PredefinedRoles.Organization_Admin } });
        const doneeAuthorizedRepRole = await Role.findOne({ where: { role_name: PredefinedRoles.Donee_Authorized_Representative } });
        if (!organizationAdminRole || !doneeAuthorizedRepRole) throw new AppError(400, 'Could not found role');

        const errors: MigrationError[] = [];
        let successCount = 0;

        for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
            const row = sheet.getRow(rowNum);
            if (!row || row.values === null || row.values === undefined) continue
            if (Array.isArray(row.values) && row.values.every(v => v === null || v === undefined || v === '')) continue;


            // Extract and validate each required field
            const organizationName = row.getCell(headerIndex['Donee Account Name']).value;
            const agencyPurpose = row.getCell(headerIndex['Agency Purpose']).value;
            const agencyType = row.getCell(headerIndex['Agency Type']).value;
            const ein = row.getCell(headerIndex['EIN']).value;
            const email = row.getCell(headerIndex['Email']).value;
            const extension = row.getCell(headerIndex['Extension']).value;
            const fax = row.getCell(headerIndex['Fax Number']).value;
            const mail1 = row.getCell(headerIndex['Mailing Address 1']).value;
            const mail2 = row.getCell(headerIndex['Mailing Address 2']).value;
            const city = row.getCell(headerIndex['Mailing City']).value;
            const state = row.getCell(headerIndex['Mailing State']).value;
            const zip = row.getCell(headerIndex['Mailing Zip']).value;
            const phone = row.getCell(headerIndex['Phone']).value;
            const doneeName = row.getCell(headerIndex['Donee Account Number']).value;
            const headName = row.getCell(headerIndex['Head Authorized Official']).value;
            const headEmail = row.getCell(headerIndex['Head Authorized Official Email']).value;

            const requiredFields = [
                'Donee Account Name', 'Agency Purpose', 'Agency Type', 'EIN',
                'Mailing Address 1', 'Mailing City', 'Mailing State', 'Mailing Zip',
                'Donee Account Number', 'Head Authorized Official', 'Head Authorized Official Email'
            ]

            const missingFields = requiredFields.filter((field, index) => {
                const value = [
                    organizationName, agencyPurpose, agencyType, ein, mail1, city, state, zip, doneeName, headName, headEmail
                ][index];
                return value == null || String(value).trim() === '';
            });

            if (missingFields.length > 0) {
                errors.push({
                    row: rowNum,
                    error: `Missing or empty required fields: ${missingFields.join(', ')}`,
                    data: columns.reduce((acc, col) => {
                        const cell = row.getCell(headerIndex[col]).value;
                        acc[col] = cell == null ? null : String(cell).trim();
                        return acc;
                    }, {} as Record<string, string | null>),
                });
                continue;
            }

            const orgFields = {
                name: String(organizationName).trim(),
                agency_purpose: String(agencyPurpose).trim(),
                agency_type: String(agencyType).trim(),
                tin: String(ein).trim(),
                mailing_address_line1: String(mail1).trim(),
                mailing_address_line2: mail2 ? String(mail2).trim() : null, //nullable
                mailing_city: String(city).trim(),
                mailing_state: String(state).trim(),
                mailing_zip: String(zip).trim(),
                creator_phone: String(phone).trim() ?? 'Insert contact phone number',
            };

            const userFields = {
                name: String(headName).trim(),
                email: String(headEmail).trim().toLowerCase(),
                isActive: true,
                typeId: 2,
                passwordRaw: uuidv4(), // will hash below
            };

            const doneeFields = {
                name: String(doneeName).trim(),
                stateId: florida.stateId,
                isActive: false,
            };

            try {
                await withTransaction(async (transaction) => {
                    // 1) Organization
                    const organization = await Organization.create(
                        {
                            name: orgFields.name,
                            organization_type: 'please change here',
                            organization_sub_type: 'please change here',
                            public_purpose: undefined,
                            primary_activity: undefined,
                            tin: orgFields.tin,
                        },
                        { transaction }
                    );

                    await OrganizationAddressService.upsertMany(
                        organization.id,
                        [
                            {
                                address_type: OrganizationAddressType.HEADQUARTERS,
                                address_line1: orgFields.mailing_address_line1,
                                address_line2: orgFields.mailing_address_line2,
                                city: orgFields.mailing_city,
                                state: orgFields.mailing_state,
                                postal_code: orgFields.mailing_zip,
                            },
                            {
                                address_type: OrganizationAddressType.MAILING,
                                address_line1: orgFields.mailing_address_line1,
                                address_line2: orgFields.mailing_address_line2,
                                city: orgFields.mailing_city,
                                state: orgFields.mailing_state,
                                postal_code: orgFields.mailing_zip,
                            },
                            {
                                address_type: OrganizationAddressType.OFFICE_LOCATION,
                                address_line1: orgFields.mailing_address_line1,
                                address_line2: orgFields.mailing_address_line2,
                                city: orgFields.mailing_city,
                                state: orgFields.mailing_state,
                                postal_code: orgFields.mailing_zip,
                            },
                        ],
                        transaction
                    );

                    // 2) User
                    const hashedPwd = await hashPassword(userFields.passwordRaw);
                    const user = await User.create({
                        id: uuidv4(),
                        name: userFields.name,
                        email: userFields.email,
                        isActive: userFields.isActive,
                        typeId: userFields.typeId,
                        password: hashedPwd,
                        is_email_verified: true,
                        mfaEnabled: false
                    }, { transaction });

                    // 3) OrganizationUser
                    const organizationUser = await OrganizationUser.create({
                        userId: user.id,
                        organizationId: organization.id,
                        owner: true,
                        is_active: true,
                        phoneNumber: orgFields.creator_phone,
                    }, { transaction });

                    // 4) DoneeAccount
                    const doneeAccount = await DoneeAccount.create({
                        ...doneeFields,
                        organizationId: organization.id,
                    }, { transaction });

                    // 5) Org Admin 
                    const orgAdminScope = await UserScope.create({
                        user_id: user.id,
                        scope_id: organizationScope.scope_id,
                        role_id: organizationAdminRole.role_id,
                        organization_user_id: organizationUser.id,
                    }, { transaction })

                    // 6) donee account representive as head authorized offical and primary contact
                    const doneeHeadAuthorizedRepScope = await UserScope.create({
                        user_id: user.id,
                        scope_id: doneeScope.scope_id,
                        role_id: doneeAuthorizedRepRole.role_id,
                        organization_user_id: organizationUser.id,
                        donee_account_id: doneeAccount.id,
                        is_primary_contact: true,
                        is_head_representative: true
                    }, { transaction })
                });

                successCount++;
            } catch (err: any) {
                logger.error('Error occured', err)
                errors.push({
                    row: rowNum,
                    error: err?.original?.sqlMessage,
                    dev_error: err,
                    data: columns.reduce((acc, col) => {
                        const cell = row.getCell(headerIndex[col]).value;
                        acc[col] = cell == null ? null : String(cell).trim();
                        return acc;
                    }, {} as Record<string, string | null>),
                });
            }
        }

        return { migrated: successCount, failed: errors.length, errors };
    }



    // -------------------------------- request migration call fixMalformedRequests -------------------------------------------

    /**
        * Fix malformed data by merging properties and attachments based on
        * the first 10 characters of property_control_number within each DoneeAccount.
        * Skips any source requests that are not in PENDING status.
        * Instead of updating in-place, clones records for the canonical request,
        * preserving original data for rollback if needed.
        */
    static async fixMalformedRequests(): Promise<MergeReport> {
        const report: MergeReport = {
            timestamp: new Date(),
            totalGroupsIdentified: 0,
            totalRequestsProcessed: 0,
            totalRequestsMerged: 0,
            totalPropertiesCloned: 0,
            totalAttachmentsCloned: 0,
            skippedRequests: {
                count: 0,
                details: []
            },
            errors: [],
            statusMessage: 'Processing started.'
        };

        try {
            await withTransaction(async (transaction) => {
                const groups: Array<{ donee_account: number; prefix: string; req_ids: number[], tcn: string }> =
                    await Property.sequelize!.query(
                        `SELECT
                            r.donee_account AS donee_account,
                            r.tcn AS tcn,
                            LEFT(p.property_control_number, 6) AS prefix,
                            p.property_surplus_release_date AS surplus_release_date,
                            JSON_ARRAYAGG(p.request_id) AS req_ids
                         FROM properties p
                         JOIN requests r ON p.request_id = r.id
                         GROUP BY
                            r.donee_account,
                            r.tcn,
                            LEFT(p.property_control_number, 6),
                            p.property_surplus_release_date
                         HAVING COUNT(DISTINCT p.request_id) > 1;`,
                        { type: QueryTypes.SELECT, transaction }
                    );

                report.groups = groups;
                report.totalGroupsIdentified = groups.length;

                for (const group of groups) {
                    const doneeAccountId = group.donee_account;
                    const reqIds = group.req_ids;
                    const canonicalId = Math.min(...reqIds);
                    const otherIds = reqIds.filter(id => id !== canonicalId);

                    const canonicalRequest = await Request.findByPk(canonicalId, { transaction });
                    if (canonicalRequest && canonicalRequest.status === RequestStatusEnum.SUMITTED_TO_GSA) {
                        await Property.update(
                            { property_status: RequestStatusEnum.SUMITTED_TO_GSA },
                            { where: { request_id: canonicalId }, transaction }
                        );
                    }

                    report.totalRequestsProcessed += otherIds.length; // Count requests attempted to be merged

                    for (const reqId of otherIds) {
                        try { // Added try-catch for individual request processing
                            const req = await Request.findByPk(reqId, { transaction });
                            if (!req) {
                                report.skippedRequests.count++;
                                report.skippedRequests.details.push({
                                    id: reqId,
                                    reason: 'Request not found'
                                });
                                continue;
                            }

                            if (req.donee_account !== doneeAccountId) {
                                report.skippedRequests.count++;
                                report.skippedRequests.details.push({
                                    id: reqId,
                                    reason: 'Donee account mismatch (security check)',
                                    doneeAccount: req.donee_account
                                });
                                continue;
                            }

                            // Define statuses that allow merging. Consider making this more declarative.
                            const allowedStatuses = [
                                RequestStatusEnum.PENDING,
                                RequestStatusEnum.CANCELED,
                                RequestStatusEnum.DENIED,
                                RequestStatusEnum.SUMITTED_TO_GSA
                            ];
                            if (!allowedStatuses.includes(req.status as RequestStatusEnum)) {
                                report.skippedRequests.count++;
                                report.skippedRequests.details.push({
                                    id: reqId,
                                    reason: `Status '${req.status}' not allowed for merging`,
                                    status: req.status
                                });
                                continue;
                            }


                            // 1) Clone properties into canonical request
                            const properties = await Property.findAll({ where: { request_id: reqId }, transaction });
                            const newPropertiesData = properties.map(prop => {
                                const data = prop.get({ plain: true });
                                delete (data as any).property_id;
                                data.request_id = canonicalId;
                                if (req.status === RequestStatusEnum.SUMITTED_TO_GSA) (data as any).property_status = PropertyStatusEnum.SUMITTED_TO_GSA;
                                return data;
                            });
                            if (newPropertiesData.length > 0) {
                                await Property.bulkCreate(newPropertiesData, { transaction });
                                report.totalPropertiesCloned += newPropertiesData.length;
                            }


                            // 2) Clone attachments into canonical request
                            const attachments = await RequestAttachment.findAll({ where: { request_id: reqId }, transaction });
                            const newAttachmentsData = attachments.map(att => {
                                const data = att.get({ plain: true });
                                delete (data as any).id;
                                (data as any).request_id = canonicalId;
                                return data;
                            });
                            if (newAttachmentsData.length > 0) {
                                await RequestAttachment.bulkCreate(newAttachmentsData, { transaction });
                                report.totalAttachmentsCloned += newAttachmentsData.length;
                            }

                            // 3) Mark the old request as merged
                            await Request.update(
                                { status: `merged_to:${canonicalId}` },
                                { where: { id: reqId }, transaction }
                            );
                            report.totalRequestsMerged++;

                            // 4) Change the status of original request
                            const allProperties = await PropertyService.getAllPropertiesByRequestId(canonicalId, {}, transaction);
                            const status = PropertyService.getRequestAllocationStatus(allProperties);
                            await RequestService.updateRequest(canonicalId, { status }, transaction);

                        } catch (error: any) {
                            logger.error(`Error processing request ID ${reqId}: ${error.message}`);
                            report.errors.push({
                                reqId: reqId,
                                error: error.message,
                                timestamp: new Date()
                            });

                            // For data integrity, rolling back on any error within the loop is often safer.
                            throw error; // Re-throw to ensure transaction rollback
                        }
                    }
                }
                report.statusMessage = 'Processing completed successfully.';
            });
        } catch (outerError: any) {
            logger.error(`Failed to fix malformed requests: ${outerError.message}`);
            report.statusMessage = `Processing failed: ${outerError.message}`;
            // Any errors re-thrown from the transaction will land here
            report.errors.push({
                error: outerError.message,
                timestamp: new Date()
            });
        }

        logger.info('Malformed requests fix process finished.', report);
        return report;
    }

    /**
     * Manually merges properties and attachments from otherRequestIds into the canonicalId request.
     * Accepts a canonicalId and an array of otherRequestIds to merge.
     * Returns a MergeReport for this operation.
     */
    static async fixMalformedRequestsManually(canonicalId: number, otherRequestIds: number[]): Promise<MergeReport> {
        const report: MergeReport = {
            timestamp: new Date(),
            totalGroupsIdentified: 1,
            totalRequestsProcessed: otherRequestIds.length,
            totalRequestsMerged: 0,
            totalPropertiesCloned: 0,
            totalAttachmentsCloned: 0,
            skippedRequests: {
                count: 0,
                details: []
            },
            errors: [],
            statusMessage: 'Processing started.'
        };

        try {
            await withTransaction(async (transaction) => {
                const canonicalRequest = await Request.findByPk(canonicalId, { transaction });
                if (!canonicalRequest) {
                    throw new AppError(404, `Canonical request ${canonicalId} not found`);
                }

                for (const reqId of otherRequestIds) {
                    try {
                        const req = await Request.findByPk(reqId, { transaction });
                        if (!req) {
                            report.skippedRequests.count++;
                            report.skippedRequests.details.push({
                                id: reqId,
                                reason: 'Request not found'
                            });
                            continue;
                        }

                        if (req.donee_account !== canonicalRequest.donee_account) {
                            report.skippedRequests.count++;
                            report.skippedRequests.details.push({
                                id: reqId,
                                reason: 'Donee account mismatch (security check)',
                                doneeAccount: req.donee_account
                            });
                            continue;
                        }

                        const allowedStatuses = [
                            RequestStatusEnum.PENDING,
                            RequestStatusEnum.CANCELED,
                            RequestStatusEnum.DENIED,
                            RequestStatusEnum.SUMITTED_TO_GSA
                        ];
                        if (!allowedStatuses.includes(req.status as RequestStatusEnum)) {
                            report.skippedRequests.count++;
                            report.skippedRequests.details.push({
                                id: reqId,
                                reason: `Status '${req.status}' not allowed for merging`,
                                status: req.status
                            });
                            continue;
                        }

                        // 1) Clone properties into canonical request
                        const properties = await Property.findAll({ where: { request_id: reqId }, transaction });
                        const newPropertiesData = properties.map(prop => {
                            const data = prop.get({ plain: true });
                            delete (data as any).property_id;
                            data.request_id = canonicalId;
                            if (req.status === RequestStatusEnum.SUMITTED_TO_GSA) (data as any).property_status = PropertyStatusEnum.SUMITTED_TO_GSA;
                            return data;
                        });
                        if (newPropertiesData.length > 0) {
                            await Property.bulkCreate(newPropertiesData, { transaction });
                            report.totalPropertiesCloned += newPropertiesData.length;
                        }

                        // 2) Clone attachments into canonical request
                        const attachments = await RequestAttachment.findAll({ where: { request_id: reqId }, transaction });
                        const newAttachmentsData = attachments.map(att => {
                            const data = att.get({ plain: true });
                            delete (data as any).id;
                            (data as any).request_id = canonicalId;
                            return data;
                        });
                        if (newAttachmentsData.length > 0) {
                            await RequestAttachment.bulkCreate(newAttachmentsData, { transaction });
                            report.totalAttachmentsCloned += newAttachmentsData.length;
                        }

                        // 3) Mark the old request as merged
                        await Request.update(
                            { status: `merged_to:${canonicalId}` },
                            { where: { id: reqId }, transaction }
                        );
                        report.totalRequestsMerged++;

                        // 4) Change the status of original request
                        const allProperties = await PropertyService.getAllPropertiesByRequestId(canonicalId, {}, transaction);
                        const status = PropertyService.getRequestAllocationStatus(allProperties);
                        await RequestService.updateRequest(canonicalId, { status }, transaction);

                    } catch (error: any) {
                        logger.error(`Error processing request ID ${reqId}: ${error.message}`);
                        report.errors.push({
                            reqId: reqId,
                            error: error.message,
                            timestamp: new Date()
                        });
                        throw error;
                    }
                }
                report.statusMessage = 'Processing completed successfully.';
            });
        } catch (outerError: any) {
            logger.error(`Failed to fix malformed request: ${outerError.message}`);
            report.statusMessage = `Processing failed: ${outerError.message}`;
            report.errors.push({
                error: outerError.message,
                timestamp: new Date()
            });
        }

        logger.info('Malformed request fix process finished.', report);
        return report;
    }


    // -------------------------------- if request merge is successfull we need to call this ------------------------------------------------


    /**
     * Deletes all requests with status 'merged_to:%', along with their properties and attachments.
     * Returns a summary of deleted request IDs, property IDs, and attachment IDs.
     */
    static async cleanupMergedRequests() {
        const result: {
            deletedRequestIds: number[];
            deletedPropertyIds: number[];
            deletedAttachmentIds: number[];
        } = {
            deletedRequestIds: [],
            deletedPropertyIds: [],
            deletedAttachmentIds: []
        };

        await withTransaction(async (transaction) => {
            // 1. Find all requests with status like 'merged_to:%'
            const mergedRequests = await Request.findAll({
                where: { status: { [Op.like]: 'merged_to:%' } },
                transaction
            });

            const mergedRequestIds = mergedRequests.map(r => r.id);
            if (mergedRequestIds.length === 0) return result;

            // 2. Find and delete properties
            const properties = await Property.findAll({
                where: { request_id: mergedRequestIds },
                transaction
            });
            const propertyIds = properties.map(p => p.property_id);

            if (propertyIds.length > 0) {
                await Property.destroy({
                    where: { property_id: propertyIds },
                    transaction
                });
            }

            // 3. Find and delete attachments
            const attachments = await RequestAttachment.findAll({
                where: { request_id: mergedRequestIds },
                transaction
            });
            const attachmentIds = attachments.map(a => a.id);

            if (attachmentIds.length > 0) {
                await RequestAttachment.destroy({
                    where: { id: attachmentIds },
                    transaction
                });
            }

            // 4. Delete merged requests
            await Request.destroy({
                where: { id: mergedRequestIds },
                transaction
            });

            result.deletedRequestIds = mergedRequestIds;
            result.deletedPropertyIds = propertyIds;
            result.deletedAttachmentIds = attachmentIds;
        });

        return result;
    }


    // -------------------------------- if request merge is failed then here is how to cleanup --------------------------------------------


    /**
  * Cleans up canonical requests by removing properties that were cloned from merged requests.
  * For each canonical request (target of merged_to:ID), only properties originally belonging to the canonical request
  * (by property_control_number) are kept; cloned properties are deleted.
  * Returns a summary of affected canonical requests and deleted properties.
  */
    static async cleanupCanonicalRequestProperties() {
        const result: { canonicalId: number; deletedPropertyIds: number[]; keptPropertyIds: number[]; }[] = [];

        await withTransaction(async (transaction) => {
            // 1. Find all requests with status like 'merged_to:%'
            const mergedRequests = await Request.findAll({
                where: { status: { [Op.like]: 'merged_to:%' } },
                transaction
            });

            // 2. Group by canonicalId
            const groups: Record<number, number[]> = {};
            for (const req of mergedRequests) {
                const match = /^merged_to:(\d+)$/.exec(req.status);
                if (!match) continue;
                const canonicalId = Number(match[1]);
                if (!groups[canonicalId]) groups[canonicalId] = [];
                groups[canonicalId].push(req.id);
            }

            // 3. For each canonicalId, clean up properties
            for (const [canonicalIdStr, mergedIds] of Object.entries(groups)) {
                const canonicalId = Number(canonicalIdStr);

                // a) Get all property_control_numbers from merged requests
                const mergedProperties = await Property.findAll({
                    where: { request_id: mergedIds },
                    transaction
                });
                const mergedItemControlNumbers = new Set(
                    mergedProperties.map(p => p.property_control_number)
                );

                // b) Get all properties of canonical request
                const canonicalProperties = await Property.findAll({
                    where: { request_id: canonicalId },
                    transaction
                });

                // c) Identify which canonical properties are clones (by property_control_number)
                const toDelete: number[] = [];
                const toKeep: number[] = [];
                for (const prop of canonicalProperties) {
                    if (mergedItemControlNumbers.has(prop.property_control_number)) {
                        toDelete.push(prop.property_id);
                    } else {
                        toKeep.push(prop.property_id);
                    }
                }

                // d) Delete the cloned properties
                if (toDelete.length > 0) {
                    await Property.destroy({
                        where: { property_id: toDelete },
                        transaction
                    });
                }

                result.push({
                    canonicalId,
                    deletedPropertyIds: toDelete,
                    keptPropertyIds: toKeep
                });
            }
        });

        return result;
    }

    /**
     * Reverts the status of requests that were previously marked as merged.
     * Accepts an array of request IDs and a new status to set (e.g., 'PENDING').
     * Returns a summary of updated requests.
     */
    static async revertMergedRequestStatuses(requestIds: number[], newStatus: string) {
        if (!Array.isArray(requestIds) || requestIds.length === 0) {
            throw new AppError(400, 'No request IDs provided.');
        }

        const updated: number[] = [];
        const notFound: number[] = [];
        const notMerged: number[] = [];

        await withTransaction(async (transaction) => {
            const requests = await Request.findAll({
                where: { id: requestIds },
                transaction
            });

            for (const req of requests) {
                if (!/^merged_to:\d+$/.test(req.status)) {
                    notMerged.push(req.id);
                    continue;
                }
                await Request.update(
                    { status: newStatus },
                    { where: { id: req.id }, transaction }
                );
                updated.push(req.id);
            }

            // Any IDs not found in DB
            const foundIds = requests.map(r => r.id);
            for (const id of requestIds) {
                if (!foundIds.includes(id)) notFound.push(id);
            }
        });

        return { updated, notMerged, notFound };
    }

    /**
   * Migrate rows from an Excel file into properties tables.
   * Returns a summary of successes and failures.
   */
    static async importLegacyPropertyData(filePath: string): Promise<PropertyMergeReport> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('No worksheet found in file.');

        // Build header index map
        const headerRow = sheet.getRow(1);
        const headers: Record<string, number> = {};
        headerRow.eachCell((cell, colNumber) => {
            if (typeof cell.value === 'string') headers[cell.value.trim()] = colNumber;
        });

        // Define required fields based on your model
        const requiredFields = [
            'DONEE_ACCOUNT_NUMBER',
            'REQUEST_STATUS',
            'REQUESTOR',
            'ITEM_CONTROL_NUMBER',
            'SCREENING_ENDS_DATE',
            'ITEM_NAME',
            'ITEM_TYPE',
            'ITEM_DESCRIPTION',
            'QUANTITY_REQUESTED',
            'ORIGINAL_UNIT_ACQUISITION_COST',
            'TOTAL_ACQUISITION_COST',
        ];

        const errors: MigrationError[] = [];
        let importedCount = 0;
        const totalRows = sheet.rowCount - 1;

        // Preload Florida state ID once
        const florida = await State.findOne({ where: { stateName: 'Florida' } });
        if (!florida) throw new Error('State "Florida" not found!');

        for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
            const row = sheet.getRow(rowNumber);
            if (!row || !row.values || (Array.isArray(row.values) && row.values.every(v => v === null || v === undefined || v === ''))) continue;

            // Extract row data
            const rowData: Record<string, string | null> = {};
            for (const key of Object.keys(headers)) {
                const val = row.getCell(headers[key]).value;
                rowData[key] = val == null ? null : String(val).trim();
            }

            // Check required fields
            const missing = requiredFields.filter(field => !rowData[field] || rowData[field]?.length === 0);
            if (missing.length > 0) {
                errors.push({
                    row: rowNumber,
                    error: `Missing required fields: ${missing.join(', ')}`,
                    data: rowData
                });
                continue;
            }

            try {
                await LegacyPropertyData.create({
                    stateId: florida.stateId,

                    tcn: rowData['TCN'] ?? null,
                    request_status: rowData['REQUEST_STATUS']!,
                    requestor: rowData['REQUESTOR']!,
                    donee_account_number: rowData['DONEE_ACCOUNT_NUMBER']!,

                    property_control_number: rowData['ITEM_CONTROL_NUMBER']!.replace(/-/g, ''),
                    property_surplus_release_date: Number(rowData['SCREENING_ENDS_DATE']),
                    property_name: rowData['ITEM_NAME']!,
                    property_type: rowData['ITEM_TYPE']!,
                    property_description: rowData['ITEM_DESCRIPTION']!,
                    property_justification: rowData['JUSTIFICATION'] ?? null,
                    property_quantity: Number(rowData['QUANTITY_REQUESTED']),
                    property_original_value: Number(rowData['ORIGINAL_UNIT_ACQUISITION_COST']),
                    property_total_value: Number(rowData['TOTAL_ACQUISITION_COST']),
                    property_fair_market_value: rowData['FAIR_MARKET_VALUE'] ? Number(rowData['FAIR_MARKET_VALUE']) : undefined,
                    property_disposal_condition: rowData['DISPOSAL_CONDITION']?.split(' - ')[1]?.trim().charAt(0) ?? null,
                    property_supply_condition: rowData['SUPPLY_CONDITION']?.charAt(0) ?? null,
                    property_demil_condition: rowData['DEMIL_CONDITION']?.charAt(0) ?? null,
                    property_allocated_date: rowData['ALLOCATED_DATE'] ? Number(rowData['ALLOCATED_DATE']) : undefined,
                    property_reimbursable: false,
                    property_surplus_review_comments: rowData['SURPLUS_REVIEW_COMMENTS'] ?? null,

                    property_location_address_one: rowData['LOCATION_ADDRESS_1'] ?? null,
                    property_location_address_two: rowData['LOCATION_ADDRESS_2'] ?? null,
                    property_location_address_three: rowData['LOCATION_NAME'] ?? null,
                    property_location_city: rowData['LOCATION_CITY'] ?? null,
                    property_location_region_state: rowData['LOCATION_STATE'] ?? null,
                    property_location_postal_code: rowData['LOCATION_POSTAL_CODE'] ?? null,
                    property_poc_name: rowData['POC_NAME'] ?? null,
                    property_custodian_name: rowData['CUSTODIAN_NAME'] ?? null,
                });
                importedCount++;
            } catch (err) {
                errors.push({
                    row: rowNumber,
                    error: (err as Error).message,
                    dev_error: (err as Error).stack,
                    data: rowData
                });
            }
        }

        const failedCount = errors.length;
        const statusMessage = failedCount > 0 ? 'Completed with errors' : 'All rows imported successfully';

        return {
            timestamp: new Date(),
            totalRows,
            importedCount,
            failedCount,
            errors,
            statusMessage,
        };
    }

    static async migrateSingleLegacyData(dto: SinglePropertyMigrationDto) {
        const legacy = await LegacyPropertyData.findByPk(dto.id);
        if (!legacy) throw new AppError(404, `Legacy record with id ${dto.id} not found`);

        // Validate complianceDetails fields if provided
        if (
            !dto.complianceDetails ||
            dto.complianceDetails.term_start == null ||
            dto.complianceDetails.term_end == null ||
            dto.complianceDetails.period_months == null ||
            dto.complianceDetails.term_months == null ||
            dto.complianceDetails.next_reporting_date == null
        ) throw new AppError(400, 'Missing one or more required compliance fields: term_start, term_end, period_months, term_months, next_reporting_date');


        // Find DoneeAccount by DTO or legacy
        const doneeAccountToLookup = dto.doneeAccountNumber ?? legacy.donee_account_number;
        const doneeAccount = await DoneeAccount.findOne({ where: { name: doneeAccountToLookup } });
        if (!doneeAccount) throw new AppError(404, `DoneeAccount named "${doneeAccountToLookup}" not found`);

        return await withTransaction(async (transaction) => {
            // Find user by legacy.requestor (email)
            let user: User | null = await User.findOne({ where: { email: legacy.requestor } });

            // If not found, get head authorized user for the donee account from UserScope
            if (!user) {
                const headUserScope = await UserScope.findOne({
                    where: {
                        donee_account_id: doneeAccount.id,
                        is_head_representative: true
                    },
                    include: [{ model: User, as: 'user' }]
                });
                user = headUserScope && headUserScope.user ? headUserScope.user : null;
            }

            if (!user) throw new AppError(404, `No user found for requestor email "${legacy.requestor}" or as head authorized representative for donee "${doneeAccount.name}"`);

            // Create Request
            const reqPayload = {
                tcn: dto.tcn ?? legacy.tcn,
                requestor: user.id,
                status: dto.request_status ?? legacy.request_status,
                donee_account: doneeAccount.id
            };
            const createdReq = await Request.create(reqPayload, { transaction });

            if (!legacy.property_control_number) throw new AppError(400, 'Missing property_control_number');
            if (!legacy.property_name && !dto.propertyName) throw new AppError(400, 'Missing property_name');
            if (!legacy.property_justification && !dto.propertyJustification) throw new AppError(400, 'Missing justification');
            if (!legacy.tcn && !dto.tcn) throw new AppError(400, 'Missing tcn');

            // Normalize reimbursable to boolean (legacy/API may send string 'Yes'/'No')
            const rawReimbursable = dto.reimbursable ?? legacy.property_reimbursable ?? false;
            const property_reimbursable = typeof rawReimbursable === 'boolean'
                ? rawReimbursable
                : String(rawReimbursable).toLowerCase() === 'yes' || String(rawReimbursable).toLowerCase() === 'true' || rawReimbursable === 1 || rawReimbursable === '1';

            // Create Property
            const propPayload = {
                request_id: createdReq.id,
                property_control_number: dto.propertyControlNumber ?? legacy.property_control_number,
                property_name: dto.propertyName ?? legacy.property_name,
                property_type: dto.propertyType ?? legacy.property_type,
                property_description: dto.propertyDescription ?? legacy.property_description,
                property_justification: (dto.propertyJustification ?? legacy.property_justification) as string,
                property_justification_extended: dto.propertyJustificationExtended ?? legacy.property_justification_extended ?? '',
                property_quantity: dto.propertyQuantity ?? legacy.property_quantity,
                property_original_value: dto.originalValue ?? legacy.property_original_value,
                property_total_value: dto.totalValue ?? legacy.property_total_value,
                property_fair_market_value: dto.fairMarketValue ?? legacy.property_fair_market_value ?? null,
                property_disposal_condition: dto.disposalCondition ?? legacy.property_disposal_condition,
                property_supply_condition: dto.supplyCondition ?? legacy.property_supply_condition,
                property_demil_condition: dto.demilCondition ?? legacy.property_demil_condition,
                property_surplus_release_date: dto.surplusReleaseDate ?? legacy.property_surplus_release_date,
                property_allocated_date: dto.allocatedDate ?? legacy.property_allocated_date ?? null,
                property_reimbursable,
                property_surplus_review_comments: dto.surplusReviewComments ?? legacy.property_surplus_review_comments ?? null,
                property_location_city: dto.locationCity ?? legacy.property_location_city ?? null,
                property_location_region_state: dto.locationRegionState ?? legacy.property_location_region_state ?? null,
                property_location_postal_code: dto.locationPostalCode ?? legacy.property_location_postal_code ?? null,
                property_location_address_one: dto.locationAddressOne ?? legacy.property_location_address_one ?? null,
                property_location_address_two: dto.locationAddressTwo ?? legacy.property_location_address_two ?? null,
                property_location_address_three: dto.locationAddressThree ?? legacy.property_location_address_three ?? null,
                property_poc_name: dto.pocName ?? legacy.property_poc_name ?? null,
                property_custodian_name: dto.custodianName ?? legacy.property_custodian_name ?? null,
                property_allocated_quantity: legacy.property_quantity,
                property_denied_quantity: 0,
                property_status: PropertyStatusEnum.IN_SERVICE,
                is_denied: false,
                is_cancelled: false,
                is_picked_up: true,
                is_late_cancelled: false,
            };

            const createdProp = await Property.create(propPayload, { transaction });

            // Optionally create Compliance if details provided
            const createdCompliance = await Compliance.create({
                donee_account_id: doneeAccount.id,
                request_id: createdReq.id,
                property_id: createdProp.property_id,
                status: ComplianceStatus.IN_RESTRICTIVE_USE_PERIOD,
                term_start: dto.complianceDetails.term_start,
                term_end: dto.complianceDetails.term_end,
                period_months: dto.complianceDetails.period_months,
                term_months: dto.complianceDetails.term_months,
                next_reporting_date: dto.complianceDetails.next_reporting_date,
            }, { transaction });

            await legacy.update({ property_migration_status: PropertyMigrationStatus.MIGRATED }, { transaction })

            return {
                requestId: createdReq.id,
                propertyId: createdProp.property_id,
                complianceId: createdCompliance?.id,
            };
        });
    }

    /**
     * Marks a legacy property record as migration requested if donee account matches.
     * Returns the updated legacy property record.
     */
    static async requestLegacyPropertyMigration(legacyPropertyId: number, doneeAccountId: number) {
        const legacy = await LegacyPropertyData.findByPk(legacyPropertyId);
        if (!legacy) throw new AppError(404, `Legacy property with id ${legacyPropertyId} not found`);

        const doneeAccount = await DoneeAccount.findByPk(doneeAccountId);
        if (!doneeAccount) throw new AppError(404, `DoneeAccount with id ${doneeAccountId} not found`);

        // Check if donee account numbers match
        if (legacy.donee_account_number !== doneeAccount.name) throw new AppError(400, `This property it not belong to thisdonee account`);

        await legacy.update({ property_migration_status: PropertyMigrationStatus.MIGRATION_REQUESTED });
        await NotificationFactory.createNotification(NotificationType.LEGACY_PROPERTY_MIGRATION_REQUESTED, { legacyProperty: legacy, doneeAccount });
    }

    /**
     * Marks a legacy property record as migration rejected.
     * Returns the updated legacy property record.
     */
    static async rejectPropertyMigration(legacyPropertyId: number) {
        const legacy = await LegacyPropertyData.findByPk(legacyPropertyId);
        if (!legacy) throw new AppError(404, `Legacy property with id ${legacyPropertyId} not found`);
        await legacy.update({ property_migration_status: PropertyMigrationStatus.REJECTED });
        return legacy;
    }

    /** Allowed sort/filter column names for legacy_property_data (whitelist). */
    private static readonly LEGACY_PROPERTY_SORTABLE_COLUMNS = new Set([
        'id', 'stateId', 'tcn', 'request_status', 'requestor', 'donee_account_number', 'property_control_number',
        'property_surplus_release_date', 'property_name', 'property_type', 'property_description', 'property_justification',
        'property_justification_extended', 'property_quantity', 'property_original_value', 'property_total_value', 'property_fair_market_value',
        'property_disposal_condition', 'property_supply_condition', 'property_demil_condition', 'property_allocated_date',
        'property_reimbursable', 'property_location_city', 'property_location_region_state', 'property_poc_name',
        'property_custodian_name', 'property_migration_status', 'requestor', 'donee_account_number',
    ]);
    private static readonly LEGACY_PROPERTY_TIMESTAMP_COLUMNS = new Set([
        'property_surplus_release_date', 'property_allocated_date',
    ]);
    private static readonly LEGACY_PROPERTY_NUMBER_COLUMNS = new Set([
        'id', 'property_quantity', 'property_original_value', 'property_total_value', 'property_fair_market_value',
    ]);

    /**
     * Get all legacy property records with server-side pagination, sort, and filter.
     */
    static async getAllLegacyPropertyData(
        payload: { stateId?: number, doneeAccountId?: number },
        page: number = 1,
        limit: number = 10,
        search?: string,
        sortBy?: string,
        sortOrder?: 'asc' | 'desc',
        filterKey?: string,
        filterValue?: string,
        operator: string = 'contains',
        migrationStatus?: 'none' | 'any' | string,
    ) {
        const { stateId, doneeAccountId } = payload;
        if (!stateId && !doneeAccountId) throw new AppError(400, 'State ID or donee account ID is required');

        const baseConditions: any[] = [];
        if (stateId) baseConditions.push({ stateId });
        if (doneeAccountId) {
            const doneeAccount = await DoneeAccount.findByPk(doneeAccountId);
            if (!doneeAccount) throw new AppError(404, `DoneeAccount with id ${doneeAccountId} not found`);
            baseConditions.push({ donee_account_number: doneeAccount.name });
        }

        if (search && search.trim()) {
            const escapedSearch = search.trim().replace(/[%_]/g, '\\$&');
            baseConditions.push({
                [Op.or]: [
                    { property_control_number: { [Op.like]: `%${escapedSearch}%` } },
                    { tcn: { [Op.like]: `%${escapedSearch}%` } },
                ],
            });
        }

        if (migrationStatus === 'none') {
            baseConditions.push({ property_migration_status: { [Op.is]: null } });
        } else if (migrationStatus === 'any') {
            baseConditions.push({ property_migration_status: { [Op.not]: null } });
        } else if (migrationStatus && migrationStatus !== 'none' && migrationStatus !== 'any') {
            baseConditions.push({ property_migration_status: migrationStatus });
        }

        if (filterKey && shouldApplyFilter(operator, filterValue) && this.LEGACY_PROPERTY_SORTABLE_COLUMNS.has(filterKey)) {
            const trimmed = String(filterValue ?? '').trim();
            if (this.LEGACY_PROPERTY_TIMESTAMP_COLUMNS.has(filterKey)) {
                baseConditions.push({ [filterKey]: getSequelizeTimestampCondition(operator, trimmed) });
            } else if (this.LEGACY_PROPERTY_NUMBER_COLUMNS.has(filterKey)) {
                if (isValuelessOperator(operator)) {
                    baseConditions.push({ [filterKey]: operator === 'isEmpty' ? { [Op.is]: null } : { [Op.not]: null } });
                } else if (operator === 'isAnyOf') {
                    baseConditions.push({ [filterKey]: getSequelizeCondition(operator, trimmed, 'number') });
                } else {
                    const num = Number(trimmed);
                    if (!Number.isNaN(num)) {
                        switch (operator) {
                            case '=':
                            case 'equals':
                                baseConditions.push({ [filterKey]: num });
                                break;
                            case '!=':
                            case 'doesNotEqual':
                                baseConditions.push({ [filterKey]: { [Op.ne]: num } });
                                break;
                            case '>':
                                baseConditions.push({ [filterKey]: { [Op.gt]: num } });
                                break;
                            case '>=':
                                baseConditions.push({ [filterKey]: { [Op.gte]: num } });
                                break;
                            case '<':
                                baseConditions.push({ [filterKey]: { [Op.lt]: num } });
                                break;
                            case '<=':
                                baseConditions.push({ [filterKey]: { [Op.lte]: num } });
                                break;
                            default:
                                baseConditions.push({ [filterKey]: num });
                        }
                    }
                }
            } else if (filterKey === 'property_reimbursable') {
                if (isValuelessOperator(operator)) {
                    baseConditions.push({ [filterKey]: operator === 'isEmpty' ? { [Op.is]: null } : { [Op.not]: null } });
                } else {
                    const boolVal = trimmed === 'true' || trimmed === '1' || trimmed.toLowerCase() === 'yes';
                    if (operator === 'equals' || operator === 'is') {
                        baseConditions.push({ [filterKey]: boolVal });
                    } else if (operator === 'doesNotEqual' || operator === 'not') {
                        baseConditions.push({ [filterKey]: { [Op.ne]: boolVal } });
                    } else {
                        baseConditions.push({ [filterKey]: boolVal });
                    }
                }
            } else {
                const cond = getSequelizeCondition(operator, trimmed);
                baseConditions.push({ [filterKey]: cond });
            }
        }

        const whereClause = baseConditions.length === 1 ? baseConditions[0] : { [Op.and]: baseConditions };

        const order: [string, 'ASC' | 'DESC'][] = [];
        if (sortBy && this.LEGACY_PROPERTY_SORTABLE_COLUMNS.has(sortBy)) {
            order.push([sortBy, (sortOrder === 'desc' ? 'DESC' : 'ASC')]);
        } else {
            order.push(['request_status', 'ASC']);
        }

        const legacy = await paginateSequelize<LegacyPropertyData>(LegacyPropertyData, page, limit, {
            where: whereClause,
            order,
        });
        return legacy;
    }

    /**
     * Get counts by migration status for summary (same base filters: stateId/doneeAccountId/search).
     */
    static async getLegacyPropertyCounts(
        payload: { stateId?: number; doneeAccountId?: number },
        search?: string,
    ): Promise<{ total: number; noMigrationStatus: number; migrationRequested: number; migrated: number; rejected: number }> {
        const { stateId, doneeAccountId } = payload;
        if (!stateId && !doneeAccountId) throw new AppError(400, 'State ID or donee account ID is required');

        const baseConditions: any[] = [];
        if (stateId) baseConditions.push({ stateId });
        if (doneeAccountId) {
            const doneeAccount = await DoneeAccount.findByPk(doneeAccountId);
            if (!doneeAccount) throw new AppError(404, `DoneeAccount with id ${doneeAccountId} not found`);
            baseConditions.push({ donee_account_number: doneeAccount.name });
        }
        if (search && search.trim()) {
            const escapedSearch = search.trim().replace(/[%_]/g, '\\$&');
            baseConditions.push({
                [Op.or]: [
                    { property_control_number: { [Op.like]: `%${escapedSearch}%` } },
                    { tcn: { [Op.like]: `%${escapedSearch}%` } },
                ],
            });
        }
        const whereBase = baseConditions.length === 1 ? baseConditions[0] : { [Op.and]: baseConditions };

        const [total, noMigrationStatus, migrationRequested, migrated, rejected] = await Promise.all([
            LegacyPropertyData.count({ where: whereBase }),
            LegacyPropertyData.count({ where: { [Op.and]: [whereBase, { property_migration_status: { [Op.is]: null } }] } }),
            LegacyPropertyData.count({ where: { [Op.and]: [whereBase, { property_migration_status: PropertyMigrationStatus.MIGRATION_REQUESTED }] } }),
            LegacyPropertyData.count({ where: { [Op.and]: [whereBase, { property_migration_status: PropertyMigrationStatus.MIGRATED }] } }),
            LegacyPropertyData.count({ where: { [Op.and]: [whereBase, { property_migration_status: PropertyMigrationStatus.REJECTED }] } }),
        ]);

        return { total, noMigrationStatus, migrationRequested, migrated, rejected };
    }

    /**
     * Gets a single legacy property record by its ID.
     * Throws if not found.
     */
    static async getLegacyPropertyData(legacyPropertyId: number) {
        if (!legacyPropertyId || isNaN(legacyPropertyId)) {
            throw new AppError(400, 'legacyPropertyId must be a valid number');
        }
        const legacy = await LegacyPropertyData.findByPk(legacyPropertyId);
        if (!legacy) throw new AppError(404, `Legacy property with id ${legacyPropertyId} not found`);
        return legacy;
    }

    /**
     * Backfill invoices with due_date = createdAt + 30 days where due_date is null.
     */
    static async invoiceSchemaUpdate(): Promise<InvoiceSchemaUpdateReport> {
        const invoices = await Invoice.findAll({ where: { due_date: { [Op.eq]: null } as any } });

        const report: InvoiceSchemaUpdateReport = {
            timestamp: new Date(),
            totalInvoices: invoices.length,
            updated: 0,
            skipped: 0,
            failures: [],
            statusMessage: 'Processing started.'
        };

        logger.info('invoiceSchemaUpdate started', { totalInvoicesToProcess: report.totalInvoices });

        for (const invoice of invoices) {
            try {
                // Load the request for this invoice (we need doneeAccount and request.createdAt etc.)
                const request = await Request.findByPk(invoice.request_id, { include: ['doneeAccount'] });
                if (!request) {
                    const msg = 'Request not found';
                    logger.warn('Skipping invoice because request not found', { invoiceId: invoice.id, requestId: invoice.request_id });
                    report.failures.push({ id: invoice.id, error: msg, dev_error: undefined, data: { requestId: invoice.request_id ? String(invoice.request_id) : null } });
                    report.skipped++;
                    continue;
                }

                let assetInformation;
                try {
                    assetInformation = await InvoiceService.createAssetInformation(request);
                } catch (err) {
                    // If the factory call fails for this request, log and skip
                    const devErr = (err as any)?.stack ? String((err as any).stack) : String(err);
                    logger.error('Failed to compute asset information for invoice', { invoiceId: invoice.id, requestId: invoice.request_id, err });
                    report.failures.push({ row: invoice.id, error: 'Failed to compute asset information', dev_error: devErr, data: { requestId: invoice.request_id ? String(invoice.request_id) : null } });
                    report.skipped++;
                    continue;
                }

                const total_amount_pennies = assetInformation.total_pennies;
                const american_surplus_amount_pennies = assetInformation.americanSurplusTotal_pennies;
                const sasp_net_amount_pennies = total_amount_pennies - american_surplus_amount_pennies;
                const total_amount = assetInformation.total;
                const american_surplus_amount = assetInformation.americanSurplusTotal;
                const sasp_net_amount = total_amount - american_surplus_amount;

                await invoice.update({
                    total_amount_pennies,
                    american_surplus_amount_pennies,
                    sasp_net_amount_pennies,
                    total_amount,
                    american_surplus_amount,
                    sasp_net_amount,
                    due_date: new Date(invoice.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 DAYS NET
                });

                report.updated++;
                logger.info('Invoice penny columns updated', { invoiceId: invoice.id, requestId: invoice.request_id, total_amount_pennies, american_surplus_amount_pennies, sasp_net_amount_pennies });
            } catch (err) {
                const devErr = (err as any)?.stack ? String((err as any).stack) : String(err);
                logger.error('Failed to update invoice', { invoiceId: invoice.id, err });
                report.failures.push({ row: invoice.id, error: 'Failed to update invoice', dev_error: devErr, data: { requestId: invoice.request_id ? String(invoice.request_id) : null } });
                report.skipped++;
            }
        }

        report.statusMessage = report.failures.length > 0 ? 'Completed with failures' : 'Completed successfully';

        logger.info('invoiceSchemaUpdate finished', { updated: report.updated, skipped: report.skipped, failures: report.failures.length });

        return report;
    }


    /**
     * 
     * fix invoices condition code in asset_line_json
     */
    static async invoicesDisposalConditionCodeUpdate(): Promise<InvoiceSchemaUpdateReport> {
        const invoices = await Invoice.findAll();

        const report: InvoiceSchemaUpdateReport = {
            timestamp: new Date(),
            totalInvoices: invoices.length,
            updated: 0,
            skipped: 0,
            failures: [],
            statusMessage: 'Processing started.'
        };

        logger.info('invoiceSchemaUpdate started', { totalInvoicesToProcess: report.totalInvoices });

        for (const invoice of invoices) {
            try {
                // Load the request for this invoice (we need doneeAccount and request.createdAt etc.)
                const request = await Request.findByPk(invoice.request_id, { include: ['doneeAccount'] });
                if (!request) {
                    const msg = 'Request not found';
                    logger.warn('Skipping invoice because request not found', { invoiceId: invoice.id, requestId: invoice.request_id });
                    report.failures.push({ id: invoice.id, error: msg, dev_error: undefined, data: { requestId: invoice.request_id ? String(invoice.request_id) : null } });
                    report.skipped++;
                    continue;
                }

                let assetInformation;
                try {
                    assetInformation = await InvoiceService.createAssetInformation(request);
                } catch (err) {
                    // If the factory call fails for this request, log and skip
                    const devErr = (err as any)?.stack ? String((err as any).stack) : String(err);
                    logger.error('Failed to compute asset information for invoice', { invoiceId: invoice.id, requestId: invoice.request_id, err });
                    report.failures.push({ row: invoice.id, error: 'Failed to compute asset information', dev_error: devErr, data: { requestId: invoice.request_id ? String(invoice.request_id) : null } });
                    report.skipped++;
                    continue;
                }

                // Parse existing invoice_data
                let invoiceData = typeof invoice.invoice_data === 'string'
                    ? JSON.parse(invoice.invoice_data)
                    : invoice.invoice_data;

                // Ensure assetInformation exists in invoice_data
                if (!invoiceData.assetInformation) {
                    invoiceData.assetInformation = [];
                }

                // Update disposal codes from new asset information
                if (assetInformation?.propertyDetails?.length > 0) {
                    // Create a map of assetId to disposalCode for quick lookup
                    const disposalCodeMap = new Map(
                        assetInformation.propertyDetails.map(detail => [detail.assetId, detail.disposalCode])
                    );

                    // Update each asset in invoice_data with its disposal code
                    if (invoiceData.assetInformation?.propertyDetails?.length > 0) {
                        invoiceData.assetInformation.propertyDetails = invoiceData.assetInformation.propertyDetails.map((property: any) => {
                            const disposalCode = disposalCodeMap.get(property.assetId);
                            if (disposalCode) {
                                return { ...property, disposalCode };
                            }
                            return property;
                        });
                    }

                    console.log(invoiceData.assetInformation)

                    // Update the invoice with modified data
                    const updatedInvoice = await Invoice.update({
                        invoice_data: invoiceData
                    }, { where: { id: invoice.id } });

                    console.log(updatedInvoice)

                    logger.info('Updated invoice disposal codes', {
                        invoiceId: invoice.id,
                        requestId: invoice.request_id,
                        assetCount: invoiceData.assetInformation.length
                    });
                }

                report.updated++;
                logger.info('Invoice updated', { invoiceId: invoice.id, requestId: invoice.request_id });
            } catch (err) {
                const devErr = (err as any)?.stack ? String((err as any).stack) : String(err);
                logger.error('Failed to update invoice', { invoiceId: invoice.id, err });
                report.failures.push({ row: invoice.id, error: 'Failed to update invoice', dev_error: devErr, data: { requestId: invoice.request_id ? String(invoice.request_id) : null } });
                report.skipped++;
            }
        }

        report.statusMessage = report.failures.length > 0 ? 'Completed with failures' : 'Completed successfully';

        logger.info('invoiceSchemaUpdate finished', { updated: report.updated, skipped: report.skipped, failures: report.failures.length });

        return report;
    }

    /**
     * Fix wrong data sets by:
     * 1. Updating properties marked as denied to have denied status
     * 2. Checking partially allocated requests and their properties
     * 3. Updating request status to INVOICE_REQUIRED if all active properties are PICKUP_APPROVED
     */
    static async fixDeniedPropertiesAndRequestStatuses() {
        const result: {
            deniedPropertiesUpdated: number;
            requestsProcessed: number;
            requestsStatusUpdated: number;
            updatedRequestIds: number[];
            updatedPropertyIds: number[];
            errors: Array<{ requestId?: number; error: string; timestamp: Date }>;
        } = {
            deniedPropertiesUpdated: 0,
            requestsProcessed: 0,
            requestsStatusUpdated: 0,
            updatedRequestIds: [],
            updatedPropertyIds: [],
            errors: []
        };

        try {
            await withTransaction(async (transaction) => {
                // Step 1 -> Update denied properties with denied status
                const deniedProperties = await Property.findAll({ where: { is_denied: true }, transaction });

                for (const property of deniedProperties) {
                    try {
                        if (property.property_status !== PropertyStatusEnum.DENIED) {
                            await Property.update({ property_status: PropertyStatusEnum.DENIED }, { where: { property_id: property.property_id }, transaction });
                            result.deniedPropertiesUpdated++;
                            result.updatedPropertyIds.push(property.property_id);
                        }
                    } catch (err: any) {
                        logger.error(`Error updating denied property ${property.property_id}: ${err.message}`);
                        result.errors.push({ error: `Failed to update denied property ${property.property_id}: ${err.message}`, timestamp: new Date() });
                    }
                }

                // Step 2 -> Fetch all partially allocated requests
                const partiallyAllocatedRequests = await Request.findAll({ where: { status: RequestStatusEnum.PARTIALLY_ALLOCATED }, transaction });
                result.requestsProcessed = partiallyAllocatedRequests.length;

                // Step 3 -> Check and update request statuses
                for (const request of partiallyAllocatedRequests) {
                    try {
                        const allRequestProperties = await Property.findAll({ where: { request_id: request.id }, transaction });
                        if (allRequestProperties.length === 0) continue;

                        const activeProperties = allRequestProperties.filter(p => !p.is_cancelled && !p.is_denied);
                        const pickupApprovedProperties = activeProperties.filter(property => property.property_status === PropertyStatusEnum.PICKUP_APPROVED);

                        if (pickupApprovedProperties.length > 0 && pickupApprovedProperties.length === activeProperties.length) {
                            await RequestService.updateRequest(request.id, { status: RequestStatusEnum.INVOICE_REQUIRED }, transaction);
                            result.requestsStatusUpdated++;
                            result.updatedRequestIds.push(request.id);
                        }
                    } catch (err: any) {
                        logger.error(`Error processing request ${request.id}: ${err.message}`);
                        result.errors.push({ requestId: request.id, error: `Failed to update request status: ${err.message}`, timestamp: new Date() });
                    }
                }
            });
        } catch (outerError: any) {
            logger.error(`Failed to fix denied properties and request statuses: ${outerError.message}`);
            result.errors.push({ error: `Transaction failed: ${outerError.message}`, timestamp: new Date() });
        }

        logger.info('Fix denied properties and request statuses process finished.', result);
        return result;
    }


    static async assignPrimaryContactFromHeadWhereMissing(): Promise<{ processedDoneeAccounts: number; createdScopes: number; skippedDoneeAccounts: Array<{ doneeAccountId: number; reason: string }> }> {
        const doneeScope = await Scope.findOne({ where: { type: ScopeType.DONEE } });
        const doneeAuthorizedRepRole = await Role.findOne({ where: { role_name: PredefinedRoles.Donee_Authorized_Representative } });
        if (!doneeScope || !doneeAuthorizedRepRole) throw new AppError(400, 'Could not find donee scope or donee authorized representative role');

        const activeDoneeAccounts = await DoneeAccount.findAll({
            where: { isActive: true },
            include: [{ model: Organization, as: 'organization' }],
            order: [['id', 'ASC']],
        });

        const report = {
            processedDoneeAccounts: 0,
            createdScopes: 0,
            skippedDoneeAccounts: [] as Array<{ doneeAccountId: number; reason: string }>,
        };

        for (const donee of activeDoneeAccounts) {
            const doneeId = donee.id;
            const org = (donee as any).organization as Organization | undefined;
            const orgContactEmail = org?.contact_email ? String(org.contact_email).trim().toLowerCase() : null;

            let resolvedUser: User | null = null;
            if (orgContactEmail) {
                resolvedUser = await User.findOne({ where: { email: orgContactEmail } });
            }

            const headScope = await UserScope.findOne({ where: { donee_account_id: doneeId, is_head_representative: true } });
            const userScopeForResolvedUser = resolvedUser
                ? await UserScope.findOne({ where: { donee_account_id: doneeId, user_id: resolvedUser.id } })
                : null;
            const resolvedOrgUser = resolvedUser
                ? await OrganizationUser.findOne({ where: { userId: resolvedUser.id, organizationId: donee.organizationId } })
                : null;

            await withTransaction(async (transaction) => {
                await UserScope.update(
                    { is_primary_contact: null },
                    {
                        where: {
                            donee_account_id: doneeId,
                            is_primary_contact: true,
                        },
                        transaction,
                    },
                );

                if (resolvedUser) {
                    if (userScopeForResolvedUser) {
                        await userScopeForResolvedUser.update({ is_primary_contact: true }, { transaction });
                    } else {
                        await UserScope.create(
                            {
                                user_id: resolvedUser.id,
                                scope_id: doneeScope.scope_id,
                                role_id: doneeAuthorizedRepRole.role_id,
                                organization_user_id: resolvedOrgUser?.id,
                                donee_account_id: doneeId,
                                is_primary_contact: true,
                                is_head_representative: null,
                            },
                            { transaction },
                        );
                        report.createdScopes++;
                    }

                    if (resolvedOrgUser && org) {
                        const orgUserUpdates: any = {};
                        if (!resolvedOrgUser.title && org.contact_title) orgUserUpdates.title = org.contact_title;
                        if (!resolvedOrgUser.phoneNumber && org.contact_phone) orgUserUpdates.phoneNumber = org.contact_phone;
                        if (Object.keys(orgUserUpdates).length) {
                            await resolvedOrgUser.update(orgUserUpdates, { transaction });
                        }
                    }
                } else if (headScope) {
                    await headScope.update({ is_primary_contact: true }, { transaction });
                } else {
                    const firstOrgUser = await OrganizationUser.findOne({
                        where: { organizationId: donee.organizationId, is_active: true },
                        order: [['id', 'ASC']],
                        transaction,
                    });

                    if (!firstOrgUser) {
                        report.skippedDoneeAccounts.push({ doneeAccountId: doneeId, reason: 'No active organization user found to assign primary contact' });
                        return;
                    }

                    await UserScope.create(
                        {
                            user_id: firstOrgUser.userId,
                            scope_id: doneeScope.scope_id,
                            role_id: doneeAuthorizedRepRole.role_id,
                            organization_user_id: firstOrgUser.id,
                            donee_account_id: doneeId,
                            is_primary_contact: true,
                            is_head_representative: true,
                        },
                        { transaction },
                    );
                    report.createdScopes++;

                    if (org) {
                        const orgUserUpdates: any = {};
                        if (!firstOrgUser.title && org.contact_title) orgUserUpdates.title = org.contact_title;
                        if (!firstOrgUser.phoneNumber && org.contact_phone) orgUserUpdates.phoneNumber = org.contact_phone;
                        if (Object.keys(orgUserUpdates).length) {
                            await firstOrgUser.update(orgUserUpdates, { transaction });
                        }
                    }
                }
            });

            report.processedDoneeAccounts++;
        }

        logger.info('assignPrimaryContactFromHeadWhereMissing completed', report);
        return report;
    }

    static async generateQboCustomers(options?: GenerateQboCustomersOptions): Promise<QboCustomerGenerationReport> {
        const report: QboCustomerGenerationReport = {
            timestamp: new Date(),
            totalDoneeAccountsFound: 0,
            processedCount: 0,
            createdCount: 0,
            alreadyLinkedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            skipped: [],
            failures: [],
            statusMessage: 'Processing started.'
        };

        const qboCustomerService = new QBOCustomerService();

        try {
            const whereClause: any = {
                name: { [Op.ne]: null }
            };

            if (options?.doneeAccountIds && options.doneeAccountIds.length > 0) {
                whereClause.id = { [Op.in]: options.doneeAccountIds };
            }

            const doneeAccounts = await DoneeAccount.findAll({
                where: whereClause,
                include: [
                    {
                        model: Organization,
                        as: 'organization'
                    }
                ],
                order: [['id', 'ASC']],
                ...(typeof options?.limit === 'number' ? { limit: options.limit } : {}),
                ...(typeof options?.offset === 'number' ? { offset: options.offset } : {}),
            });

            report.totalDoneeAccountsFound = doneeAccounts.length;

            for (const doneeAccount of doneeAccounts) {
                report.processedCount++;

                const doneeAccountName = doneeAccount.name;
                const trimmedName = doneeAccountName ? doneeAccountName.trim() : '';
                const organization = doneeAccount.organization;

                if (!trimmedName) {
                    report.skippedCount++;
                    report.skipped.push({
                        doneeAccountId: doneeAccount.id,
                        organizationId: doneeAccount.organizationId,
                        doneeAccountName,
                        reason: 'Donee account name is empty'
                    });
                    continue;
                }

                if (!organization) {
                    report.skippedCount++;
                    report.skipped.push({
                        doneeAccountId: doneeAccount.id,
                        organizationId: doneeAccount.organizationId,
                        doneeAccountName,
                        reason: 'Organization not found'
                    });
                    continue;
                }

                if (doneeAccount.qbo_ref_id) {
                    report.alreadyLinkedCount++;
                    continue;
                }

                try {
                    const hydrated = await OrganizationUserService.getOrganizationById(organization.id, undefined, { doneeAccountId: doneeAccount.id });
                    const customerPayload = await QBOCustomerService.generateCustomerData(organization, trimmedName, {
                        primaryPhone: hydrated?.primary_contact_phone ?? hydrated?.head_authorized_official_phone,
                        primaryEmail: hydrated?.primary_contact_email ?? hydrated?.head_authorized_official_email,
                    });
                    const qboCustomer = await qboCustomerService.create(customerPayload);

                    if (!qboCustomer?.Id) throw new AppError(400, 'QBO customer was created without an Id');

                    await doneeAccount.update({ qbo_ref_id: qboCustomer.Id });
                    report.createdCount++;
                } catch (error: any) {
                    report.failedCount++;
                    report.failures.push({
                        doneeAccountId: doneeAccount.id,
                        organizationId: doneeAccount.organizationId,
                        doneeAccountName,
                        error: error?.message || 'Failed to create QBO customer',
                        dev_error: error?.stack ? String(error.stack) : String(error),
                        timestamp: new Date()
                    });
                }
            }

            report.statusMessage = report.failedCount > 0 ? 'Completed with failures' : 'Completed successfully';
            logger.info('generateQboCustomers completed', {
                totalDoneeAccountsFound: report.totalDoneeAccountsFound,
                processedCount: report.processedCount,
                createdCount: report.createdCount,
                alreadyLinkedCount: report.alreadyLinkedCount,
                skippedCount: report.skippedCount,
                failedCount: report.failedCount
            });

            return report;
        } catch (error: any) {
            report.failedCount++;
            report.statusMessage = 'Failed';
            report.failures.push({
                doneeAccountId: 0,
                error: error?.message || 'Unexpected error while generating QBO customers',
                dev_error: error?.stack ? String(error.stack) : String(error),
                timestamp: new Date()
            });
            logger.error('generateQboCustomers failed', { error });
            return report;
        }
    }

    static async generateQboInvoices(batch_size: number): Promise<QboInvoiceGenerationReport> {
        const report: QboInvoiceGenerationReport = {
            timestamp: new Date(),
            batchSize: batch_size,
            totalInvoicesFound: 0,
            processedCount: 0,
            createdCount: 0,
            alreadyLinkedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            remainingCount: 0,
            skipped: [],
            failures: [],
            statusMessage: 'Processing started.'
        };

        const qboInvoiceService = new QBOInvoiceService();

        const eligible_where = {
            status: { [Op.notIn]: [InvoiceStatus.PAID, InvoiceStatus.CANCELED] },
            qbo_ref_id: { [Op.is]: null as any }
        };

        try {
            report.totalInvoicesFound = await Invoice.count({ where: eligible_where });

            const invoices = await Invoice.findAll({
                where: eligible_where,
                include: [
                    {
                        model: Request,
                        as: 'request',
                        include: [
                            {
                                model: DoneeAccount,
                                as: 'doneeAccount',
                                include: [
                                    {
                                        model: Organization,
                                        as: 'organization'
                                    }
                                ]
                            }
                        ]
                    }
                ],
                order: [['id', 'ASC']],
                limit: batch_size
            });

            for (const invoice of invoices) {
                report.processedCount++;

                try {
                    const request = invoice.request;
                    if (!request) {
                        report.skippedCount++;
                        report.skipped.push({
                            invoiceId: invoice.id,
                            requestId: invoice.request_id,
                            reason: 'Request not found'
                        });
                        continue;
                    }

                    if (!request.doneeAccount?.qbo_ref_id) {
                        report.skippedCount++;
                        report.skipped.push({
                            invoiceId: invoice.id,
                            requestId: invoice.request_id,
                            reason: 'Donee account does not have qbo_ref_id'
                        });
                        continue;
                    }

                    const invoiceDataContainer = typeof invoice.invoice_data === 'string'
                        ? JSON.parse(invoice.invoice_data)
                        : invoice.invoice_data;

                    const assetInformation = (invoiceDataContainer as any)?.assetInformation;
                    if (!assetInformation?.propertyDetails || !Array.isArray(assetInformation.propertyDetails)) {
                        report.skippedCount++;
                        report.skipped.push({
                            invoiceId: invoice.id,
                            requestId: invoice.request_id,
                            reason: 'Missing or invalid invoice_data.assetInformation.propertyDetails'
                        });
                        continue;
                    }

                    const rawInvoiceDate = (invoiceDataContainer as any)?.invoiceDate || invoice.createdAt;
                    const parsedInvoiceDate = rawInvoiceDate ? new Date(rawInvoiceDate) : new Date();
                    const invoiceDate = Number.isNaN(parsedInvoiceDate.getTime()) ? new Date() : parsedInvoiceDate;

                    const rawDueDate = invoice.due_date || (invoiceDataContainer as any)?.dueDate;
                    const parsedDueDate = rawDueDate ? new Date(rawDueDate) : new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                    const dueDate = Number.isNaN(parsedDueDate.getTime())
                        ? new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000)
                        : parsedDueDate;

                    const payload = QBOInvoiceService.generateInvoiceData(
                        request,
                        invoice.invoice_no,
                        invoiceDate,
                        dueDate,
                        assetInformation
                    );

                    const qboInvoice = await qboInvoiceService.create(payload);
                    if (!qboInvoice?.Id) throw new AppError(400, 'QBO invoice was created without an Id');

                    await invoice.update({ qbo_ref_id: qboInvoice.Id });
                    report.createdCount++;
                } catch (error: any) {
                    report.failedCount++;
                    report.failures.push({
                        invoiceId: invoice.id,
                        requestId: invoice.request_id,
                        error: error?.message || 'Failed to create QBO invoice',
                        dev_error: error?.stack ? String(error.stack) : String(error),
                        timestamp: new Date()
                    });
                }
            }

            report.remainingCount = await Invoice.count({ where: eligible_where });
            report.statusMessage = report.failedCount > 0 ? 'Completed with failures' : 'Completed successfully';
            logger.info('generateQboInvoices completed', {
                batchSize: report.batchSize,
                totalInvoicesFound: report.totalInvoicesFound,
                processedCount: report.processedCount,
                createdCount: report.createdCount,
                skippedCount: report.skippedCount,
                failedCount: report.failedCount,
                remainingCount: report.remainingCount
            });

            return report;
        } catch (error: any) {
            report.failedCount++;
            report.statusMessage = 'Failed';
            report.failures.push({
                invoiceId: 0,
                error: error?.message || 'Unexpected error while generating QBO invoices',
                dev_error: error?.stack ? String(error.stack) : String(error),
                timestamp: new Date()
            });
            logger.error('generateQboInvoices failed', { error });
            return report;
        }
    }

    static async markInvoicesPaidAndCompleteRequests(invoiceIds: number[]): Promise<InvoicePaymentMigrationReport> {
        const uniqueInvoiceIds = Array.from(new Set(invoiceIds));

        const report: InvoicePaymentMigrationReport = {
            timestamp: new Date(),
            totalInvoiceIdsReceived: invoiceIds.length,
            processedCount: 0,
            updatedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            skipped: [],
            failures: [],
            statusMessage: 'Processing started.'
        };

        for (const invoiceId of uniqueInvoiceIds) {
            report.processedCount++;

            try {
                await withTransaction(async (transaction) => {
                    const invoice = await Invoice.findByPk(invoiceId, { transaction });
                    if (!invoice) {
                        report.skippedCount++;
                        report.skipped.push({ invoiceId, reason: 'Invoice not found' });
                        return;
                    }

                    const request = await Request.findByPk(invoice.request_id, { transaction });
                    if (!request) {
                        report.skippedCount++;
                        report.skipped.push({ invoiceId, reason: 'Request not found for invoice' });
                        return;
                    }

                    await invoice.update({ status: InvoiceStatus.PAID }, { transaction });

                    await InvoiceActivityLog.create({
                        invoice_id: invoice.id,
                        activity: InvoiceActivity.INVOICE_PAID,
                        metadata: {
                            invoice_no: invoice.invoice_no,
                            source: 'data-migration'
                        },
                        activator: request.requestor,
                    }, { transaction });

                    await request.update({ status: RequestStatusEnum.COMPLETED }, { transaction });

                    report.updatedCount++;
                });
            } catch (error: any) {
                report.failedCount++;
                report.failures.push({
                    invoiceId,
                    error: error?.message || 'Failed to process invoice payment migration',
                    dev_error: error?.stack ? String(error.stack) : String(error),
                    timestamp: new Date()
                });
            }
        }

        report.statusMessage = report.failedCount > 0 ? 'Completed with failures' : 'Completed successfully';
        return report;
    }

    static async migrateEligibilityApplicationSignatures(): Promise<any> {
        const report = {
            timestamp: new Date(),
            totalApplicationsChecked: 0,
            updatedCount: 0,
            pdfRegeneratedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            failures: [] as any[],
            statusMessage: 'Migration started'
        };

        try {
            // Get all applications with submitted_date
            const applications = await Application.findAll({
                where: {
                    submitted_date: { [Op.ne]: null as any }
                },
                include: [
                    { model: Organization, as: 'organization' },
                    { model: State, as: 'state' },
                    { model: User, as: 'createdBy' }
                ]
            });

            report.totalApplicationsChecked = applications.length;
            logger.info('Found applications for signature migration', { count: applications.length });

            // Process each application
            for (const application of applications) {
                try {
                    // Check if signed_date needs to be filled
                    if (application.submitted_date) {
                        await withTransaction(async (transaction) => {
                            // Update signed_date with submitted_date
                            await application.update({
                                signed_date: application.submitted_date,
                            }, { transaction });

                            report.updatedCount++;

                            // Regenerate PDF by calling signEligibilityApplication
                            try {
                                await DocumentFactory.handler(DocumentActionType.SIGN_ELIGIBILITY_APPLICATION, { application, signedBy: application.createdBy as User }, transaction);
                                report.pdfRegeneratedCount++;
                            } catch (pdfError: any) {
                                report.failures.push({
                                    applicationId: application.id,
                                    organizationId: application.organization_id,
                                    step: 'PDF Regeneration',
                                    error: pdfError?.message || 'Failed to regenerate PDF',
                                    dev_error: pdfError?.stack ? String(pdfError.stack) : String(pdfError),
                                    timestamp: new Date()
                                });
                            }

                            const shouldSignWithApprover = [
                                EligibilityApplicationStatuses.APPROVED,
                                EligibilityApplicationStatuses.FORM_EXPIRED,
                                EligibilityApplicationStatuses.APPLICATION_EXPIRED,
                            ].includes(application.status as EligibilityApplicationStatuses);

                            if (shouldSignWithApprover) {
                                try {
                                    const approvalLog = await ApplicationLog.findOne({
                                        where: {
                                            application_id: application.id,
                                            action: EligbilityActions.APPLICATION_APPROVED,
                                        },
                                        order: [['createdAt', 'DESC']],
                                        transaction,
                                    });

                                    if (approvalLog?.user_id) {
                                        const approverUser = await User.findByPk(approvalLog.user_id, {
                                            include: [
                                                {
                                                    model: UserScope,
                                                    as: 'userScopes',
                                                    include: [
                                                        { model: Scope, as: 'scope' },
                                                        { model: OrganizationUser, as: 'organizationUser' },
                                                        { model: SaspUser, as: 'saspUser' },
                                                    ],
                                                },
                                            ],
                                            transaction,
                                        });
                                        if (approverUser) {
                                            type ApproverScope = {
                                                type: string;
                                                stateId?: number;
                                                isActive: boolean;
                                                organizationId?: string;
                                                title?: string;
                                            };
                                            const approverScopes = (approverUser.userScopes || [])
                                                .map((userScope) => {
                                                    if (!userScope.scope) return null;
                                                    return {
                                                        ...userScope.scope.dataValues,
                                                        organizationId: userScope.organizationUser?.organizationId,
                                                        stateId: userScope.saspUser?.stateId,
                                                        isActive: false,
                                                        title: userScope.saspUser?.title,
                                                    };
                                                })
                                                .filter(Boolean) as ApproverScope[];

                                            const activeSaspScope = approverScopes.find(
                                                (scope) =>
                                                    scope.type === ScopeType.SASP
                                                    && Number(scope.stateId) === Number(application.state_id),
                                            );
                                            if (activeSaspScope) activeSaspScope.isActive = true;
                                            approverUser.scopes = approverScopes as unknown as Scope[];

                                            await DocumentFactory.handler(
                                                DocumentActionType.SIGN_ELIGIBILITY_APPLICATION,
                                                { application, signedBy: approverUser },
                                                transaction
                                            );
                                            report.pdfRegeneratedCount++;
                                        }
                                    }
                                } catch (pdfError: any) {
                                    report.failures.push({
                                        applicationId: application.id,
                                        organizationId: application.organization_id,
                                        step: 'PDF Regeneration with Approver',
                                        error: pdfError?.message || 'Failed to regenerate PDF with approver',
                                        dev_error: pdfError?.stack ? String(pdfError.stack) : String(pdfError),
                                        timestamp: new Date()
                                    });
                                }
                            }
                        });
                    } else {
                        report.skippedCount++;
                    }
                } catch (error: any) {
                    report.failedCount++;
                    report.failures.push({
                        applicationId: application.id,
                        organizationId: application.organization_id,
                        step: 'Update signed_date',
                        error: error?.message || 'Failed to process application',
                        dev_error: error?.stack ? String(error.stack) : String(error),
                        timestamp: new Date()
                    });
                }
            }

            report.statusMessage = report.failedCount > 0 ? 'Completed with failures' : 'Completed successfully';
            logger.info('migrateEligibilityApplicationSignatures completed', {
                totalApplicationsChecked: report.totalApplicationsChecked,
                updatedCount: report.updatedCount,
                pdfRegeneratedCount: report.pdfRegeneratedCount,
                skippedCount: report.skippedCount,
                failedCount: report.failedCount
            });

            return report;
        } catch (error: any) {
            report.failedCount++;
            report.statusMessage = 'Migration failed';
            report.failures.push({
                error: error?.message || 'Migration process failed',
                dev_error: error?.stack ? String(error.stack) : String(error),
                timestamp: new Date()
            });
            logger.error('migrateEligibilityApplicationSignatures failed', { error });
            return report;
        }
    }
}
