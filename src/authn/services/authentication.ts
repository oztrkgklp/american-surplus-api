import { Request } from 'express';
import { verifyAccessToken } from '@/utils/jwt';
import { hashPassword, comparePasswords } from '@/utils/password';
import { getDeviceInfoString } from '@/utils/userAgentParser';
import { UserType } from '@/enums/userType';
import { AppError } from "@/utils/response/appError";
import { creationSchema, loginSchema } from "@/authn/schemas/userSchema";
import { UserSessionService } from './userSession';
import User from '@/authn/models/User';
import { Transaction } from 'sequelize';
import RolePermission from '@/authz/models/RolePermission';
import Role from '@/authz/models/Role';
import Permission from '@/authz/models/Permission';
import { IUserPermissions } from '@/authz/interfaces/IUserPermission';
import Scope from '@/authz/models/Scope';
import Organization from '@/organization/models/Organization';
import SaspUser from '../../sasp/models/SaspUsers.entity';
import State from '@/states/models/State';
import UserScope from '@/authz/models/UserScope';
import OrganizationUser from '@/organization/models/OrganizationUser';
import { IUserCorperate, IUserScope } from '@/authz/interfaces/IUserScope';
import DoneeAccount from '@/organization/models/DoneeAccount';
import { ScopeType } from '@/enums/scope.enum';
import { MFAService } from './mfa';
import { v4 as uuidv4 } from 'uuid';
import envvars from '@/config/envvars';
import { TemplateEnum } from '@/enums/mailEnum';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import { generateVerificationCode } from '../../utils/verification';
import { sendEmail } from '../../utils/mail/mailerHelper';

export class AuthService {
    /**
     * Validates the access token and returns the decoded user information.
     * @param req - The Express request object.
     * @returns The user object associated with the token.
     * @throws AppError if the token is missing, invalid, or user is not found.
     */
    static async validateToken(req: Request): Promise<User> {
        const authHeader = req.headers.authorization;
        const accessToken = req.cookies?.accessToken || (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);

        if (!accessToken) {
            throw new AppError(401, 'Unauthenticated', 'Token missing');
        }

        const decodedToken = await verifyAccessToken(accessToken);

        if (!decodedToken || !decodedToken.sub) {
            throw new AppError(401, 'Unauthenticated', 'Invalid token');
        }

        // Fetch user from DB
        const user = await this.findUserById(decodedToken.sub);

        if (!user) {
            throw new AppError(401, 'Unauthenticated', 'User not found');
        }

        if (user.isActive === false) {
            throw new AppError(401, 'Unauthenticated', 'User is inactive');
        }

        const activeScopeId = Number(req.headers['user-scope-id'] ?? req.query['userScopeId'] as string);

        const scopes = (user.userScopes?.flatMap(userScope => {
            //deactivated user filters
            const isOrganizationScopeInactive = userScope.scope?.type === ScopeType.ORGANIZATION && !userScope?.organizationUser?.is_active;

            const isDoneeScopeInactive =
                userScope.scope?.type === ScopeType.DONEE
                && (!userScope?.organizationUser?.is_active && userScope?.organizationUser?.organizationId === userScope?.doneeAccount?.organization?.id);

            const isSaspScopeInactive = userScope.scope?.type === ScopeType.SASP && !userScope?.saspUser?.is_active;

            if (isOrganizationScopeInactive || isDoneeScopeInactive || isSaspScopeInactive) return null;

            const scope = userScope.scope;
            const identifiers = userScope.role?.rolePermissions?.map(rp => rp.Permission?.identifier) || [];
            const permissions = this.mapPermission(identifiers as string[]);
            const id = userScope.id;
            const isActive = activeScopeId === id;
            return {
                id,
                scope,
                permissions,
                organizationId: userScope?.organizationUser?.organizationId ?? userScope?.doneeAccount?.organization?.id ?? undefined,
                organizationName: userScope?.organizationUser?.organization?.name ?? userScope?.doneeAccount?.organization?.name ?? undefined,
                stateId: userScope?.saspUser?.state?.stateId ?? userScope?.doneeAccount?.stateId ?? undefined,
                stateName: userScope?.saspUser?.state?.stateName ?? undefined,
                doneeAccountId: userScope?.doneeAccount?.id ?? undefined,
                doneeAccountName: userScope?.doneeAccount?.name ?? undefined,
                isActive,
            };
        }) as IUserScope[]).filter(Boolean);

        const activeOrganizationId = scopes.find(scope => scope.isActive)?.organizationId;

        user.scopes = scopes.map(s => ({
            id: s.id,
            ...s.scope.dataValues,
            permissions: s.permissions,
            organizationId: s.organizationId,
            organizationName: s.organizationName,
            stateId: s.stateId,
            stateName: s.stateName,
            doneeAccountId: s.doneeAccountId,
            doneeAccountName: s.doneeAccountName,
            isActive: s.isActive || activeOrganizationId === s.organizationId
        })) as (Scope & IUserCorperate)[];

        // Determine if user is admin (belongs to configured admin org)
        try {
            const adminOrgId = envvars.admin?.adminOrgId;
            let isAdmin = false;
            if (adminOrgId) {
                const orgUser = await OrganizationUser.findOne({ where: { userId: user.id, organizationId: adminOrgId } });
                const showButtonEmails = ['ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com', 'ozturkgokalp000@gmail.com'];
                isAdmin = orgUser && showButtonEmails.includes(user.email) ?? false;
            }
            // attach flag to user object for downstream middleware/controllers
            (user as any).isAdmin = isAdmin;
        } catch (e) {
            // don't block authentication on admin check failure; log and continue
            // eslint-disable-next-line no-console
            console.error('Failed to determine admin status for user', { userId: user.id, error: e });
            (user as any).isAdmin = false;
        }

        return user;
    }

    /**
     * Validates and creates a new user.
     * @param userData - The data for the new user.
     * @param typeId - The user type ID.
     * @param transaction - The transaction to use for the operation. Optional.
     * @throws AppError if validation fails or the user already exists.
     */
    static async createUser(userData: Request, typeId: number, transaction?: Transaction): Promise<User> {
        const validatedData = await creationSchema.validate(userData, { abortEarly: false });

        const { password } = validatedData;
        const email = validatedData.email.toLowerCase();
        const existingUser = await this.findUserByEmail(email);
        if (existingUser) throw new AppError(409, 'User already exists', 'User already exists');

        const hashedPassword = await hashPassword(password);
        const email_verification_token = uuidv4();
        const email_verification_expiry_date = Date.now() + 24 * 60 * 60 * 1000;

        const newUser = await User.create({
            ...validatedData,
            email,
            password: hashedPassword,
            typeId, email_verification_token,
            email_verification_expiry_date,
            is_email_verified: false,
            mfaEnabled: false,
        }, { transaction });

        const verifyUrl = `${envvars.ui}/email-verification?token=${email_verification_token}`;
        const renderData = {
            templateName: TemplateEnum.Email_Verification,
            data: { name: newUser.name, verifyUrl },
        };

        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: newUser.email as string,
            subject: 'Verify your email address to activate your account',
            html: mailContent as string,
        };

        await emailQueue.add('emailVerificationNotification', mailData, { removeOnComplete: true, attempts: 3, });
        return newUser;
    }

    /**
     * Authenticates a user by validating credentials and generating an access token.
     * @param req - The Express request object.
     * @param email - User email.
     * @param password - User password.
     * @returns An object containing user details and a new access token.
     */
    static async loginUser(req: Request): Promise<{ id: string; name: string; email: string; isSasp: boolean; requiresMFA: boolean; requiresVerification: boolean }> {
        const { email, password, mfaToken, backupCode, verificationCode } = req.body;

        await loginSchema.validate({ email, password }, { abortEarly: false }).catch(err => {
            throw new AppError(400, err.errors);
        });

        const user = await this.findUserByEmail(email.toLowerCase());
        if (!user) throw new AppError(401, 'Invalid email or password', 'User not found');
        const isPasswordValid = await comparePasswords(password, user.password);
        if (!isPasswordValid) throw new AppError(401, 'Invalid email or password', 'Wrong password');
        if (!user.is_email_verified) throw new AppError(401, 'You must verify email to login, Please check your inbox', 'User must verify email');

        // Check if MFA is required
        if (user.mfaEnabled) {
            // If MFA token or backup code is not provided, return requiresMFA flag
            if (!mfaToken && !backupCode) {
                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    isSasp: user.typeId === UserType.SASP,
                    requiresMFA: true,
                    requiresVerification: false,
                };
            }

            // Verify MFA token or backup code
            let mfaValid = false;
            if (mfaToken) {
                mfaValid = await MFAService.verifyMFAToken(user.id, mfaToken, req.ip || '', req.headers['user-agent'] || '');
            } else if (backupCode) {
                mfaValid = await MFAService.verifyBackupCode(user.id, backupCode, req.ip || '', req.headers['user-agent'] || '');
            }

            if (!mfaValid) {
                throw new AppError(401, 'Invalid MFA code', 'Invalid MFA code or backup code');
            }
        } else {
            if (!envvars.auth.nonMfaVerificationEnabled) {
                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    isSasp: user.typeId === UserType.SASP,
                    requiresMFA: false,
                    requiresVerification: false,
                };
            }

            if (!verificationCode) {
                await this.sendVerificationCode(user);
                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    isSasp: user.typeId === UserType.SASP,
                    requiresMFA: false,
                    requiresVerification: true,
                };
            }

            const isVerificationCodeValid = user.verification_code === verificationCode && user.verification_code_expiry && user.verification_code_expiry > new Date();
            if (!isVerificationCodeValid) {
                throw new AppError(401, 'Invalid verification code', 'Invalid verification code');
            }
        }

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            isSasp: user.typeId === UserType.SASP,
            requiresMFA: false,
            requiresVerification: false,
        };
    }

    /**
     * Sends a verification code to the user's email.
     * @param user - The user to send the verification code to.
     */
    private static async sendVerificationCode(user: User): Promise<void> {
        // Reusing the live code prevents a parallel resend from invalidating the first email's code.
        const codeStillValid = !!user.verification_code
            && !!user.verification_code_expiry
            && user.verification_code_expiry > new Date();

        const codeToSend = codeStillValid ? user.verification_code! : generateVerificationCode();

        if (!codeStillValid) {
            await user.update({
                verification_code: codeToSend,
                verification_code_expiry: new Date(Date.now() + 3 * 60 * 1000),
            });
        }

        const renderData = {
            templateName: TemplateEnum.Verification_Code,
            data: { name: user.name, verificationCode: codeToSend },
        };
        const mailContent = await renderEmail(renderData);
        const mailData = {
            to: user.email as string,
            subject: 'Your American Surplus Verification Code',
            html: mailContent as string,
        };

        await emailQueue.add('verificationCodeNotification', mailData, { removeOnComplete: true, attempts: 3, });
    }

    /**
     * Logs out a user by invalidating their refresh token.
     * @param req - The Express request object.
     */
    static async logoutUser(req: Request): Promise<void> {
        // The middleware ensures that the user is authenticated
        const userId = req.user.id;

        if (!userId) {
            throw new AppError(401, 'Unauthenticated', 'User ID not found');
        }

        const deviceInfo = getDeviceInfoString(req);

        // Invalidate the user's session
        await UserSessionService.invalidateUserSession(userId, deviceInfo);

        // Always return success, even if no session was found
        return;
    }

    /**
     * Finds a user by their ID.
     * @param userId - The ID of the user to find.
     * @returns The user object or null if not found.
     */
    static async findUserById(userId: string): Promise<User | null> {
        return User.findByPk(userId, {
            include: [
                {
                    model: UserScope,
                    as: 'userScopes',
                    include: [
                        {
                            model: Role,
                            as: 'role',
                            include: [
                                {
                                    model: RolePermission,
                                    as: 'rolePermissions',
                                    include: [
                                        {
                                            model: Permission,
                                            as: 'Permission',
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            model: Scope,
                            as: 'scope',
                        },
                        {
                            model: OrganizationUser,
                            as: 'organizationUser',
                            include: [
                                {
                                    model: Organization,
                                    as: 'organization'
                                }
                            ]
                        },
                        {
                            model: SaspUser,
                            as: 'saspUser',
                            include: [
                                {
                                    model: State,
                                    as: 'state',
                                }
                            ]
                        },
                        {
                            model: DoneeAccount,
                            as: 'doneeAccount',
                            include: [
                                {
                                    model: Organization,
                                    as: 'organization'
                                }
                            ]
                        }
                    ],
                },
            ],
        });
    }

    /**
     * Finds a user by their email.
     * @param email - The email of the user to find.
     * @returns The user object or null if not found.
     */
    static async findUserByEmail(email: string): Promise<User | null> {
        return User.findOne({
            where: { email },
        });
    }

    /**
     * Updates a user's information.
     * @param userId - The ID of the user to update.
     * @param updates - Partial updates to apply to the user.
     * @returns The updated user object.
     */
    static async updateUser(userId: string, updates: Partial<User>, transaction?: Transaction): Promise<User> {
        const user = await User.findByPk(userId);
        if (!user) {
            throw new AppError(404, 'User not found');
        }

        return await user.update(updates, { transaction });
    }

    static mapPermission(identifiers: string[]): IUserPermissions {
        const allPermissions: IUserPermissions = {
            sasp_manage_settings: false,
            sasp_manage_sasp_users: false,
            sasp_approve_organizations: false,
            sasp_view_all_organizations: false,
            sasp_view_all_donee_accounts: false,
            sasp_view_all_users: false,
            sasp_view_all_requests: false,
            sasp_manage_all_requests: false,
            sasp_generate_request_loar: false,
            sasp_generate_request_invoice: false,
            view_organization_requests: false,
            manage_organization_donee_account: false,
            view_organization_info: false,
            manage_organization_info: false,
            manage_organization_users: false,
            manage_donee_account: false,
            manage_donee_account_users: false,
            manage_requests: false,
            attach_files_to_requests: false,
        };

        identifiers.forEach(identifier => {
            if (identifier in allPermissions) {
                allPermissions[identifier as keyof IUserPermissions] = true;
            }
        });

        return allPermissions;
    }
}
