import { getLogger } from '@/utils/logger';
import QBOToken from '../models/QBOToken.entity';

const logger = getLogger('QBOTokenService');

// QB allows refresh token to be valid for 180 days
const REFRESH_TOKEN_VALIDITY_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
const ACCESS_TOKEN_VALIDITY_MS = 60 * 60 * 1000; // 1 hour (standard OAuth)

export class QBOTokenService {
    /**
     * Save or update QBO token (single record in the system)
     * The realmId is extracted from the token response and stored
     */
    static async saveToken(
        realmId: string,
        tokens: {
            access_token: string;
            refresh_token: string;
            expires_in?: number;
            x_refresh_token_expires_in?: number;
            token_type?: string;
            id_token?: string;
        }
    ): Promise<QBOToken> {
        try {
            const accessTokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

            // We re-authorize every  180 days
            const refreshTokenExpiresAt = new Date(Date.now() + Math.min(
                (tokens.x_refresh_token_expires_in || 15552000) * 1000,
                REFRESH_TOKEN_VALIDITY_MS
            ));

            logger.info(`Saving QBO token`, {
                realmId,
                accessTokenExpiresAt,
                refreshTokenExpiresAt,
            });

            // Always upsert to the first/only record - use realmId as the unique key
            const [token] = await QBOToken.upsert(
                {
                    realmId,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    accessTokenExpiresAt,
                    refreshTokenExpiresAt,
                    tokenType: tokens.token_type || 'bearer',
                    idToken: tokens.id_token || null,
                },
                { returning: true }
            );

            logger.info(`Token saved successfully`);
            return token;
        } catch (error) {
            logger.error(`Failed to save token`, { error });
            throw error;
        }
    }

    /**
     * Retrieve token
     */
    static async getToken(): Promise<QBOToken | null> {
        try {
            const token = await QBOToken.findAll({});

            if (!token) {
                logger.warn(`No token found`);
                return null;
            }

            logger.info(`Token retrieved for}`);
            return token[0];
        } catch (error) {
            logger.error(`Failed to retrieve token`, { error });
            throw error;
        }
    }

    /**
     * Check if access token is expired
     */
    static isAccessTokenExpired(token: QBOToken): boolean {
        const now = new Date();
        const isExpired = token.accessTokenExpiresAt <= now;

        if (isExpired) logger.info(`Access token is expired`);
        return isExpired;
    }

    /**
     * Check if access token is expiring soon (within 5 minutes)
     */
    static isAccessTokenExpiringSoon(token: QBOToken): boolean {
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        return token.accessTokenExpiresAt <= fiveMinutesFromNow;
    }

    /**
     * Check if refresh token is expired
     */
    static isRefreshTokenExpired(token: QBOToken): boolean {
        const now = new Date();
        const isExpired = token.refreshTokenExpiresAt <= now;

        if (isExpired) logger.error(`CRITICAL: Refresh token for realm ${token.realmId} is expired. User must re-authorize.`);

        return isExpired;
    }

    /**
     * Update token after refresh
     */
    static async updateTokenAfterRefresh(
        tokens: {
            access_token: string;
            refresh_token: string;
            expires_in?: number;
            x_refresh_token_expires_in?: number;
        }
    ): Promise<QBOToken> {
        try {
            const existingToken = await this.getToken();
            if (!existingToken) throw new Error(`Cannot refresh token: no existing token found`);

            logger.info(`Refreshing access token`);

            const accessTokenExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
            // Extend refresh token expiry if QB returns a new one
            const refreshTokenExpiresAt = new Date(Date.now() + Math.min(
                (tokens.x_refresh_token_expires_in || 15552000) * 1000,
                REFRESH_TOKEN_VALIDITY_MS
            ));

            const updatedToken = await existingToken.update({
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                accessTokenExpiresAt,
                refreshTokenExpiresAt,
            });

            logger.info(`Access token refreshed successfully`);
            return updatedToken;
        } catch (error) {
            logger.error(`Failed to refresh access token`, { error });
            throw error;
        }
    }

    /**
     * Delete token (revoke) - deletes the single stored token
     */
    static async deleteToken(): Promise<boolean> {
        try {
            logger.info(`Deleting stored token`);
            const deleted = await QBOToken.destroy({ where: {} });

            if (deleted) {
                logger.info(`Token deleted successfully`);
                return true;
            }

            logger.warn(`No token found to delete`);
            return false;
        } catch (error) {
            logger.error(`Failed to delete token`, { error });
            throw error;
        }
    }

    /**
     * Get all tokens (useful for batch operations)
     */
    static async getAllTokens(): Promise<QBOToken[]> {
        try {
            return await QBOToken.findAll();
        } catch (error) {
            logger.error('Failed to retrieve all tokens', { error });
            throw error;
        }
    }

    /**
     * Check if refresh token is expiring soon (within 7 days)
     * Admin should be notified to re-authorize
     */
    static isRefreshTokenExpiringSoon(token: QBOToken): boolean {
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const isExpiringSoon = token.refreshTokenExpiresAt <= sevenDaysFromNow;

        if (isExpiringSoon) {
            logger.warn(`Refresh token for realm ${token.realmId} expires soon: ${token.refreshTokenExpiresAt}`);
        }
        return isExpiringSoon;
    }

    /**
     * Get all tokens that need re-authorization soon (within 7 days)
     */
    static async getTokensNeedingReauth(): Promise<QBOToken[]> {
        try {
            const allTokens = await this.getAllTokens();
            return allTokens.filter(token => this.isRefreshTokenExpiringSoon(token));
        } catch (error) {
            logger.error('Failed to get tokens needing re-auth', { error });
            throw error;
        }
    }
}
