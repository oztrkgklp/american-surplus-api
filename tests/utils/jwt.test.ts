import jwt from 'jsonwebtoken';
import {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken
} from '../../src/utils/jwt';
import { AppError } from '../../src/utils/response/appError';
import envvars from '../../src/config/envvars';

// Mocking JWT methods.
jest.mock('jsonwebtoken');

jest.mock('../../src/config/envvars', () => ({
    auth: {
        jwt: {
            accessSecret: 'accessSecret',
            refreshSecret: 'refreshSecret',
            accessExpiration: '1h',
            refreshExpiration: '7d',
        },
    },
}));

describe("JWT Utility", () => {
    const userId = '123';
    const payload = { email: 'ozturkgokalp000@gmail.com' };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("generateAccessToken", () => {
        test("should generate an access token with correct payload", () => {
            // Arrange
            const expectedToken = 'mockAccessToken';
            (jwt.sign as jest.Mock).mockReturnValue(expectedToken);

            // Act
            const token = generateAccessToken(userId, payload);

            // Assert
            expect(jwt.sign).toHaveBeenCalledWith(
                { ...payload, sub: userId },
                'accessSecret',
                { expiresIn: '1h' }
            );
            expect(token).toBe(expectedToken);
        });
    });

    describe("generateRefreshToken", () => {
        test("should generate a refresh token", () => {
            // Arrange
            const expectedToken = 'mockRefreshToken';
            (jwt.sign as jest.Mock).mockReturnValue(expectedToken);

            // Act
            const token = generateRefreshToken(userId);

            // Assert
            expect(jwt.sign).toHaveBeenCalledWith(
                { sub: userId },
                'refreshSecret',
                { expiresIn: '7d' }
            );
            expect(token).toBe(expectedToken);
        });
    });

    describe("verifyAccessToken", () => {
        test("should verify a valid access token", async () => {
            // Arrange
            const token = 'validAccessToken';
            const decoded = { sub: userId };
            (jwt.verify as jest.Mock).mockImplementation((token, secret, callback) => callback(null, decoded));

            // Act
            const result = await verifyAccessToken(token);

            // Assert
            expect(jwt.verify).toHaveBeenCalledWith(token, 'accessSecret', expect.any(Function));
            expect(result).toEqual(decoded);
        });

        test("should throw AppError for an expired token", async () => {
            // Arrange
            const token = 'expiredAccessToken';
            (jwt.verify as jest.Mock).mockImplementation((token, secret, callback) => callback({ name: 'TokenExpiredError' }, null));

            // Act & Assert
            await expect(verifyAccessToken(token)).rejects.toThrow(new AppError(401, 'TokenExpired'));
        });

        test("should throw AppError for an invalid token", async () => {
            // Arrange
            const token = 'invalidAccessToken';
            (jwt.verify as jest.Mock).mockImplementation((token, secret, callback) => callback({ name: 'JsonWebTokenError' }, null));

            // Act & Assert
            await expect(verifyAccessToken(token)).rejects.toThrow(new AppError(401, 'InvalidToken'));
        });

        test("should throw AppError if token is missing", async () => {
            // Act & Assert
            await expect(verifyAccessToken(undefined as any)).rejects.toThrow(new AppError(401, 'Access token is missing'));
        });
    });

    describe("verifyRefreshToken", () => {
        test("should verify a valid refresh token", async () => {
            // Arrange
            const token = 'validRefreshToken';
            const decoded = { sub: userId };
            (jwt.verify as jest.Mock).mockImplementation((token, secret, callback) => callback(null, decoded));

            // Act
            const result = await verifyRefreshToken(token);

            // Assert
            expect(jwt.verify).toHaveBeenCalledWith(token, 'refreshSecret', expect.any(Function));
            expect(result).toEqual(decoded);
        });

        test("should throw AppError for an expired refresh token", async () => {
            // Arrange
            const token = 'expiredRefreshToken';
            (jwt.verify as jest.Mock).mockImplementation((token, secret, callback) => callback({ name: 'TokenExpiredError' }, null));

            // Act & Assert
            await expect(verifyRefreshToken(token)).rejects.toThrow(new AppError(401, 'TokenExpired'));
        });

        test("should throw AppError for an invalid refresh token", async () => {
            // Arrange
            const token = 'invalidRefreshToken';
            (jwt.verify as jest.Mock).mockImplementation((token, secret, callback) => callback({ name: 'JsonWebTokenError' }, null));

            // Act & Assert
            await expect(verifyRefreshToken(token)).rejects.toThrow(new AppError(401, 'InvalidToken'));
        });

        test("should throw AppError if refresh token is missing", async () => {
            // Act & Assert
            await expect(verifyRefreshToken(undefined as any)).rejects.toThrow(new AppError(401, 'Access token is missing'));
        });
    });
});
