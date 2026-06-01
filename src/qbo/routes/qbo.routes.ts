import { Router, json } from 'express';
import {
    getAuthorizationUrl,
    handleAuthCallback,
    checkTokenValidity,
    refreshToken,
    revokeConnection,
    getTokenStatus,
    handleInvoiceWebhook,
    handleInvoiceWebhookPing,
} from '@/qbo/controllers/qbo.controller';
import { authenticateQBOAdmin } from '@/orchestration/middleware/authenticateQBOAdmin';
import { captureRawBody } from '@/qbo/middleware/captureRawBody.middleware';

const router = Router();

/**
 * All QBO endpoints require admin organization authentication
 */

/**
 * GET /qbo/auth-url
 * Get the OAuth authorization URL for user
 * UI should redirect user to returned URL
 * Protected: Admin only
 */
router.get('/auth-url', authenticateQBOAdmin, getAuthorizationUrl);

/**
 * GET /qbo/auth-callback
 * Handle OAuth callback from QuickBooks
 * QB redirects here after user authorizes
 * Protected: Admin only
 * Security: Only admins can authorize new QB connections
 */
router.get('/auth-callback', authenticateQBOAdmin, handleAuthCallback);

/**
 * GET /qbo/token-validity?realmId=<realmId>
 * Check if stored token exists and is valid
 * UI can use this to determine if re-authorization needed
 * Protected: Admin only
 */
router.get('/token-validity', authenticateQBOAdmin, checkTokenValidity);

/**
 * POST /qbo/refresh-token
 * Refresh access token using stored refresh token
 * Body: { realmId: string }
 * Protected: Admin only
 */
router.post('/refresh-token', authenticateQBOAdmin, refreshToken);

/**
 * POST /qbo/revoke
 * Revoke QB connection and delete stored tokens
 * Body: { realmId: string }
 * Protected: Admin only
 */
router.post('/revoke', authenticateQBOAdmin, revokeConnection);

/**
 * GET /qbo/token-status?realmId=<realmId>
 * Get detailed token status (admin/monitoring)
 * Returns expiry times without exposing actual tokens
 * Protected: Admin only
 */
router.get('/token-status', authenticateQBOAdmin, getTokenStatus);


router.get('/webhooks/invoice', handleInvoiceWebhookPing);
/**
 * POST /qbo/webhooks/invoice
 * Handle incoming QBO invoice webhook notifications
 * QBO sends this when invoices are updated (payment received, etc)
 * 
 * Security:
 * - NOT protected by admin auth - QBO needs to post directly
 * - HMAC-SHA256 signature verification using QBO_WEBHOOK_TOKEN
 * - Verifies intuit-signature header matches payload hash
 */
router.post('/webhooks/invoice', handleInvoiceWebhook);

export default router;
