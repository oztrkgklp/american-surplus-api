import OAuthClient from 'intuit-oauth';
import config from '../../config/envvars';
import { getLogger } from '@/utils/logger';
import { QBOTokenService } from '../services/qbo-token.service';

const logger = getLogger('QBOAuthService');

/**
 * QuickBooks Online Authentication Service
 * Handles OAuth flow, token management, and authentication-related operations
 */
export class QBOAuthService {
    private oauthClient: OAuthClient;
    private realmId: string | null = null;

    constructor(realmId?: string) {
        this.oauthClient = new OAuthClient({
            clientId: config.quickbooks.clientId as string,
            clientSecret: config.quickbooks.clientSecret as string,
            environment: config.quickbooks.environment,
            redirectUri: config.quickbooks.redirectUri || 'http://localhost:5173/qbo-redirect',
            logging: true,
        });
        this.realmId = realmId || null;
        logger.info('QBO auth service initialized', {
            environment: config.quickbooks.environment,
            hasRealmId: Boolean(this.realmId),
        });
    }

    /**
     * Initialize tokens from OAuth callback URL
     * Call this after user authorizes the app
     */
    async initializeTokensFromAuthCode(authorizationUrl: string): Promise<any> {
        try {
            logger.info('Exchanging authorization code for tokens', {
                hasAuthorizationUrl: Boolean(authorizationUrl),
                authorizationUrlLength: authorizationUrl?.length || 0,
            });
            const authResponse = await this.oauthClient.createToken(authorizationUrl);
            const token = authResponse.getToken();

            this.oauthClient.setToken(token);

            // Extract realmId from the token (QB includes this in the response)
            const realmId = (token as any).realmId || this.realmId;
            if (!realmId) {
                throw new Error('Realm ID not found in token response');
            }

            this.realmId = realmId;

            // Check if token record exists in database
            const existingToken = await QBOTokenService.getToken();
            if (existingToken) {
                logger.info('Existing token found while initializing auth tokens', {
                    existingRealmId: existingToken.realmId,
                    incomingRealmId: realmId,
                });
                // Token record exists, check if realmId matches
                if (existingToken.realmId !== realmId) {
                    throw new Error(`Realm ID mismatch. Expected realm: ${existingToken.realmId}, but received: ${realmId}`);
                }
            }

            // Save token to database for persistence
            await QBOTokenService.saveToken(realmId, {
                access_token: token.access_token || '',
                refresh_token: token.refresh_token || '',
                expires_in: token.expires_in || 3600,
                x_refresh_token_expires_in: token.x_refresh_token_expires_in || 15552000,
                token_type: token.token_type || 'bearer',
                id_token: token.id_token || '',
            });

            logger.info('Tokens initialized and saved to database', {
                realmId,
                expiresIn: token.expires_in,
                refreshExpiresIn: token.x_refresh_token_expires_in,
                tokenType: token.token_type,
            });
            return {
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                expiresIn: token.expires_in,
                tokenType: token.token_type,
                idToken: token.id_token,
                realmId,
            };
        } catch (error) {
            logger.error('Failed to initialize tokens from auth code', { error });
            throw new Error(`OAuth token exchange failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Set token directly and save to database
     * Useful for restoring tokens on app startup
     */
    async setStoredToken(realmId: string, token: { access_token: string; refresh_token: string;[key: string]: any }): Promise<void> {
        try {
            this.realmId = realmId;
            logger.info('Setting stored token in auth service', {
                realmId,
                hasAccessToken: Boolean(token?.access_token),
                hasRefreshToken: Boolean(token?.refresh_token),
            });

            const tokenObj = {
                token_type: 'bearer',
                access_token: token.access_token || '',
                refresh_token: token.refresh_token || '',
                expires_in: token.expires_in || 3600,
                x_refresh_token_expires_in: token.x_refresh_token_expires_in || 15552000,
            };

            this.oauthClient.setToken(tokenObj);

            // Save/update in database
            await QBOTokenService.saveToken(realmId, {
                access_token: token.access_token || '',
                refresh_token: token.refresh_token || '',
                expires_in: token.expires_in || 3600,
                x_refresh_token_expires_in: token.x_refresh_token_expires_in || 15552000,
                token_type: 'bearer',
            });

            logger.info(`Token set and saved for realm: ${realmId}`, {
                expiresIn: token.expires_in || 3600,
                refreshExpiresIn: token.x_refresh_token_expires_in || 15552000,
            });
        } catch (error) {
            logger.error(`Failed to set token for realm: ${realmId}`, { error });
            throw error;
        }
    }

    /**
     * Load token from database and set it in oauthClient
     */
    async loadTokenFromDatabase(): Promise<boolean> {
        try {
            const dbToken = await QBOTokenService.getToken();

            if (!dbToken) {
                logger.warn(`No token found in database`);
                return false;
            }
            logger.info('Token loaded from database, checking expiration state', {
                realmId: dbToken.realmId,
                accessTokenExpiresAt: dbToken.accessTokenExpiresAt,
                refreshTokenExpiresAt: dbToken.refreshTokenExpiresAt,
            });

            // Check if refresh token is expired
            if (QBOTokenService.isRefreshTokenExpired(dbToken)) {
                logger.error(`Refresh token expired. User must re-authorize.`);
                return false;
            }

            // Set in oauth client
            this.oauthClient.setToken({
                token_type: dbToken.tokenType,
                access_token: dbToken.accessToken,
                refresh_token: dbToken.refreshToken,
                expires_in: Math.floor((dbToken.accessTokenExpiresAt.getTime() - Date.now()) / 1000),
                x_refresh_token_expires_in: Math.floor((dbToken.refreshTokenExpiresAt.getTime() - Date.now()) / 1000),
            });

            // Set realmId from the retrieved token
            this.realmId = dbToken.realmId;
            logger.info(`Token loaded from database for realm: ${dbToken.realmId}`);
            return true;
        } catch (error) {
            logger.error(`Failed to load token from database`, { error });
            throw error;
        }
    }

    /**
     * Get current token (from oauthClient memory)
     */
    getCurrentToken(): any {
        return this.oauthClient.getToken();
    }

    /**
     * Ensure token is valid and refresh if needed
     * Checks both in-memory and database state
     * If refresh token is expired, throws error requiring manual re-authorization
     */
    async ensureValidToken(): Promise<any> {
        try {
            logger.info('Ensuring valid QBO token', { realmId: this.realmId });
            if (this.oauthClient.isAccessTokenValid()) {
                logger.info(`Access token is valid for realm: ${this.realmId}`);
                return this.getCurrentToken();
            }

            // Access token is expired, check if we can refresh
            const storedToken = await QBOTokenService.getToken();
            if (!storedToken) throw new Error(`No stored token found. Manual re-authorization required.`);
            logger.info('Stored token found while ensuring valid token', {
                realmId: storedToken.realmId,
                accessTokenExpiresAt: storedToken.accessTokenExpiresAt,
                refreshTokenExpiresAt: storedToken.refreshTokenExpiresAt,
            });

            // Check if refresh token is expired (requires manual re-auth every ~180 days)
            if (QBOTokenService.isRefreshTokenExpired(storedToken)) {
                throw new Error(`Refresh token expired for realm ${this.realmId}. Manual re-authorization required (admin must click authorization button).`);
            }

            // Refresh token is valid, refresh the access token
            logger.info(`Access token expired, refreshing using valid refresh token...`);

            // Set token in memory from database
            const tokenObj = {
                token_type: storedToken.tokenType,
                access_token: storedToken.accessToken,
                refresh_token: storedToken.refreshToken,
                expires_in: Math.floor((storedToken.accessTokenExpiresAt.getTime() - Date.now()) / 1000),
                x_refresh_token_expires_in: Math.floor((storedToken.refreshTokenExpiresAt.getTime() - Date.now()) / 1000),
            };

            this.oauthClient.setToken(tokenObj);
            this.realmId = storedToken.realmId;
            logger.info('Refreshing access token using token loaded from database', {
                realmId: this.realmId,
            });
            return await this.refreshAccessToken();
        } catch (error) {
            logger.error('Failed to ensure valid token', { error });
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     * Updates both in-memory and database records
     */
    async refreshAccessToken(): Promise<any> {
        try {
            logger.info(`Refreshing access token`, { realmId: this.realmId });
            const authResponse = await this.oauthClient.refresh();
            const token = authResponse.getToken();

            // Update database with new token
            await QBOTokenService.updateTokenAfterRefresh({
                access_token: token.access_token || '',
                refresh_token: token.refresh_token || '',
                expires_in: token.expires_in || 3600,
                x_refresh_token_expires_in: token.x_refresh_token_expires_in || 15552000,
            });

            logger.info(`Access token refreshed successfully`, {
                realmId: this.realmId,
                expiresIn: token.expires_in,
                refreshExpiresIn: token.x_refresh_token_expires_in,
                tokenType: token.token_type,
            });
            return {
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                expiresIn: token.expires_in,
                tokenType: token.token_type,
            };
        } catch (error) {
            logger.error(`Failed to refresh access token`, { error });
            throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get authorization URL for OAuth flow
     */
    getAuthorizationUrl(options: { scope?: string[]; state?: string }): string {
        const resolvedOptions = {
            scope: options.scope || [OAuthClient.scopes.Accounting],
            state: options.state || 'qbo_auth'
        };
        logger.info('Generating OAuth authorization URL', {
            state: resolvedOptions.state,
            scopeCount: resolvedOptions.scope.length,
        });
        return this.oauthClient.authorizeUri(resolvedOptions);
    }

    /**
     * Check if access token is valid
     */
    isAccessTokenValid(): boolean {
        return this.oauthClient.isAccessTokenValid();
    }

    /**
     * Revoke tokens and delete from database
     */
    async revokeTokens(): Promise<void> {
        try {
            logger.info(`Revoking tokens`, { realmId: this.realmId });

            // Revoke with OAuth provider
            await this.oauthClient.revoke();

            // Delete from database
            await QBOTokenService.deleteToken();

            logger.info(`Tokens revoked and deleted`, { realmId: this.realmId });
        } catch (error) {
            logger.error(`Failed to revoke tokens`, { error });
            throw new Error(`Token revocation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get OAuth client instance
     */
    getOAuthClient(): OAuthClient {
        return this.oauthClient;
    }

    /**
     * Get current realm ID
     */
    getRealmId(): string | null {
        return this.realmId;
    }
}
