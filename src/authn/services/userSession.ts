import UserSession from '@/authn/models/UserSession';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@/utils/jwt';
import { Transaction } from 'sequelize';
import { AppError } from '@/utils/response/appError';
import envvars from '@/config/envvars';
import { parseDuration } from '@/utils/parseExpirationPeriod';

const REFRESH_GRACE_PERIOD_MS = 60 * 1000;

const getAccessTokenLifetimeMs = (): number => {
    const { value, unit } = parseDuration(envvars.auth.jwt.accessExpiration);
    const multipliers: Record<string, number> = {
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
        years: 365 * 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit as string];
};

export class UserSessionService {
    /**
     * Finds a user session by the user id.
     * @param userId - The user id to search for.
     * @returns The user session or null if not found.
     */
    static async findUserSessionByUserId(userId: string): Promise<UserSession | null> {
        return await UserSession.findOne({ where: { userId, expiredAt: null } });
    };

    /**
     * Invalidates a user session by the user id and device info.
     * @param userId - The user id to invalidate.
     * @param deviceInfo - The device information to invalidate.
     * @param transaction - The transaction to use for the operation.
     */
    static async invalidateUserSession(userId: string, deviceInfo: string, transaction?: Transaction): Promise<void> {
        await UserSession.update(
            { expiredAt: new Date() },
            { where: { userId, deviceInfo, expiredAt: null }, transaction }
        );
    };

    /**
     * Creates a new session, invalidating the previous one if necessary.
     * @param userId - The user ID.
     * @param deviceInfo - The device information.
     * @param transaction - The transaction (optional).
     * @returns The newly created session.
     */
    static async createUserSession(userId: string, userEmail: string, deviceInfo: string, transaction: Transaction): Promise<{ accessToken: string; refreshToken: string }> {
        await this.invalidateUserSession(userId, deviceInfo, transaction);

        const refreshToken = generateRefreshToken(userId);
        const accessToken = generateAccessToken(userId, { email: userEmail });

        await UserSession.create({ userId, refreshToken, deviceInfo }, { transaction });

        return { accessToken, refreshToken };
    }

    /**
     * Generates a new access token using a valid refresh token.
     *
     * 1. Verifies the refresh token signature & expiration.
     * 2. Ensures the token exists in the `user_sessions` table and is not expired.
     * 3. Generates and returns a brand-new access token.
     *
     * @param refreshToken – JWT refresh token presented by the client.
     * @throws AppError(401) if the token is invalid, expired, or the session record is missing.
     */
    static async refreshUserSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
        // Step-1  Verify token
        const decoded = await verifyRefreshToken(refreshToken);
        
        if (!decoded) {
            throw new AppError(401, 'Unauthenticated', 'Invalid refresh token');
        }

        const userId = decoded.sub as string | undefined;
        if (!userId) {
            throw new AppError(401, 'Unauthenticated', 'Invalid refresh token');
        }

        // Step-2  Ensure an active session exists for this token
        const existingSession = await UserSession.findOne({ where: { userId, refreshToken, expiredAt: null } });
        if (!existingSession) {
            throw new AppError(401, 'Unauthenticated', 'Refresh token is not recognized');
        }

        const refreshWindowEndsAt = existingSession.createdAt.getTime() + getAccessTokenLifetimeMs() + REFRESH_GRACE_PERIOD_MS;
        if (Date.now() >= refreshWindowEndsAt) {
            await existingSession.update({ expiredAt: new Date() });
            throw new AppError(401, 'Unauthenticated', 'Refresh window expired');
        }

        // Step-3  Rotate the session and issue fresh tokens for continued activity.
        const newRefreshToken = generateRefreshToken(userId);
        const accessToken = generateAccessToken(userId, {});
        await existingSession.update({ expiredAt: new Date() });
        await UserSession.create({
            userId,
            refreshToken: newRefreshToken,
            deviceInfo: existingSession.deviceInfo,
        });

        return { accessToken, refreshToken: newRefreshToken, userId };
    }
}
