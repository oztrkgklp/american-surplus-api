import { Router } from 'express';
import { authenticate } from '@/orchestration/middleware/authenticate';
import { authorizeSaspReports } from '../middleware/authorizeSaspReports';
import { authorizeAmericanSurplusReports } from '../middleware/authorizeAmericanSurplusReports';
import { UserPermissionsEnum } from '@/enums/userPermissions.enum';
import {
    createReport,
    getReport,
    getReportFile,
    getAllReportsByType,
    getReportLogs,
    upsert3040Mapping,
    get3040MappingsByState,
} from '../controllers/report.controller';

const router = Router();

/**
 * Report Endpoints
 * SASP and American Surplus Admin endpoints
 */

router.post(
    '/state/:stateId/:type/create',
    authenticate,
    authorizeSaspReports([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeAmericanSurplusReports(),
    createReport
);

router.get(
    '/state/:stateId/:id',
    authenticate,
    authorizeSaspReports([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeAmericanSurplusReports(),
    getReport
);

router.get(
    '/state/:stateId/:id/file',
    authenticate,
    authorizeSaspReports([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeAmericanSurplusReports(),
    getReportFile
);

router.get(
    '/state/:stateId/:type/get-all-reports',
    authenticate,
    authorizeSaspReports([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeAmericanSurplusReports(),
    getAllReportsByType
);


/**
 * GET /api/report/:id/logs
 * Get report audit logs - SASP and American Surplus Admin
 */
router.get(
    '/:id/logs',
    authenticate,
    authorizeSaspReports([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeAmericanSurplusReports(),
    getReportLogs
);

/**
 * 3040 Mapping Endpoints
 */

router.post(
    '/mapping/3040',
    authenticate,
    authorizeSaspReports([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeAmericanSurplusReports(),
    upsert3040Mapping
);

router.get(
    '/mapping/3040/:stateId',
    authenticate,
    authorizeSaspReports([UserPermissionsEnum.SASP_MANAGE_ALL_REQUESTS]),
    authorizeAmericanSurplusReports(),
    get3040MappingsByState
);

export default router;
