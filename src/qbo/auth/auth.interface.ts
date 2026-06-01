export interface AuthCredentials {
    clientId: string;
    clientSecret: string;
    realmId: string;
    environment?: 'sandbox' | 'production';
    refreshToken?: string;
    accessToken?: string;
    minorVersion?: string;
}

export interface AuthorizationUrlOptions {
    scope?: string[];
    redirectUri: string;
    state?: string;
}

export interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
}

export interface RevokeTokenResponse {
    success: boolean;
    message?: string;
}
