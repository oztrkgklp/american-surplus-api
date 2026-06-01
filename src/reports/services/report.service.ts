import path from 'path';
import { AppError } from '@/utils/response/appError';
import { paginateSequelize } from '@/utils/pagination';
import { PaginatedResponse } from '@/utils/pagination/interfaces';
import { Op, Transaction } from 'sequelize';
import Decimal from 'decimal.js';
import { getSequelizeCondition, getSequelizeDateCondition, shouldApplyFilter } from '@/utils/filteringOperations';
import Report, { ReportType } from '../models/Report.entity';
import ReportLog from '../models/ReportLog.entity';
import Mapping3040 from '../models/Mapping3040.entity';
import { ReportLogAction } from '../models/ReportLog.entity';
import Property from '@/properties/models/Property';
import Request from '@/properties/models/Request';
import DoneeAccount from '@/organization/models/DoneeAccount';
import State from '@/states/models/State';
import DocumentFactory, { DocumentActionType } from '@/documents/services/document-factory.service';
import { StoragePaths } from '@/utils/storage/paths';
import { writeFile } from '@/utils/storage/fileSystem';
import { AllocationsExportService } from './allocations-export.service';

type ReportSectionDefinition = {
    title: string;
    totalLabel: string;
    categories: string[];
};

type ReportSectionPayload = {
    title: string;
    rows: Array<{ label: string; amount: number }>;
    totalLabel: string;
    totalAmount: number;
};

const REPORT_3040_STRUCTURE: ReportSectionDefinition[] = [
    {
        title: 'Public Agency Donations',
        totalLabel: 'Total Public Agency Donations',
        categories: [
            'Conservation',
            'Economic Development',
            'Education',
            'Parks & Recreation',
            'Public Health',
            'Public Safety',
            'Assistance to the Homeless',
            'Assistance to Impoverished Families or Individuals',
            'Assistance to Older Americans',
            'Public Purpose(s)',
            'Other',
        ],
    },
    {
        title: 'Non-Profit Donations',
        totalLabel: 'Total Non-Profit Donations',
        categories: [
            'Education',
            'Public Health',
            'Assistance to the Homeless',
            'Assistance to Impoverished Families or Individuals',
            'Assistance to Older Americans',
        ],
    },
    {
        title: 'Miscellaneous Donations/Transfers',
        totalLabel: 'Total Miscellaneous Donations/Transfers',
        categories: [
            'Transfers to Other SASPs',
            'Return to Federal Agency',
            'Transfers for SASP Use',
            'SBA 8(a) Donations',
            'SEA Donations',
            'SBA VOSB Donations',
            'Donations to Veteran Organizations',
            'SBA Disaster (RISE Act) Donations',
        ],
    },
    {
        title: 'Other Disposal Methods',
        totalLabel: 'Total Other Disposal Methods',
        categories: [
            'Sold',
            'Abandoned or Destroyed',
            'Other/ Negative Adjustments (explain in comments)',
        ],
    },
];

/** Allowed sort/filter column names for reports (whitelist) */
const REPORT_SORTABLE_COLUMNS = new Set([
    'id', 'name', 'type', 'state_id', 'donee_account_id', 'organization_id', 'created_by', 'createdAt', 'updatedAt'
]);

/** Types included when listing with `type=all` (matches SASP UI report kinds). */
const REPORT_TYPES_FOR_LIST_ALL: string[] = Object.values(ReportType);

export class ReportService {
    /**
     * Create a new report
     */
    static async createReport(
        reportData: {
            state_id: number;
            name: string;
            type: string;
            donee_account_id?: number;
            organization_id?: string;
            created_by: string;
            startDate?: string;
            endDate?: string;
            year?: number;
            month?: number;
        },
        transaction?: Transaction
    ): Promise<Report> {
        try {
            let resolvedReportData;
            let resolvedFilePath;
            let normalizedType = reportData.type;

            switch (reportData.type) {
                case ReportType.REPORT_3040:
                case '3040': {
                    normalizedType = ReportType.REPORT_3040;

                    const generated3040 = await this.generate3040Report(
                        {
                            state_id: reportData.state_id,
                            name: reportData.name,
                            startDate: reportData.startDate,
                            endDate: reportData.endDate,
                        },
                        transaction
                    );

                    resolvedReportData = generated3040.report_data;
                    resolvedFilePath = generated3040.file_path;
                    break;
                }
                case ReportType.REPORT_MONTHLY_ALLOCATIONS:
                case 'report_monthly_allocations': {
                    normalizedType = ReportType.REPORT_MONTHLY_ALLOCATIONS;
                    if (
                        reportData.year === undefined ||
                        reportData.month === undefined ||
                        !Number.isFinite(reportData.year) ||
                        !Number.isFinite(reportData.month)
                    ) {
                        throw new AppError(400, 'year and month are required for monthly allocations reports');
                    }
                    const generatedAlloc = await this.generateMonthlyAllocationsReport(
                        {
                            state_id: reportData.state_id,
                            name: reportData.name,
                            year: Number(reportData.year),
                            month: Number(reportData.month),
                        },
                        transaction
                    );
                    resolvedReportData = generatedAlloc.report_data;
                    resolvedFilePath = generatedAlloc.file_path;
                    break;
                }
                default: {
                    throw new AppError(400, 'Unsupported report type');
                    break;
                }
            }

            const report = await Report.create(
                {
                    state_id: reportData.state_id,
                    name: reportData.name,
                    type: normalizedType,
                    report_data: resolvedReportData,
                    file_path: resolvedFilePath,
                    donee_account_id: reportData.donee_account_id,
                    organization_id: reportData.organization_id,
                    created_by: reportData.created_by,
                },
                { transaction }
            );

            // Log the creation
            if (report.id) {
                await ReportLog.create(
                    {
                        report_id: report.id,
                        action: ReportLogAction.CREATED,
                        created_by: reportData.created_by,
                        description: `Report "${reportData.name}" created`,
                        metadata: { type: reportData.type },
                    },
                    { transaction }
                );
            }

            return report;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(500, 'Failed to create report', (error as any).message);
        }
    }

    private static async generateMonthlyAllocationsReport(
        payload: { state_id: number; name: string; year: number; month: number },
        _transaction?: Transaction
    ): Promise<{ report_data: object; file_path: string }> {
        const state = await State.findByPk(payload.state_id, { transaction: _transaction });
        if (!state) throw new AppError(404, 'State not found');

        const { year, month } = payload;
        if (!Number.isInteger(month) || month < 1 || month > 12) {
            throw new AppError(400, 'month must be an integer from 1 to 12');
        }
        if (!Number.isInteger(year) || year < 1970 || year > 2100) {
            throw new AppError(400, 'year must be a valid integer');
        }

        const csv = await AllocationsExportService.buildMonthlyAllocationsCsv(payload.state_id, year, month);
        const outputDir = StoragePaths.private.sasp.state(payload.state_id.toString()).monthlyAllocationsReports;
        const generatedAt = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = payload.name.replace(/[^a-zA-Z0-9-_]+/g, '_');
        const fileName = `${safeName}_${year}-${String(month).padStart(2, '0')}_${generatedAt}.csv`;
        const filePath = path.join(outputDir, fileName);
        await writeFile(filePath, `\uFEFF${csv}`);

        return {
            file_path: filePath,
            report_data: {
                state_id: payload.state_id,
                state_name: state.stateName,
                year,
                month,
                generatedAt: new Date().toISOString(),
            },
        };
    }

    /**
     * Get report by ID with all associations
     */
    static async getReportById(reportId: number): Promise<Report | null> {
        try {
            const report = await Report.findByPk(reportId, { include: ['state', 'organization', 'doneeAccount', 'creator', 'logs'] });

            if (!report) throw new AppError(404, 'Report not found');
            return report;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(500, 'Failed to fetch report', (error as any).message);
        }
    }

    /**
     * Get all reports by type with pagination, sorting, and filtering
     */
    static async getReportsByType(
        type: string,
        page: number = 1,
        limit: number = 10,
        stateId?: number,
        sortBy?: string,
        sortOrder: 'asc' | 'desc' = 'desc',
        filterKey?: string,
        filterValue?: string,
        operator: string = 'contains'
    ): Promise<PaginatedResponse<Report>> {
        try {
            const whereClause: Record<string, any> = {};
            if (type.toLowerCase() === 'all') {
                whereClause.type = { [Op.in]: REPORT_TYPES_FOR_LIST_ALL };
            } else {
                whereClause.type = type;
            }

            if (stateId) whereClause.state_id = stateId;

            // Apply filtering
            if (filterKey && shouldApplyFilter(operator, filterValue) && REPORT_SORTABLE_COLUMNS.has(filterKey)) {
                const trimmed = String(filterValue ?? '').trim();
                if (filterKey === 'createdAt' || filterKey === 'updatedAt') {
                    whereClause[filterKey] = getSequelizeDateCondition(operator, trimmed);
                } else if (['id', 'state_id', 'donee_account_id'].includes(filterKey)) {
                    whereClause[filterKey] = getSequelizeCondition(operator, trimmed, 'number');
                } else {
                    whereClause[filterKey] = getSequelizeCondition(operator, trimmed.toLowerCase());
                }
            }

            // Apply sorting
            const order: any[] = [];
            if (sortBy && REPORT_SORTABLE_COLUMNS.has(sortBy)) {
                order.push([sortBy, sortOrder === 'asc' ? 'ASC' : 'DESC']);
            } else {
                order.push(['createdAt', 'DESC']);
            }

            return await paginateSequelize<Report>(
                Report,
                page,
                limit,
                {
                    where: whereClause,
                    include: ['state', 'organization', 'doneeAccount', 'creator'],
                    order: order as any,
                }
            );
        } catch (error) {
            throw new AppError(500, 'Failed to fetch reports', (error as any).message);
        }
    }

    /**
     * Update a report
     */
    static async updateReport(reportId: number, updateData: { name?: string; report_data?: object | string; file_path?: string | null; }, userId: string, transaction?: Transaction): Promise<Report> {
        try {
            const report = await Report.findByPk(reportId, { transaction });
            if (!report) throw new AppError(404, 'Report not found');

            await report.update(updateData, { transaction });

            // Log the update
            await ReportLog.create(
                {
                    report_id: reportId,
                    action: ReportLogAction.UPDATED,
                    created_by: userId,
                    description: `Report updated`,
                    metadata: { updatedFields: Object.keys(updateData) },
                },
                { transaction }
            );

            return report;
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(500, 'Failed to update report', (error as any).message);
        }
    }

    /**
     * Delete a report
     */
    static async deleteReport(reportId: number, userId: string, transaction?: Transaction): Promise<void> {
        try {
            const report = await Report.findByPk(reportId, { transaction });
            if (!report) throw new AppError(404, 'Report not found');

            // Log the deletion
            await ReportLog.create(
                {
                    report_id: reportId,
                    action: ReportLogAction.DELETED,
                    created_by: userId,
                    description: `Report deleted`,
                },
                { transaction }
            );

            await report.destroy({ transaction });
        } catch (error) {
            if (error instanceof AppError) throw error;
            throw new AppError(500, 'Failed to delete report', (error as any).message);
        }
    }

    /**
     * Get report logs by report ID
     */
    static async getReportLogs(reportId: number, page: number = 1, limit: number = 10): Promise<PaginatedResponse<ReportLog>> {
        try {
            return await paginateSequelize<ReportLog>(
                ReportLog,
                page,
                limit,
                {
                    where: { report_id: reportId },
                    include: ['user'],
                    order: [['createdAt', 'DESC']],
                }
            );
        } catch (error) {
            throw new AppError(500, 'Failed to fetch report logs', (error as any).message);
        }
    }

    /**
     * Create or update 3040 mapping
     */
    static async upsert3040Mapping(
        mappingData: {
            donee_account_id: number;
            organization_id: string;
            state_id: number;
            section: string;
            category: string;
            created_by?: string;
        },
        transaction?: Transaction
    ): Promise<Mapping3040> {
        try {
            const mapping = await Mapping3040.findOne({
                where: {
                    donee_account_id: mappingData.donee_account_id,
                    organization_id: mappingData.organization_id,
                    state_id: mappingData.state_id,
                    section: mappingData.section,
                    category: mappingData.category,
                },
                transaction,
            });

            if (mapping) return mapping;

            return await Mapping3040.create(mappingData, { transaction });
        } catch (error) {
            throw new AppError(500, 'Failed to upsert 3040 mapping', (error as any).message);
        }
    }

    /**
     * Get all mappings by state
     */
    static async getMappingsByState(stateId: number, page: number = 1, limit: number = 10): Promise<PaginatedResponse<Mapping3040>> {
        try {
            return await paginateSequelize<Mapping3040>(
                Mapping3040,
                page,
                limit,
                {
                    where: { state_id: stateId },
                    include: ['state', 'organization', 'doneeAccount'],
                    order: [['createdAt', 'ASC']],
                }
            );
        } catch (error) {
            throw new AppError(500, 'Failed to fetch mappings', (error as any).message);
        }
    }

    private static async generate3040Report(payload: { state_id: number; name: string; startDate?: string; endDate?: string; }, transaction?: Transaction): Promise<{ report_data: object; file_path: string }> {
        const state = await State.findByPk(payload.state_id, { transaction });
        if (!state) throw new AppError(404, 'State not found');

        if (!payload.startDate || !payload.endDate) throw new AppError(400, 'startDate and endDate are required for a 3040 report');

        const start = new Date(payload.startDate);
        const end = new Date(payload.endDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError(400, 'Invalid startDate or endDate');

        const rangeStart = new Date(start);
        rangeStart.setUTCHours(0, 0, 0, 0);

        const rangeEnd = new Date(end);
        rangeEnd.setUTCHours(23, 59, 59, 999);

        if (rangeStart.getTime() > rangeEnd.getTime()) throw new AppError(400, 'startDate must be earlier than or equal to endDate');

        // Query to aggregate property values by section and category using their mappings
        // Calculate as allocated_quantity * original_value to account for partial allocations
        const aggregatedData = await Property.sequelize!.query(`
            SELECT 
                m.section,
                m.category,
                SUM(CAST(p.property_allocated_quantity * p.property_original_value AS DECIMAL(15, 2))) as total_value,
                COUNT(DISTINCT da.id) as donee_count
            FROM properties p
            INNER JOIN requests r ON p.request_id = r.id
            INNER JOIN donee_accounts da ON r.donee_account = da.id
            INNER JOIN \`3040_mappings\` m ON da.id = m.donee_account_id
            WHERE p.property_allocated_quantity > 0
                AND p.property_allocated_date >= :rangeStart
                AND p.property_allocated_date <= :rangeEnd
                AND p.is_cancelled = false
                AND p.is_denied = false
                AND da.stateId = :stateId
                AND m.state_id = :stateId
            GROUP BY m.section, m.category
        `, {
            replacements: {
                rangeStart: rangeStart.getTime(),
                rangeEnd: rangeEnd.getTime(),
                stateId: payload.state_id,
            },
            type: 'SELECT',
            transaction,
        }) as Array<{ section: string; category: string; total_value: number; donee_count: number }>;

        // Query to find unmapped donee accounts (those with properties but no mapping)
        const unmappedDoneeQuery = await Property.sequelize!.query(`
            SELECT DISTINCT da.id
            FROM properties p
            INNER JOIN requests r ON p.request_id = r.id
            INNER JOIN donee_accounts da ON r.donee_account = da.id
            LEFT JOIN \`3040_mappings\` m ON da.id = m.donee_account_id AND m.state_id = :stateId
            WHERE p.property_allocated_quantity > 0
                AND p.property_allocated_date >= :rangeStart
                AND p.property_allocated_date <= :rangeEnd
                AND p.is_cancelled = false
                AND p.is_denied = false
                AND da.stateId = :stateId
                AND m.id IS NULL
        `, {
            replacements: {
                rangeStart: rangeStart.getTime(),
                rangeEnd: rangeEnd.getTime(),
                stateId: payload.state_id,
            },
            type: 'SELECT',
            transaction,
        }) as Array<{ id: number }>;

        const unmappedDoneeAccountIds = new Set<number>(unmappedDoneeQuery.map(row => row.id));

        // Build finalized sections directly from aggregated data
        const finalizedSections = REPORT_3040_STRUCTURE.map((sectionDef) => {
            const rows = sectionDef.categories.map((category) => {
                const aggregated = aggregatedData.find(
                    row =>
                        this.normalize3040Label(row.section) === this.normalize3040Label(sectionDef.title) &&
                        this.normalize3040Label(row.category) === this.normalize3040Label(category)
                );
                return {
                    label: category,
                    amount: aggregated ? Number(aggregated.total_value || 0) : 0,
                };
            });

            const totalAmount = rows.reduce((sum, row) => sum.plus(new Decimal(row.amount)), new Decimal(0));
            return {
                title: sectionDef.title,
                rows,
                totalLabel: sectionDef.totalLabel,
                totalAmount: totalAmount.toString(),
            };
        });

        const grandTotalDecimal = finalizedSections.reduce((sum, section) => sum.plus(new Decimal(section.totalAmount)), new Decimal(0));
        const grandTotal = grandTotalDecimal.toString();
        const dateRangeLabel = `${this.formatDate(rangeStart)} - ${this.formatDate(rangeEnd)}`;
        const generatedAt = new Date().toISOString();
        const reportFileName = `${payload.name.replace(/[^a-zA-Z0-9-_]+/g, '_')}_${this.formatDateForFile(rangeStart)}_${this.formatDateForFile(rangeEnd)}_${generatedAt}.pdf`;
        const outputPath = StoragePaths.private.sasp.state(payload.state_id.toString()).reports3040;

        const filePath = await DocumentFactory.handler(
            DocumentActionType.GENERATE_3040_REPORTING,
            {
                reportTitle: payload.name,
                stateName: `${state.stateName} SASP Donation Report`,
                dateRangeLabel,
                reportFileName,
                outputPath,
                sections: finalizedSections,
                grandTotal,
                generatedAt,
            },
            transaction
        ) as string;

        return {
            file_path: filePath,
            report_data: {
                state_id: payload.state_id,
                state_name: state.stateName,
                startDate: payload.startDate,
                endDate: payload.endDate,
                dateRangeLabel,
                generatedAt,
                sections: finalizedSections,
                grandTotal,
                unmappedDoneeAccountIds: Array.from(unmappedDoneeAccountIds),
            },
        };
    }

    private static normalize3040Label(label: string): string {
        return label.trim().toLowerCase().replace(/\s+/g, ' ');
    }

    private static formatDate(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private static formatDateForFile(date: Date): string {
        return this.formatDate(date).replace(/-/g, '');
    }
}
