import { Sequelize, Transaction, QueryTypes } from 'sequelize';
import fs from 'fs';
import { database } from '../../src/utils/database';
import { getLogger } from '../../src/utils/logger';

// Mock Dependencies
jest.mock('sequelize');
jest.mock('fs', () => ({
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => "mocked-ca-content"),
}));
jest.mock('../../src/utils/logger', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
    }),
}));

describe("DatabaseUtility", () => {
    let sequelizeMock: jest.Mocked<Sequelize>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules(); // Clears Jest module cache before re-importing
        sequelizeMock = database.sequelize as jest.Mocked<Sequelize>;
    });

    // Test Database Connection
    describe("testConnection", () => {
        test("should log success message on successful connection", async () => {
            sequelizeMock.authenticate.mockResolvedValue(undefined);
            const logger = getLogger("Database");

            await expect(database.testConnection()).resolves.not.toThrow();
            expect(logger.info).toHaveBeenCalledWith("Connected to the database successfully.");
        });

        test("should log error and throw if connection fails", async () => {
            const error = new Error("Connection failed");
            sequelizeMock.authenticate.mockRejectedValue(error);
            const logger = getLogger("Database");

            await expect(database.testConnection()).rejects.toThrow(error);
            expect(logger.error).toHaveBeenCalledWith("Error connecting to the database:", error);
        });
    });

    // Test Query Execution
    describe("executeQuery", () => {
        const testQuery = "SELECT * FROM users WHERE id = ?";
        const testReplacements = [1];
        const mockResult = [{ id: 1, name: "John Doe" }];

        test("should execute query and return result", async () => {
            sequelizeMock.query.mockResolvedValue([mockResult, undefined]); // Ensure query returns tuple
            const logger = getLogger("Database");

            const result = await database.executeQuery(testQuery, testReplacements);

            expect(sequelizeMock.query).toHaveBeenCalledWith(testQuery, {
                replacements: testReplacements,
                type: QueryTypes.SELECT,
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Query executed in"));
            expect(result).toEqual(mockResult);
        });

        test("should log and throw an error if query execution fails", async () => {
            const error = new Error("Query failed");
            sequelizeMock.query.mockRejectedValue(error);
            const logger = getLogger("Database");

            await expect(database.executeQuery(testQuery, testReplacements)).rejects.toThrow(error);
            expect(logger.error).toHaveBeenCalledWith("Error executing query:", error);
        });
    });

    // Test Transactions
    describe("transactionalOperation", () => {
        let transactionMock: jest.Mocked<Transaction>;
        const mockOperation = jest.fn().mockResolvedValue("Operation Success");

        beforeEach(() => {
            transactionMock = {
                commit: jest.fn(),
                rollback: jest.fn(),
            } as any;
            sequelizeMock.transaction.mockResolvedValue(transactionMock);
        });

        test("should commit transaction if operation succeeds", async () => {
            const logger = getLogger("Database");

            const result = await database.transactionalOperation(mockOperation);

            expect(mockOperation).toHaveBeenCalledWith(transactionMock);
            expect(transactionMock.commit).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith("Transaction committed successfully.");
            expect(result).toBe("Operation Success");
        });

        test("should rollback transaction if operation fails", async () => {
            const error = new Error("Transaction failed");
            mockOperation.mockRejectedValue(error);
            const logger = getLogger("Database");

            await expect(database.transactionalOperation(mockOperation)).rejects.toThrow(error);
            expect(transactionMock.rollback).toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalledWith("Transaction rolled back due to error:", error);
        });
    });

    // Test SSL Configuration
    describe("SSL Configuration", () => {
        beforeEach(() => {
            jest.resetModules();
        });

        test("should enable SSL if env variables are set", () => {
            process.env.DB_USE_SSL = "true";  // Ensure this is recognized as boolean
            process.env.DB_SSL_CA_PATH = "/path/to/ca.pem";

            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue("mocked-ca-content");

            let dbConfig: any;
            jest.isolateModules(() => {
                const { database } = require("../../src/utils/database");
                dbConfig = database["getDatabaseConfig"]();
            });

            expect(dbConfig.dialectOptions.ssl).toEqual({
                require: true,
                rejectUnauthorized: true,
                ca: ["mocked-ca-content"],
            });
        });

        test("should disable SSL if env variables are not set", () => {
            process.env.DB_USE_SSL = "false";

            const dbConfig = database["getDatabaseConfig"]();

            expect(dbConfig.dialectOptions).toEqual({});
        });
    });
});
