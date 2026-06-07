import { Request, Response } from 'express';

import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { clearAuthCookies, resetAccessTokenCookie, resetRefreshTokenCookie } from '@/utils/cookies';
import { UserType } from '@/enums/userType';
import { getDeviceInfoString } from '@/utils/userAgentParser';
import { withTransaction } from '@/utils/transactionalOperation';
import { AppError } from '@/utils/response/appError';
import { AuthService } from '@/authn/services/authentication';
import { UserSessionService } from '@/authn/services/userSession';
import User from '@/authn/models/User';
import { v4 as uuidv4 } from 'uuid';
import envvars from '@/config/envvars';
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import { hashPassword } from '@/utils/password';
import PasswordResetToken from '@/authn/models/PasswordResetToken.entity';
import { passwordResetSchema } from '@/authn/schemas/userSchema';
import { Op } from 'sequelize';
import UserSession from '@/authn/models/UserSession';
import crypto from 'crypto';
import moment from 'moment';
import { parseDuration } from '@/utils/parseExpirationPeriod';
import { HaoRoleInvitationService } from '@/organization/services/haoRoleInvitation.service';

const ACCESS_TOKEN_EXPIRATION = envvars.auth.jwt.accessExpiration;

/**
 * Verifies the user's authentication status.
 */
export const verifyAuthentication = async (req: Request, res: Response): Promise<void> => {
    try {
        // Use the shared service to validate the token
        const user = await AuthService.validateToken(req);

        // Send success response
        sendSuccess(res, {
            userId: user.id,
            mfaEnabled: user.mfaEnabled,
            mfaLastVerified: user.mfaLastVerified,
        });
    } catch (error) {
        // Handle errors using centralized error handling
        sendError(req, res, error);
    }
};

/**
 * Handles user registration.
 */
export async function register(req: Request, res: Response): Promise<void> {
    try {
        // Call the createUser service to handle registration
        await AuthService.createUser(req.body, UserType.DONEE);

        // Send success response
        sendSuccess(res);
    } catch (error) {
        // Handle errors using centralized error handling
        sendError(req, res, error);
    }
};

/**
 * Handles user login.
 * Validates credentials and generates access and refresh tokens.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const deviceInfo = getDeviceInfoString(req);
        const { user, accessToken, refreshToken } = await withTransaction(async (transaction) => {
            const authenticatedUser = await AuthService.loginUser(req);
            const session = await UserSessionService.createUserSession(
                authenticatedUser.id,
                authenticatedUser.email,
                deviceInfo,
                transaction,
            );
            return { user: authenticatedUser, ...session };
        });

        resetAccessTokenCookie(res, accessToken);
        resetRefreshTokenCookie(res, refreshToken);

        const { value, unit } = parseDuration(ACCESS_TOKEN_EXPIRATION);
        const tokenExpirationDate = moment().add(value, unit).toDate().getTime();
        sendSuccess(res, {
            id: user.id,
            name: user.name,
            email: user.email,
            isSasp: user.isSasp,
            isMfaEnabled: user.requiresMFA,
            requiresVerification: user.requiresVerification,
            tokenExpirationDate,
        });
    } catch (error) {
        sendError(req, res, error);
    }
};

/**
 * Handles user logout.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        // Perform logout
        await AuthService.logoutUser(req);

        // Clear auth cookies
        clearAuthCookies(res);

        // Send success response
        sendSuccess(res);
    } catch (error) {
        // Handle errors using centralized error handling
        sendError(req, res, error);
    }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = String(req.query.token)
        if (!token) throw new AppError(401, 'Unable to verify email', 'Token is missing');

        const user = await User.findOne({ where: { email_verification_token: token } });
        if (!user || !user.email_verification_expiry_date || user.email_verification_expiry_date < Date.now()) {
            throw new AppError(401, 'Verification link is invalid or expired', 'Verification link invalid or expired');
        }

        await user.update({
            is_email_verified: true,
            email_verification_token: null,
            email_verification_expiry_date: null,
        });

        sendSuccess(res, { message: 'Email verified - you can login now' });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const resendVerification = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email: email.toLowerCase() } });
        if (!user) throw new AppError(401, 'If that account exists, you’ll receive an email shortly', `No account with email: ${email}`);
        if (user.is_email_verified) throw new AppError(401, 'Email already verified', `Email: ${email} already verified`);

        // cooldown (only once every 10 minutes)
        // We store email_verification_expiry_date as lastSentAt + 24h, so infer lastSentAt
        const TEN_MINUTES = 10 * 60 * 1000;
        const DAY = 24 * 60 * 60 * 1000;
        if (user.email_verification_expiry_date) {
            const lastSentAt = user.email_verification_expiry_date - DAY;
            if (Date.now() - lastSentAt < TEN_MINUTES) {
                throw new AppError(429, 'Verification email already sent. Try again later.', 'Verification email already sent - cooldown active');
            }
        }

        const email_verification_token = uuidv4();
        const email_verification_expiry_date = Date.now() + 24 * 60 * 60 * 1000;;
        await user.update({ email_verification_token, email_verification_expiry_date });

        const verifyUrl = `${envvars.ui}/email-verification?token=${email_verification_token}`;
        const renderData = {
            templateName: TemplateEnum.Email_Verification,
            data: { name: user.name, verifyUrl },
        };
        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: user.email as string,
            subject: 'Verify your email address to activate your account',
            html: mailContent as string,
        };

        await emailQueue.add('emailVerificationNotification', mailData, { removeOnComplete: true, attempts: 3, });
        sendSuccess(res, { message: 'Verification has been sent, Please check your inbox' });
    } catch (error) {
        sendError(req, res, error);
    }
}

export const requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email: email.toLowerCase() } });
        if (!user) return sendSuccess(res, { message: 'If that account exists, you’ll receive an email shortly' });

        // If the user has not verified their email yet, send a dedicated guidance email
        // with the standard verification link. Always return generic success.
        if (!user.is_email_verified) {
            const TEN_MINUTES = 10 * 60 * 1000;
            const DAY = 24 * 60 * 60 * 1000;

            let canSend = true;
            if (user.email_verification_expiry_date) {
                const lastSentAt = user.email_verification_expiry_date - DAY;
                if (Date.now() - lastSentAt < TEN_MINUTES) {
                    canSend = false;
                }
            }

            if (canSend) {
                const email_verification_token = uuidv4();
                const email_verification_expiry_date = Date.now() + 24 * 60 * 60 * 1000;
                await user.update({ email_verification_token, email_verification_expiry_date });

                const verifyUrl = `${envvars.ui}/email-verification?token=${email_verification_token}`;
                const renderData = {
                    templateName: TemplateEnum.Unverified_Password_Reset,
                    data: { name: user.name, verifyUrl },
                };
                const mailContent = await renderEmail(renderData);
                const mailData = {
                    to: user.email as string,
                    subject: 'Complete your American Surplus registration',
                    html: mailContent as string,
                };
                await emailQueue.add('unverifiedPasswordResetNotification', mailData, { removeOnComplete: true, attempts: 3 });
            }

            return sendSuccess(res, { message: 'If that account exists, you’ll receive an email shortly' });
        }

        // Verified users: issue a reset token if not rate-limited recently.
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        const recent = await PasswordResetToken.findOne({
            where: {
                user_id: user.id,
                is_used: false,
                createdAt: { [Op.gt]: new Date(tenMinutesAgo) },
                expiry_date: { [Op.gt]: Date.now() },
            },
        });

        if (!recent) {
            const rawToken = uuidv4();
            const token_hash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expiry_date = Date.now() + 15 * 60 * 1000; // 15 minutes
            await PasswordResetToken.create({ user_id: user.id, token_hash, expiry_date });

            const resetUrl = `${envvars.ui}/pass-reset?token=${rawToken}`;
            const renderData = {
                templateName: TemplateEnum.Password_Reset,
                data: { name: user.name, resetUrl },
            };
            const mailContent = await renderEmail(renderData);
            const mailData = {
                to: user.email as string,
                subject: 'Reset your American Surplus password',
                html: mailContent as string,
            };

            await emailQueue.add('passwordResetNotification', mailData, { removeOnComplete: true, attempts: 3 });
        }

        // Always return a generic success to avoid enumeration.
        sendSuccess(res, { message: 'If that account exists, you’ll receive an email shortly' });
    } catch (error) {
        sendError(req, res, error);
    }
}


export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { newPassword } = req.body;
        const validatedData = await passwordResetSchema.validate({ password: newPassword });
        const { password } = validatedData;

        const token = String(req.query.token)
        const token_hash = crypto.createHash('sha256').update(token).digest('hex');
        const record = await PasswordResetToken.findOne({
            where: {
                token_hash,
                is_used: false,
                expiry_date: { [Op.gt]: Date.now() },
            }
        });

        if (!record) throw new AppError(401, 'Reset link invalid or expired', `Reset link invalid or expired`);

        await withTransaction(async (transaction) => {
            const hashedPassword = await hashPassword(password);
            await User.update({ password: hashedPassword }, { where: { id: record.user_id }, transaction });
            await record.update({ is_used: true }, { transaction });
            await UserSession.update(
                { expiredAt: new Date() },
                { where: { userId: record.user_id, expiredAt: null }, transaction }
            );
        })

        sendSuccess(res, { message: 'Password has been reset — you can now log in.' });
    } catch (error) {
        sendError(req, res, error);
    }
}

/**
 * Issues a new access token using a valid refresh token.
 * Expects the refresh token in either:
 *   • Cookie `refreshToken`
 *   • Header `x-refresh-token`
 *   • JSON body `{ refreshToken: string }`
 * Responds with the same shape as the initial authentication success (accessToken included).
 */
export const getHaoRoleInvitationPreview = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = String(req.query.token ?? '');
        const preview = await HaoRoleInvitationService.getInvitationPreview(token);
        sendSuccess(res, { preview });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const completeHaoRoleInvitation = async (req: Request, res: Response): Promise<void> => {
    try {
        const token = String(req.query.token ?? '');
        const { password, name, title, phone } = req.body;
        const validated = await passwordResetSchema.validate({ password });
        await withTransaction(async (transaction) => {
            await HaoRoleInvitationService.completeInvitation(token, { password: validated.password, name, title, phone }, transaction);
        });
        sendSuccess(res, { message: 'You are now the Head Authorized Official. You can sign in with your new account.' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const refreshToken = req.cookies?.refreshToken || (req.headers['x-refresh-token'] as string | undefined) || req.body?.refreshToken;
        if (!refreshToken) throw new AppError(401, 'Unauthenticated', 'Refresh token missing');

        const { accessToken, refreshToken: newRefreshToken, userId } = await UserSessionService.refreshUserSession(refreshToken);

        // Reset the access token cookie so the client seamlessly continues.
        resetAccessTokenCookie(res, accessToken);
        resetRefreshTokenCookie(res, newRefreshToken);
        const { value, unit } = parseDuration(ACCESS_TOKEN_EXPIRATION);
        const tokenExpirationDate = moment().add(value, unit).toDate().getTime();
        sendSuccess(res, { accessToken, userId, tokenExpirationDate });
    } catch (error) {
        clearAuthCookies(res);
        sendError(req, res, error);
    }
};
