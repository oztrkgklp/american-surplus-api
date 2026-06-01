import dotenv from "dotenv";

jest.mock("dotenv"); // Prevent dotenv from loading real env vars

describe("Config Defaults", () => {
    beforeEach(() => {
        jest.resetModules(); // Clears require cache so new config loads every test
        process.env = {}; // Reset environment variables
    });

    test("should use default app config values when env variables are missing", () => {
        const config = require("../../src/config/envvars").default;

        expect(config.app.name).toBe("package-name");
        expect(config.app.port).toBe(3000);
        expect(config.app.build).toBe("0.0.0");
        expect(config.app.environment).toBe("development");
    });

    test("should use default JWT config values when env variables are missing", () => {
        const config = require("../../src/config/envvars").default;

        expect(config.auth.jwt.accessSecret).toBe("accessdefault");
        expect(config.auth.jwt.refreshSecret).toBe("refreshdefault");
        expect(config.auth.jwt.accessExpiration).toBe("10m");
        expect(config.auth.jwt.refreshExpiration).toBe("3d");
    });

    test("should use default DB config values when env variables are missing", () => {
        const config = require("../../src/config/envvars").default;

        expect(config.db.host).toBe("localhost");
        expect(config.db.user).toBe("root");
        expect(config.db.password).toBe("");
        expect(config.db.database).toBe("");
        expect(config.db.port).toBe(3306);
        expect(config.db.connectionLimit).toBe(10);
        expect(config.db.ssl.enabled).toBe(false);
        expect(config.db.ssl.caPath).toBe("");
    });
});
