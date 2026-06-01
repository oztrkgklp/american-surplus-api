declare module 'intuit-oauth' {
    export type OAuthEnvironment = 'sandbox' | 'Production';

    export interface OAuthClientConfig {
        clientId: string;
        clientSecret: string;
        environment?: OAuthEnvironment;
        redirectUri?: string;
        logging?: boolean;
        token?: Token;
    }

    export interface Token {
        token_type?: string;
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        x_refresh_token_expires_in?: number;
        id_token?: string;
        createdAt?: number;
    }

    export interface AuthResponse {
        token: Token;
        response: any;
        body: string;
        json: any;
        intuit_tid: string;
        status: number;
        statusText: string;
        getToken(): Token;
        getJson(): any;
        getIntuitTid(): string;
    }

    export interface MakeApiCallParams {
        url: string;
        method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
        headers?: Record<string, string>;
        body?: any;
    }

    export interface AuthorizeUriOptions {
        scope?: string[];
        state?: string;
    }

    export class OAuthClient {
        constructor(config: OAuthClientConfig);

        authorizeUri(options?: AuthorizeUriOptions): string;

        createToken(url: string): Promise<AuthResponse>;

        refresh(): Promise<AuthResponse>;

        refreshUsingToken(refreshToken: string): Promise<AuthResponse>;

        revoke(params?: Token): Promise<AuthResponse>;

        isAccessTokenValid(): boolean;

        getToken(): Token;

        setToken(token: Token): void;

        makeApiCall(params: MakeApiCallParams): Promise<{
            json: any;
            body: string;
            response: any;
            intuit_tid: string;
        }>;

        validateIdToken(): Promise<boolean>;

        migrate(params: any): Promise<any>;

        static scopes: {
            Accounting: string;
            Payment: string;
            Payroll: string;
            PayrollTimetracking: string;
            PayrollBenefits: string;
            OpenId: string;
            Profile: string;
            Email: string;
            Phone: string;
            Address: string;
        };
    }

    export default OAuthClient;
}