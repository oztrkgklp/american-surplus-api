import { QBOAuthService } from '../auth/auth.service';
import config from '../../config/envvars';

/**
 * QuickBooks Online HTTP Service
 * Handles HTTP requests to QuickBooks API
 */
export class QBOHttpService {
    private authService: QBOAuthService;

    constructor(authService: QBOAuthService) {
        this.authService = authService;
    }

    /**
     * Make an API call to QuickBooks
     */
    async makeApiCall(endpoint: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', headers?: Record<string, string>, body?: any): Promise<any> {
        // Ensure we have valid tokens before making the call
        await this.authService.ensureValidToken();

        const baseUrl = this.getBaseUrl();
        const realmId = this.authService.getRealmId();
        if (!realmId) throw new Error('Realm ID not set');

        const fullUrl = `${baseUrl}/v3/company/${realmId}${endpoint}`;
        const oauthClient = this.authService.getOAuthClient();

        const response = await oauthClient.makeApiCall({
            url: fullUrl,
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });

        return response;
    }

    /**
     * Get base URL based on environment
     */
    private getBaseUrl(): string {
        const env = config.quickbooks.environment;
        return env === 'Production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';
    }
}