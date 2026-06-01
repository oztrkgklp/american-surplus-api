import { Sequelize, Transaction, QueryTypes, Dialect } from 'sequelize';
import fs from 'fs';
import { getLogger } from '@/utils/logger';
import envvars from '@/config/envvars';

const logger = getLogger('Database');

class DatabaseUtility {
    private sequelizeInstance: Sequelize;

    constructor() {
        const dbConfig = this.getDatabaseConfig();
        this.sequelizeInstance = new Sequelize(dbConfig);
    }

    private getDatabaseConfig() {
        const dbVars = envvars.db;
        const useSSL = dbVars.ssl.enabled === true;
        const caPath = dbVars.ssl.caPath;

        let sslOptions = undefined;
        if (useSSL && caPath && fs.existsSync(caPath)) {
            logger.info(`SSL is enabled with CA Path: ${caPath}`);
            sslOptions = {
                require: true,
                rejectUnauthorized: true,
                ca: [fs.readFileSync(caPath, 'utf8')],
            };
        } else {
            logger.warn("SSL is disabled due to missing environment variables or CA file.");
        }

        return {
            dialect: 'mysql' as Dialect,
            host: dbVars.host,
            username: dbVars.user,
            password: dbVars.password,
            database: dbVars.database,
            port: dbVars.port,
            pool: {
                max: dbVars.connectionLimit,
                min: 0,
                acquire: 30000,
                idle: 10000,
            },
            dialectOptions: sslOptions ? { ssl: sslOptions } : {},  // Ensure dialectOptions is set
            logging: (msg: string, executionTime?: number) => {
                if (typeof executionTime === "number") {
                    logger.debug("Executed in " + executionTime + "ms: " + msg);
                } else {
                    logger.debug(msg);
                }
            },
            benchmark: true,
        };
    }

    get sequelize(): Sequelize {
        return this.sequelizeInstance;
    }

    async connect(): Promise<void> {
        try {
            await this.sequelize.authenticate();
            logger.info("Connected to the database successfully.");
        } catch (error) {
            logger.error("Error connecting to the database:", error);
            throw error;
        }
    }

    async executeQuery(query: string, replacements: Array<any> = []): Promise<any> {
        const start = Date.now();

        try {
            const [result] = await this.sequelize.query(query, {
                replacements,
                type: QueryTypes.SELECT,
            });

            const duration = Date.now() - start;
            logger.info(`Query executed in ${duration}ms: ${query}`);

            return result;  // Ensure only the first element is returned
        } catch (error) {
            logger.error("Error executing query:", error);
            throw error;
        }
    }

    async transactionalOperation(operation: (transaction: Transaction) => Promise<any>): Promise<any> {
        const transaction = await this.sequelize.transaction();
        try {
            const result = await operation(transaction);
            await transaction.commit();
            logger.info("Transaction committed successfully.");
            return result;
        } catch (error) {
            await transaction.rollback();
            logger.error("Transaction rolled back due to error:", error);
            throw error;
        }
    }
}

export const database = new DatabaseUtility();

export const syncDatabaseForLocalDevelopment = async (): Promise<void> => {
    if (envvars.app.environment !== 'local_development') {
        return;
    }

    try {
        await database.sequelize.sync({
            force: false,
            alter: true,
        });
        logger.info("Database synchronized successfully.");
    } catch (error) {
        logger.error("Error synchronizing database:", error);
        throw error;
    }
};