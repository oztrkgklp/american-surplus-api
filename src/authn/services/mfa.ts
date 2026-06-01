import { authenticator } from 'otplib';
import * as speakeasy from 'speakeasy';
import { AppError } from '@/utils/response/appError';
import User from '@/authn/models/User';
import { hashPassword } from '@/utils/password';
import { randomBytes } from 'crypto';
import MFAAuditLog, { MFAAuditLogCreationAttributes } from '@/authn/models/MFAAuditLog';

export class MFAService {
  /**
   * Logs an MFA-related action
   * @param userId - The ID of the user
   * @param action - The action being performed
   * @param ipAddress - The IP address of the user
   * @param userAgent - The user agent of the user
   */
  private static async logMFAAction(userId: string, action: string, ipAddress: string, userAgent: string): Promise<void> {
    await MFAAuditLog.create({
      userId,
      action,
      ipAddress,
      userAgent,
      createdAt: new Date(),
    } as MFAAuditLogCreationAttributes);
  }

  /**
   * Generates a new TOTP secret for a user
   * @param userId - The ID of the user
   * @returns Object containing the secret and QR code data
   */
  static async generateMFASecret(userId: string, ipAddress: string, userAgent: string): Promise<{ secret: string; qrCode: string }> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Generate a new secret
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `American Surplus:${user.email}`,
    });

    // Generate QR code data
    const qrCode = authenticator.keyuri(user.email, 'American Surplus', secret.base32);

    // Store the secret (encrypted) in the database
    await user.update({
      mfaSecret: secret.base32,
      mfaEnabled: false, // Not enabled until verified
    });

    await this.logMFAAction(userId, 'MFA_SECRET_GENERATED', ipAddress, userAgent);

    return {
      secret: secret.base32,
      qrCode,
    };
  }

  /**
   * Verifies a TOTP code for a user
   * @param userId - The ID of the user
   * @param token - The TOTP code to verify
   * @param ipAddress - The IP address of the user
   * @param userAgent - The user agent of the user
   * @returns boolean indicating if the code is valid
   */
  static async verifyMFAToken(userId: string, token: string, ipAddress: string, userAgent: string): Promise<boolean> {
    const user = await User.findByPk(userId);
    if (!user || !user.mfaSecret) {
      throw new AppError(404, 'MFA not set up for this user');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: 1, // Allow 30 seconds clock skew
    });

    if (isValid) {
      await user.update({ mfaLastVerified: new Date() });
      await this.logMFAAction(userId, 'MFA_TOKEN_VERIFIED', ipAddress, userAgent);
    } else {
      await this.logMFAAction(userId, 'MFA_TOKEN_VERIFICATION_FAILED', ipAddress, userAgent);
    }

    return isValid;
  }

  /**
   * Generates backup codes for a user
   * @param userId - The ID of the user
   * @param ipAddress - The IP address of the user
   * @param userAgent - The user agent of the user
   * @returns Array of backup codes
   */
  static async generateBackupCodes(userId: string, ipAddress: string, userAgent: string): Promise<string[]> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Generate 10 backup codes
    const backupCodes = Array.from({ length: 10 }, () => {
      return randomBytes(4).toString('hex').toUpperCase();
    });

    await user.update({
      mfaBackupCodes: backupCodes,
    });

    await this.logMFAAction(userId, 'MFA_BACKUP_CODES_GENERATED', ipAddress, userAgent);

    return backupCodes;
  }

  /**
   * Verifies a backup code for a user
   * @param userId - The ID of the user
   * @param code - The backup code to verify
   * @param ipAddress - The IP address of the user
   * @param userAgent - The user agent of the user
   * @returns boolean indicating if the code is valid
   */
  static async verifyBackupCode(userId: string, code: string, ipAddress: string, userAgent: string): Promise<boolean> {
    const user = await User.findByPk(userId);
    if (!user || !user.mfaBackupCodes) {
      throw new AppError(404, 'No backup codes found for this user');
    }

    // Find and remove the used backup code
    const hashedCodes = code.split(' ');
    const codeIndex = hashedCodes.findIndex((storedCode, index) => {
      const code = user.mfaBackupCodes?.[index];
      return code && storedCode === code;
    });

    if (codeIndex === -1) {
      await this.logMFAAction(userId, 'MFA_BACKUP_CODE_VERIFICATION_FAILED', ipAddress, userAgent);
      return false;
    }

    // Remove the used backup code
    const updatedBackupCodes = [...user.mfaBackupCodes];
    updatedBackupCodes.splice(codeIndex, 1);

    await user.update({
      mfaBackupCodes: updatedBackupCodes,
      mfaLastVerified: new Date(),
    });

    await this.logMFAAction(userId, 'MFA_BACKUP_CODE_VERIFIED', ipAddress, userAgent);

    return true;
  }

  /**
   * Enables MFA for a user after successful verification
   * @param userId - The ID of the user
   * @param ipAddress - The IP address of the user
   * @param userAgent - The user agent of the user
   */
  static async enableMFA(userId: string, ipAddress: string, userAgent: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user || !user.mfaSecret) {
      throw new AppError(404, 'MFA not set up for this user');
    }

    await user.update({
      mfaEnabled: true,
      mfaLastVerified: new Date(),
    });

    await this.logMFAAction(userId, 'MFA_ENABLED', ipAddress, userAgent);
  }

  /**
   * Disables MFA for a user
   * @param userId - The ID of the user
   * @param ipAddress - The IP address of the user
   * @param userAgent - The user agent of the user
   */
  static async disableMFA(userId: string, ipAddress: string, userAgent: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    await user.update({
      mfaEnabled: false,
      mfaSecret: null,
      mfaBackupCodes: null,
      mfaLastVerified: null,
    });

    await this.logMFAAction(userId, 'MFA_DISABLED', ipAddress, userAgent);
  }

  /**
   * Checks if MFA is required for a user
   * @param userId - The ID of the user
   * @returns boolean indicating if MFA is required
   */
  static async isMFARequired(userId: string): Promise<boolean> {
    const user = await User.findByPk(userId);
    return user?.mfaEnabled ?? false;
  }
}
