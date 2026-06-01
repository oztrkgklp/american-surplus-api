import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageThreshold: {
        global: {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80,
        },
    },
    moduleFileExtensions: ['ts', 'js'],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
    },
    roots: ["<rootDir>/tests", "<rootDir>/src"],
    testMatch: [
        '**/tests/**/*.test.ts',
        '**/src/**/*.test.ts'
    ],
    clearMocks: true,
};

export default config;
