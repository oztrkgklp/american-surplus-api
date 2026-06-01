import { getLogger } from './logger';
const logger = getLogger('HealthCheckUtils');

export const checkDbHealthWithRetry = async (db: any, maxRetries = 5, baseDelay = 100) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Use a simple query to check DB connectivity
            await db.query('SELECT 1');
            return;
        } catch (err) {
            logger.warn(`DB healthcheck attempt ${attempt} failed`, { err });
            if (attempt === maxRetries) throw err;
            await new Promise(res => setTimeout(res, baseDelay * Math.pow(2, attempt)));
        }
    }
}
