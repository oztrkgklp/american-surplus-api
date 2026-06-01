import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { AppError } from '@/utils/response/appError';
import { ReportService } from '../services/report.service';
import { ReportType } from '../models/Report.entity';
import { withTransaction } from '@/utils/transactionalOperation';
import { fileExists, getFileMimeType, readFile } from '@/utils/storage/fileSystem';

/**
 * Create a new report
 * POST /report/:type/create
 */
export const createReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type } = req.params;
    const { state_id, name, donee_account_id, organization_id, startDate, endDate, year, month } = req.body;
    const userId = req.user?.id;

    if (!type || !name || !state_id) throw new AppError(400, 'Missing required fields');
    if (!userId) throw new AppError(401, 'Unauthorized', 'User ID not found');

    const is3040 =
      type === ReportType.REPORT_3040 || type === '3040' || type === 'report_3040';
    const isMonthlyAllocations =
      type === ReportType.REPORT_MONTHLY_ALLOCATIONS || type === 'report_monthly_allocations';

    if (is3040) {
      if (!startDate || !endDate) throw new AppError(400, 'startDate and endDate are required for this report type');
    } else if (isMonthlyAllocations) {
      const y = year !== undefined && year !== '' ? Number(year) : NaN;
      const m = month !== undefined && month !== '' ? Number(month) : NaN;
      if (
        !Number.isInteger(y) ||
        !Number.isInteger(m) ||
        y < 1970 ||
        y > 2100 ||
        m < 1 ||
        m > 12
      ) {
        throw new AppError(400, 'year and month are required for monthly allocations (month 1–12)');
      }
    } else {
      throw new AppError(400, 'Unsupported report type');
    }

    await withTransaction(async (transaction) => {
      const report = await ReportService.createReport(
        {
          state_id: Number(state_id),
          name,
          type,
          donee_account_id: donee_account_id ? Number(donee_account_id) : undefined,
          organization_id,
          created_by: userId,
          startDate,
          endDate,
          year: year !== undefined && year !== '' ? Number(year) : undefined,
          month: month !== undefined && month !== '' ? Number(month) : undefined,
        },
        transaction
      );

      sendSuccess(res, report, 201);
    });
  } catch (error) {
    sendError(req, res, error);
  }
};

/**
 * Get report by ID
 * GET /report/:id
 */
export const getReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      sendError(req, res, new AppError(400, 'Invalid report ID'));
      return;
    }

    const report = await ReportService.getReportById(Number(id));
    sendSuccess(res, report);
  } catch (error) {
    sendError(req, res, error);
  }
};

/**
 * Get report PDF file
 * GET /report/state/:stateId/:id/file
 */
export const getReportFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, stateId } = req.params;

    if (!id || Number.isNaN(Number(id))) {
      sendError(req, res, new AppError(400, 'Invalid report ID'));
      return;
    }

    if (!stateId || Number.isNaN(Number(stateId))) {
      sendError(req, res, new AppError(400, 'Invalid state ID'));
      return;
    }

    const report = await ReportService.getReportById(Number(id));
    if (!report) {
      sendError(req, res, new AppError(404, 'Report not found'));
      return;
    }

    if (Number(report.state_id) !== Number(stateId)) {
      sendError(req, res, new AppError(404, 'Report not found for this state'));
      return;
    }

    if (!report.file_path) {
      sendError(req, res, new AppError(404, 'Report file not found'));
      return;
    }

    const exists = await fileExists(report.file_path);
    if (!exists) {
      sendError(req, res, new AppError(404, 'Report file not found'));
      return;
    }

    const mimeType = getFileMimeType(report.file_path);
    const buffer = await readFile(report.file_path);
    res.setHeader('Content-Type', mimeType);
    res.send(buffer);
  } catch (error) {
    sendError(req, res, error);
  }
};

/**
 * Get all reports by type with pagination, sorting, and filtering
 * GET /report/all/:type?page=1&limit=10&stateId=1&sortBy=name&sortOrder=asc&filterKey=name&filterValue=test&operator=contains
 */
export const getAllReportsByType = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, stateId: stateIdParam } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || parseInt(req.query.pageSize as string) || 10;
    const stateId = stateIdParam
      ? Number(stateIdParam)
      : (req.query.stateId ? Number(req.query.stateId) : undefined);
    const sortBy = req.query.sortBy as string | undefined;
    const sortOrder = (req.query.sortOrder as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const filterKey = req.query.filterKey as string | undefined;
    const filterValue = req.query.filterValue as string | undefined;
    const operator = (req.query.operator as string) || 'contains';

    if (!type) {
      sendError(req, res, new AppError(400, 'Report type is required'));
      return;
    }

    const result = await ReportService.getReportsByType(
      type,
      page,
      limit,
      stateId,
      sortBy,
      sortOrder,
      filterKey,
      filterValue,
      operator
    );
    sendSuccess(res, result);
  } catch (error) {
    sendError(req, res, error);
  }
};

/**
 * Get report audit logs
 * GET /report/:id/logs
 */
export const getReportLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || parseInt(req.query.pageSize as string) || 10;

    if (!id || isNaN(Number(id))) {
      sendError(req, res, new AppError(400, 'Invalid report ID'));
      return;
    }

    const result = await ReportService.getReportLogs(Number(id), page, limit);
    sendSuccess(res, result);
  } catch (error) {
    sendError(req, res, error);
  }
};

/**
 * Create/Update 3040 mapping
 * POST /report/mapping/3040
 */
export const upsert3040Mapping = async (req: Request, res: Response): Promise<void> => {
  try {
    const { donee_account_id, organization_id, state_id, section, category } = req.body;
    const userId = req.user?.id;

    // Validation
    if (!donee_account_id || !organization_id || !state_id || !section || !category) {
      sendError(
        req,
        res,
        new AppError(400, 'Missing required fields: donee_account_id, organization_id, state_id, section, category')
      );
      return;
    }

    await withTransaction(async (transaction) => {
      const mapping = await ReportService.upsert3040Mapping(
        {
          donee_account_id: Number(donee_account_id),
          organization_id,
          state_id: Number(state_id),
          section,
          category,
          created_by: userId,
        },
        transaction
      );

      sendSuccess(res, mapping, 201);
    });
  } catch (error) {
    sendError(req, res, error);
  }
};

/**
 * Get 3040 mappings by state with pagination
 * GET /report/mapping/3040/:stateId
 */
export const get3040MappingsByState = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stateId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || parseInt(req.query.pageSize as string) || 10;

    if (!stateId || isNaN(Number(stateId))) {
      sendError(req, res, new AppError(400, 'Invalid state ID'));
      return;
    }

    const result = await ReportService.getMappingsByState(Number(stateId), page, limit);
    sendSuccess(res, result);
  } catch (error) {
    sendError(req, res, error);
  }
};
