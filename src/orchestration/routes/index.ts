import { Application } from 'express';
import envvars from '@/config/envvars';
import authnRoutes from './authn';
import organizationsRoutes from './organizations';
import requestsRoutes from './requests';
import propertiesRoutes from './properties';
import metadataRoutes from './metadata';
import usersRoutes from './users';
import saspRoutes from './sasp.routes';
import qboRoutes from '@/qbo/routes/qbo.routes';
import migrationRoutes from '../../data-migration/routes/data-migration.routes'
import testRoute from './test.routes'
import wantListRoutes from '@/want-list/routes/want-list.routes';
import reportRoutes from '@/reports/routes/report.routes';
import { database } from '@/utils/database';
import { checkDbHealthWithRetry } from '@/utils/healthcheck';
import { getLogger } from '@/utils/logger';

export const setupRoutes = (app: Application): void => {
    const SERVICE_NAME = envvars.app.name;
    const BUILD_IDENTIFIER = envvars.app.build;
    const logger = getLogger('setupRoutes');

    // Health check endpoint for Kubernetes probes
    app.get('/health', async (req, res) => {
        try {
            await checkDbHealthWithRetry(database.sequelize, 5, 100);
            res.status(200).json({ status: 'healthy' });
        } catch (err) {
            logger.error('Healthcheck failed, crashing service', { err });
            res.status(503).json({ status: 'unhealthy', error: typeof err === 'object' && err !== null && 'message' in err ? (err as any).message : String(err) });
            setTimeout(() => process.exit(1), 1000);
        }
    });

    // Service info endpoint
    app.get('/', (req, res) => {
        res.json({ service: `${SERVICE_NAME}`, version: BUILD_IDENTIFIER });
    });

    app.use('/auth', authnRoutes);
    app.use('/organizations', organizationsRoutes);
    app.use('/requests', requestsRoutes);
    app.use('/properties', propertiesRoutes);
    app.use('/metadata', metadataRoutes);
    app.use('/users', usersRoutes);
    app.use('/sasp', saspRoutes);
    app.use('/qbo', qboRoutes);
    app.use('/want-list', wantListRoutes);
    app.use('/report', reportRoutes);
    app.use('/data-migration', migrationRoutes);
    app.use('/test', testRoute);
};
