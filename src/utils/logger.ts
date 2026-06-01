import envvars from '@/config/envvars';
import * as log4js from 'log4js';
import path from 'path';
import fs from 'fs';

// Ensure the logs directory exists
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const serviceName = envvars.app.name;

// Configure Log4js
log4js.configure({
    appenders: {
        console: { type: 'console' },
        file: { type: 'file', filename: path.join(logDir, `${serviceName}.log`) },
    },
    categories: {
        default: { appenders: ['console', 'file'], level: 'info' },
    },
});

/**
 * Creates a logger instance for a specific module.
 * @param moduleName - The name of the module using the logger.
 * @returns A logger instance with module-specific tagging.
 */
export const getLogger = (moduleName: string) => {
    const logger = log4js.getLogger(moduleName);
    logger.addContext('module', moduleName); // Adds module name to logs
    return logger;
};
