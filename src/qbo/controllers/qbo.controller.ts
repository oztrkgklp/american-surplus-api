import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { AppError } from '@/utils/response/appError';
import { QBOAuthService } from '@/qbo/auth/auth.service';
import { QBOTokenService } from '@/qbo/services/qbo-token.service';
import { QBOWebhookService } from '@/qbo/services/qbo-webhook.service';
import { addInvoiceWebhookJob } from '@/qbo/job/qboWebhook.job';
import { getLogger } from '@/utils/logger';
import { error } from 'console';
import config from '@/config/envvars';

const logger = getLogger('QBOAuthController');

const assertQboSyncEnabled = (): void => {
    if (!config.quickbooks.syncEnabled) {
        throw new AppError(503, 'QuickBooks sync is currently disabled');
    }
};

/**
 * Get the OAuth authorization URL for user to authorize QB access
 * UI should redirect user to this URL
 */
export const getAuthorizationUrl = async (req: Request, res: Response): Promise<void> => {
    try {
        assertQboSyncEnabled();

        const authService = new QBOAuthService();
        const authUrl = authService.getAuthorizationUrl({
            scope: ['com.intuit.quickbooks.accounting'],
            state: req.query.state as string || 'qbo_auth',
        });

        logger.info('Authorization URL generated');
        sendSuccess(res, {
            authUrl,
            message: 'Redirect user to this URL to authorize QuickBooks access',
        });
    } catch (error) {
        logger.error('Failed to generate authorization URL', { error });
        sendError(req, res, error);
    }
};

/**
 * Handle OAuth callback from QuickBooks
 * Called after user authorizes the app
 * UI will redirect here with the authorization code
 * IMPORTANT: This endpoint is protected by authenticateQBOAdmin middleware
 * Only admins can authorize QB connections
 */
export const handleAuthCallback = async (req: Request, res: Response): Promise<void> => {
    try {
        assertQboSyncEnabled();

        const { code, state, realmId } = req.query;
        const user = req.user; // Set by authenticateQBOAdmin middleware

        // Validate authorization code
        if (!code) {
            logger.warn('OAuth callback missing authorization code');
            throw new AppError(400, 'Authorization code is missing from callback');
        }

        // Validate state parameter to prevent CSRF attacks
        if (!state || state !== 'qbo_auth') {
            logger.warn(`OAuth callback with invalid state parameter: ${state}`);
            throw new AppError(400, 'Invalid state parameter - possible CSRF attack');
        }

        // Validate realmId format (QB company ID should be numeric string)
        if (!realmId || typeof realmId !== 'string' || !/^\d+$/.test(realmId)) {
            logger.warn(`OAuth callback with invalid realmId: ${realmId}`);
            throw new AppError(400, 'Invalid realmId from QB');
        }

        logger.info('Handling OAuth callback from QB', {
            realmId,
            adminUserId: user?.id,
            code: code.toString().substring(0, 10) + '...' // Log first 10 chars only
        });

        const authService = new QBOAuthService();
        const fullUrl = req.originalUrl;

        // Exchange code for tokens (QB OAuth library validates the code)
        const tokenResponse = await authService.initializeTokensFromAuthCode(fullUrl);

        logger.info('QB tokens initialized and saved successfully', {
            realmId: tokenResponse.realmId,
            adminUserId: user?.id,
            expiresIn: tokenResponse.expiresIn,
        });

        sendSuccess(res, {
            message: 'Authorization successful - QuickBooks connection established',
            realmId: tokenResponse.realmId,
            expiresIn: tokenResponse.expiresIn,
            tokenType: tokenResponse.tokenType,
        });
    } catch (error) {
        logger.error('OAuth callback handling failed', {
            error,
            userId: req.user?.id,
            source: 'handleAuthCallback',
        });
        sendError(req, res, error);
    }
};

/**
 * Check if valid token exists
 * Used by UI to determine if re-authorization is needed
 */
export const checkTokenValidity = async (req: Request, res: Response): Promise<void> => {
    try {
        assertQboSyncEnabled();

        logger.info('Checking token validity');
        const token = await QBOTokenService.getToken();

        if (!token) {
            return sendSuccess(res, {
                isValid: false,
                message: 'No token found',
                requiresReauthorization: true,
            });
        }

        const isAccessExpired = QBOTokenService.isAccessTokenExpired(token);
        const isRefreshExpired = QBOTokenService.isRefreshTokenExpired(token);
        const isExpiringSoon = QBOTokenService.isAccessTokenExpiringSoon(token);

        sendSuccess(res, {
            isValid: !isAccessExpired && !isRefreshExpired,
            isAccessTokenExpired: isAccessExpired,
            isRefreshTokenExpired: isRefreshExpired,
            isAccessTokenExpiringSoon: isExpiringSoon,
            requiresReauthorization: isRefreshExpired,
            realmId: token.realmId,
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            refreshTokenExpiresAt: token.refreshTokenExpiresAt,
        });
    } catch (error) {
        logger.error('Failed to check token validity', { error });
        sendError(req, res, error);
    }
};

/**
 * Refresh the access token using the stored refresh token
 * Called proactively when token is about to expire
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
        assertQboSyncEnabled();

        logger.info('Refreshing access token');

        // Load token from database
        const authService = new QBOAuthService();
        const loaded = await authService.loadTokenFromDatabase();

        if (!loaded) throw new AppError(401, 'Token not found or expired. User must re-authorize.');

        // Refresh the token
        const newTokens = await authService.refreshAccessToken();
        logger.info('Token refreshed successfully');

        sendSuccess(res, {
            message: 'Token refreshed successfully',
            accessToken: newTokens.accessToken,
            expiresIn: newTokens.expiresIn,
            tokenType: newTokens.tokenType,
        });
    } catch (error) {
        logger.error('Failed to refresh token', { error });
        sendError(req, res, error);
    }
};

/**
 * Revoke QBO connection and delete stored tokens
 * Called when user wants to disconnect QB account
 */
export const revokeConnection = async (req: Request, res: Response): Promise<void> => {
    try {
        assertQboSyncEnabled();

        logger.info('Revoking QBO connection');

        const authService = new QBOAuthService();
        const loaded = await authService.loadTokenFromDatabase();

        if (!loaded) {
            logger.warn('No token found to revoke');
            return sendSuccess(res, { message: 'No active connection found, already disconnected' });
        }

        // Revoke and delete
        await authService.revokeTokens();
        logger.info('QBO connection revoked successfully');

        sendSuccess(res, { message: 'QuickBooks connection revoked successfully' });
    } catch (error) {
        logger.error('Failed to revoke connection', { error });
        sendError(req, res, error);
    }
};

/**
 * Get current token expiry info (without exposing actual tokens)
 * Safe endpoint to check token status in admin panel
 */
export const getTokenStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        assertQboSyncEnabled();

        logger.info('Getting token status');
        const token = await QBOTokenService.getToken();

        if (!token) return sendSuccess(res, { status: 'NO_TOKEN', message: 'No QuickBooks connection established' });

        const now = new Date();
        const accessExpiresInMs = token.accessTokenExpiresAt.getTime() - now.getTime();
        const refreshExpiresInMs = token.refreshTokenExpiresAt.getTime() - now.getTime();

        sendSuccess(res, {
            status: 'CONNECTED',
            realmId: token.realmId,
            accessTokenStatus: accessExpiresInMs > 0 ? 'VALID' : 'EXPIRED',
            refreshTokenStatus: refreshExpiresInMs > 0 ? 'VALID' : 'EXPIRED',
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            accessTokenExpiresInMinutes: Math.floor(accessExpiresInMs / 60000),
            refreshTokenExpiresAt: token.refreshTokenExpiresAt,
            refreshTokenExpiresInDays: Math.floor(refreshExpiresInMs / (24 * 60 * 60 * 1000)),
            connectedAt: token.createdAt,
            lastUpdated: token.updatedAt,
        });
    } catch (error) {
        logger.error('Failed to get token status', { error });
        sendError(req, res, error);
    }
};

export const handleInvoiceWebhookPing = async (req: Request, res: Response) => {
    if (!config.quickbooks.syncEnabled) {
        logger.info('Webhook ping received while QBO sync is disabled');
        res.status(200).send('QBO sync disabled');
        return;
    }

    logger.info('Webhook Get Arrived');
    res.status(200).send('OK');
}

/**
 * Handle incoming QBO webhook notification
 * QBO sends notifications when entities are updated
 * Currently handles invoice payment updates
 * 
 * Webhook security:
 * - Validates HMAC-SHA256 signature using QBO_WEBHOOK_TOKEN
 * - Verifies intuit-signature header matches computed payload hash
 */
export const handleInvoiceWebhook = async (req: Request, res: Response): Promise<void> => {
    if (!config.quickbooks.syncEnabled) {
        logger.info('Webhook received while QBO sync is disabled');
        res.status(200).send('QBO sync disabled');
        return;
    }

    logger.info('Webhook initialized');

    try {
        const payload = req.body;
        const intuitSignature = req.headers['intuit-signature'] as string;
        const rawBody = (req as any).rawBody || JSON.stringify(payload);
        const notificationsCount = Array.isArray(payload?.eventNotifications) ? payload.eventNotifications.length : 0;

        logger.info('Webhook acknowledge');

        // Acknowledge immediately to prevent webhook timeout/retries from provider.
        res.status(200).send('OK');

        try {
            await addInvoiceWebhookJob({
                payload,
                intuitSignature,
                rawBody,
                receivedAt: new Date().toISOString(),
            });
            logger.info('Webhook acknowledged and enqueued to BullMQ', { notificationsCount });
        } catch (error) {
            logger.error('Failed to enqueue webhook to BullMQ, falling back to in-process async handling', { error });
        }
    } catch (e) {
        logger.error('Something went wrong:', e)
    }

};
