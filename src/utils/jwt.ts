import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { getLogger } from '@/utils/logger';
import envvars from '@/config/envvars';
import { AppError } from '@/utils/response/appError';

const ACCESS_TOKEN_SECRET = envvars.auth.jwt.accessSecret;
const REFRESH_TOKEN_SECRET = envvars.auth.jwt.refreshSecret;
const ACCESS_TOKEN_EXPIRATION = envvars.auth.jwt.accessExpiration;
const REFRESH_TOKEN_EXPIRATION = envvars.auth.jwt.refreshExpiration;

const logger = getLogger('JWT');

if (!ACCESS_TOKEN_SECRET) {
    logger.error('ACCESS_TOKEN_SECRET is undefined in envvars. Exiting...');
    process.exit(1);
}

if (!REFRESH_TOKEN_SECRET) {
    logger.error('REFRESH_TOKEN_SECRET is undefined in envvars. Exiting...');
    process.exit(1);
}

/**
 * Generates an access token for the given payload.
 * @param payload The payload to sign the token with.
 * @returns A string representing the access token.
 */
function generateAccessToken(userId: string, payload: any): string {
    const tokenPayload = { ...payload, sub: userId };
    if (ACCESS_TOKEN_SECRET === undefined) {
        throw new AppError(500, 'Internal server error', 'Access token secret is missing');
    }
    return jwt.sign(tokenPayload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRATION } as SignOptions);
}

/**
 * Generates a refresh token.
 * @returns A string representing the refresh token.
 */
function generateRefreshToken(userId: string): string {
    const tokenPayload = { sub: userId, jti: crypto.randomBytes(16).toString('hex') };
    if (REFRESH_TOKEN_SECRET === undefined) {
        throw new AppError(500, 'Internal server error', 'Refresh token secret is missing');
    }
    return jwt.sign(tokenPayload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRATION } as SignOptions);
}

/**
 * Verifies the provided access token.
 * @param token The token to verify.
 * @returns A promise that resolves with the decoded token if valid, or rejects with an error.
 */
function verifyAccessToken(token: string): Promise<any> {
    if (ACCESS_TOKEN_SECRET === undefined) {
        throw new AppError(500, 'Internal server error', 'Access token secret is missing');
    }
    return verify(token, ACCESS_TOKEN_SECRET);
}

/**
 * Verifies the provided refresh token.
 * @param token The token to verify.
 * @returns A promise that resolves with the decoded token if valid, or rejects with an error.
 */
function verifyRefreshToken(token: string): Promise<any> {
    if (REFRESH_TOKEN_SECRET === undefined) {
        throw new AppError(500, 'Internal server error', 'Refresh token secret is missing');
    }
    return verify(token, REFRESH_TOKEN_SECRET);
}

/**
 * Verifies a token with the provided secret.
 * @param token The token to verify.
 * @param secret The secret used to sign the token.
 * @returns A promise that resolves with the decoded token if valid, or rejects with an AppError if invalid or expired.
 */
function verify<T>(token: string | undefined, secret: string): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!token) {
            logger.error('JWT verification failed: No token provided');
            return reject(new AppError(401, "Something went wrong in the authentication process. Please try again.", 'Authentication token is missing'));
        }

        jwt.verify(token, secret, (err, decoded) => {
            if (err) {
                logger.error(`JWT verification failed: ${err.name} - ${err.message}`);
                if (err.name === 'TokenExpiredError') {
                    return reject(new AppError(401, 'Session expired. Please log in again.', 'Token expired'));
                }
                if (err.name === 'JsonWebTokenError') {
                    return reject(new AppError(401, 'Invalid token. Please log in again.', 'Invalid token'));
                }
                return reject(new AppError(401, "Something went wrong in the authentication process. Please try again.", 'An invalid token was presented'));
            }

            if (!decoded) {
                logger.error('JWT verification returned no error but decoded is undefined');
                return reject(new AppError(401, 'Invalid token. Please log in again.', 'Invalid token payload'));
            }

            resolve(decoded as T);
        });
    });
}

export {
    generateAccessToken,
    verifyAccessToken,
    generateRefreshToken,
    verifyRefreshToken
};
