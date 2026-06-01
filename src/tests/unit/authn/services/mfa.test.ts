import { MFAService } from '@/authn/services/mfa';
import { AppError } from '@/utils/response/appError';
import { authenticator } from 'otplib';
import User from '@/authn/models/User';
import MFAAuditLog from '@/authn/models/MFAAuditLog';
import * as speakeasy from 'speakeasy';

// ---------------------------
// Mock dependencies
// ---------------------------

jest.mock('otplib');

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockImplementation(() => Buffer.from('a1b2c3d4', 'hex')),
  randomFillSync: jest.fn().mockImplementation((buffer: Buffer) => {
    const bytes = Buffer.from('1234567890abcdef1234567890abcdef', 'hex');
    bytes.copy(buffer);
    return buffer;
  }),
  createHash: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  digest: jest.fn().mockReturnValue('mocked-hash'),
}));

jest.mock('uuid', () => ({
  v4: () => 'mocked-uuid-1234-5678-90ab-cdef12345678',
}));

jest.mock('@/authn/models/User', () => ({
  findByPk: jest.fn(),
}));

jest.mock('@/authn/models/MFAAuditLog', () => ({
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('speakeasy', () => ({
  generateSecret: jest.fn(),
  totp: {
    verify: jest.fn(),
    verifyDelta: jest.fn(),
    generate: jest.fn(),
    generateSecret: jest.fn(),
    generateSecretASCII: jest.fn(),
    generateSecretHex: jest.fn(),
    generateSecretBase32: jest.fn(),
    time: jest.fn(),
    timeRemaining: jest.fn(),
    timeUsed: jest.fn(),
    options: {},
  },
}));

(authenticator as any).keyuri = jest.fn();

// ---------------------------
// Test suite
// ---------------------------

describe('MFAService', () => {
  const userId = 'mocked-user-id';
  const ipAddress = '192.168.1.1';
  const userAgent = 'Test User Agent';

  const mockUser: any = {
    id: userId,
    email: 'ozturkgokalp000@gmail.com',
    mfaSecret: null as string | null,
    mfaEnabled: false,
    mfaBackupCodes: null as string[] | null,
    mfaLastVerified: null as Date | null,
    update: jest.fn().mockImplementation((data) => {
      Object.assign(mockUser, data);
      return Promise.resolve(mockUser);
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (User.findByPk as jest.Mock).mockResolvedValue(mockUser);
  });

  // --------------------------------------------------
  // generateMFASecret
  // --------------------------------------------------
  describe('generateMFASecret', () => {
    it('should generate a new MFA secret and QR code', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange test data
      // ────────────────────────────────────────────────
      const mockSecret = {
        base32: 'MOCKBASE32SECRET',
        otpauth_url:
          'otpauth://totp/American Surplus:test%40example.com?secret=MOCKBASE32SECRET&issuer=American Surplus',
      };

      (speakeasy.generateSecret as jest.Mock).mockReturnValue(mockSecret);
      (authenticator.keyuri as jest.Mock).mockReturnValue(mockSecret.otpauth_url);

      // ────────────────────────────────────────────────
      // 2. Act - Generate MFA secret
      // ────────────────────────────────────────────────
      const result = await MFAService.generateMFASecret(userId, ipAddress, userAgent);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify secret generation and storage
      // ────────────────────────────────────────────────
      expect(speakeasy.generateSecret).toHaveBeenCalledWith({
        length: 20,
        name: `American Surplus:${mockUser.email}`,
      });
      expect(authenticator.keyuri).toHaveBeenCalledWith(
        mockUser.email,
        'American Surplus',
        mockSecret.base32,
      );
      expect(mockUser.update).toHaveBeenCalledWith({
        mfaSecret: mockSecret.base32,
        mfaEnabled: false,
      });
      expect(MFAAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'MFA_SECRET_GENERATED',
          ipAddress,
          userAgent,
        }),
      );
      expect(result).toEqual({
        secret: mockSecret.base32,
        qrCode: mockSecret.otpauth_url,
      });
    });

    it('should throw an error if user is not found', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock user not found
      // ────────────────────────────────────────────────
      (User.findByPk as jest.Mock).mockResolvedValueOnce(null);

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        MFAService.generateMFASecret('nonexistent', ipAddress, userAgent),
      ).rejects.toThrow(new AppError(404, 'User not found'));
    });
  });

  // --------------------------------------------------
  // verifyMFAToken
  // --------------------------------------------------
  describe('verifyMFAToken', () => {
    beforeEach(() => {
      mockUser.mfaSecret = 'MOCKBASE32SECRET';
      mockUser.mfaEnabled = true;
    });

    it('should verify a valid TOTP token', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock successful token verification
      // ────────────────────────────────────────────────
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);

      // ────────────────────────────────────────────────
      // 2. Act - Verify the token
      // ────────────────────────────────────────────────
      const result = await MFAService.verifyMFAToken(userId, '123456', ipAddress, userAgent);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify token verification flow
      // ────────────────────────────────────────────────
      expect(speakeasy.totp.verify).toHaveBeenCalledWith({
        secret: mockUser.mfaSecret,
        encoding: 'base32',
        token: '123456',
        window: 1,
      });
      expect(mockUser.update).toHaveBeenCalledWith({
        mfaLastVerified: expect.any(Date),
      });
      expect(MFAAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'MFA_TOKEN_VERIFIED',
          ipAddress,
          userAgent,
        }),
      );
      expect(result).toBe(true);
    });

    it('should log failed verification attempt for invalid token', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock failed token verification
      // ────────────────────────────────────────────────
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);

      // ────────────────────────────────────────────────
      // 2. Act - Attempt verification with invalid token
      // ────────────────────────────────────────────────
      const result = await MFAService.verifyMFAToken(userId, 'wrongcode', ipAddress, userAgent);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify failed attempt is logged
      // ────────────────────────────────────────────────
      expect(result).toBe(false);
      expect(MFAAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'MFA_TOKEN_VERIFICATION_FAILED',
          ipAddress,
          userAgent,
        }),
      );
    });

    it('should throw an error if MFA is not set up', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - MFA not set up
      // ────────────────────────────────────────────────
      mockUser.mfaSecret = null;

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        MFAService.verifyMFAToken(userId, '123456', ipAddress, userAgent),
      ).rejects.toThrow(new AppError(404, 'MFA not set up for this user'));
    });

    it('should throw an error if user is not found', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock user not found
      // ────────────────────────────────────────────────
      (User.findByPk as jest.Mock).mockResolvedValueOnce(null);

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        MFAService.verifyMFAToken('nonexistent', '123456', ipAddress, userAgent),
      ).rejects.toThrow(new AppError(404, 'MFA not set up for this user'));
    });
  });

  // --------------------------------------------------
  // generateBackupCodes
  // --------------------------------------------------
  describe('generateBackupCodes', () => {
    it('should generate 10 backup codes', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock crypto.randomBytes
      // ────────────────────────────────────────────────
      const mockRandomBytes = require('crypto').randomBytes as jest.Mock;
      mockRandomBytes.mockImplementation(() => Buffer.from('a1b2c3d4', 'hex'));

      // ────────────────────────────────────────────────
      // 2. Act - Generate backup codes
      // ────────────────────────────────────────────────
      const backupCodes = await MFAService.generateBackupCodes(userId, ipAddress, userAgent);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify backup codes are generated and stored
      // ────────────────────────────────────────────────
      expect(backupCodes).toHaveLength(10);
      backupCodes.forEach((code: string) => {
        expect(code).toMatch(/^[0-9A-F]{8}$/);
      });
      expect(mockUser.update).toHaveBeenCalledWith({
        mfaBackupCodes: backupCodes,
      });
      expect(MFAAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'MFA_BACKUP_CODES_GENERATED',
          ipAddress,
          userAgent,
        }),
      );
    });

    it('should throw an error if user is not found', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock user not found
      // ────────────────────────────────────────────────
      (User.findByPk as jest.Mock).mockResolvedValueOnce(null);

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        MFAService.generateBackupCodes('nonexistent', ipAddress, userAgent),
      ).rejects.toThrow(new AppError(404, 'User not found'));
    });
  });

  // --------------------------------------------------
  // verifyBackupCode
  // --------------------------------------------------
  describe('verifyBackupCode', () => {
    const backupCodes = ['E5F6A7B8', 'A1B2C3D4', 'C9D0E1F2'];

    beforeEach(() => {
      mockUser.mfaBackupCodes = [...backupCodes];
    });

    it('should verify a backup code at the correct index', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data
      // ────────────────────────────────────────────────
      
      // ────────────────────────────────────────────────
      // 2. Act - Verify first backup code
      // ────────────────────────────────────────────────
      let result = await MFAService.verifyBackupCode(
        userId,
        'E5F6A7B8',
        ipAddress,
        userAgent,
      );
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify code is accepted and removed
      // ────────────────────────────────────────────────
      expect(result).toBe(true);
      expect(mockUser.update).toHaveBeenCalledWith({
        mfaBackupCodes: ['A1B2C3D4', 'C9D0E1F2'],
        mfaLastVerified: expect.any(Date),
      });

      // Reset mocks for next test
      jest.clearAllMocks();
      mockUser.mfaBackupCodes = [...backupCodes];

      // ────────────────────────────────────────────────
      // 4. Act - Verify second backup code at wrong position
      // ────────────────────────────────────────────────
      result = await MFAService.verifyBackupCode(
        userId,
        'A1B2C3D4',
        ipAddress,
        userAgent,
      );
      
      // ────────────────────────────────────────────────
      // 5. Assert - Verify code is rejected (wrong position)
      // ────────────────────────────────────────────────
      expect(result).toBe(false);
    });

    it('should verify multiple space-separated codes against their respective indices', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data
      // ────────────────────────────────────────────────
      
      // ────────────────────────────────────────────────
      // 2. Act - Verify with multiple codes (first valid, second ignored)
      // ────────────────────────────────────────────────
      const result = await MFAService.verifyBackupCode(
        userId,
        'E5F6A7B8 WRONG',  // First code is at correct index (0), second is ignored
        ipAddress,
        userAgent,
      );

      // ────────────────────────────────────────────────
      // 3. Assert - Verify first code is accepted
      // ────────────────────────────────────────────────
      expect(result).toBe(true);
      expect(mockUser.update).toHaveBeenCalledWith({
        mfaBackupCodes: ['A1B2C3D4', 'C9D0E1F2'],
        mfaLastVerified: expect.any(Date),
      });
    });

    it('should fail when no code matches at the correct index', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data
      // ────────────────────────────────────────────────
      
      // ────────────────────────────────────────────────
      // 2. Act - Verify with invalid code
      // ────────────────────────────────────────────────
      const result = await MFAService.verifyBackupCode(
        userId,
        'WRONG',
        ipAddress,
        userAgent,
      );

      // ────────────────────────────────────────────────
      // 3. Assert - Verify failure is handled correctly
      // ────────────────────────────────────────────────
      expect(result).toBe(false);
      expect(mockUser.update).not.toHaveBeenCalled();
      expect(MFAAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'MFA_BACKUP_CODE_VERIFICATION_FAILED',
          ipAddress,
          userAgent,
        }),
      );
    });

    it('should throw an error when user has no backup codes', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - No backup codes set
      // ────────────────────────────────────────────────
      mockUser.mfaBackupCodes = null;

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        MFAService.verifyBackupCode(userId, 'E5F6A7B8', ipAddress, userAgent),
      ).rejects.toThrow(new AppError(404, 'No backup codes found for this user'));
    });
  });

  // --------------------------------------------------
  // enableMFA
  // --------------------------------------------------
  describe('enableMFA', () => {
    it('should enable MFA for a user', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data
      // ────────────────────────────────────────────────
      mockUser.mfaSecret = 'MOCKBASE32SECRET';
      mockUser.mfaEnabled = false;

      // ────────────────────────────────────────────────
      // 2. Act - Enable MFA
      // ────────────────────────────────────────────────
      await MFAService.enableMFA(userId, ipAddress, userAgent);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify MFA is enabled and logged
      // ────────────────────────────────────────────────
      expect(mockUser.update).toHaveBeenCalledWith({
        mfaEnabled: true,
        mfaLastVerified: expect.any(Date),
      });
      expect(MFAAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'MFA_ENABLED',
          ipAddress,
          userAgent,
        }),
      );
    });

    it('should throw an error if MFA secret is not set', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - No MFA secret set
      // ────────────────────────────────────────────────
      mockUser.mfaSecret = null;

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        MFAService.enableMFA(userId, ipAddress, userAgent),
      ).rejects.toThrow(new AppError(404, 'MFA not set up for this user'));
    });
  });

  // --------------------------------------------------
  // disableMFA
  // --------------------------------------------------
  describe('disableMFA', () => {
    it('should disable MFA for a user', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data
      // ────────────────────────────────────────────────
      mockUser.mfaEnabled = true;
      mockUser.mfaSecret = 'MOCKBASE32SECRET';
      mockUser.mfaBackupCodes = ['A1B2C3D4', 'E5F6A7B8'];
      mockUser.mfaLastVerified = new Date();

      // ────────────────────────────────────────────────
      // 2. Act - Disable MFA
      // ────────────────────────────────────────────────
      await MFAService.disableMFA(userId, ipAddress, userAgent);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify MFA is fully disabled
      // ────────────────────────────────────────────────
      expect(mockUser.update).toHaveBeenCalledWith({
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
        mfaLastVerified: null,
      });
      expect(MFAAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          action: 'MFA_DISABLED',
          ipAddress,
          userAgent,
        }),
      );
    });

    it('should throw an error if user is not found', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock user not found
      // ────────────────────────────────────────────────
      (User.findByPk as jest.Mock).mockResolvedValueOnce(null);

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        MFAService.disableMFA('nonexistent', ipAddress, userAgent),
      ).rejects.toThrow(new AppError(404, 'User not found'));
    });
  });

  // --------------------------------------------------
  // isMFARequired
  // --------------------------------------------------
  describe('isMFARequired', () => {
    it('should return true if MFA is enabled', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Enable MFA
      // ────────────────────────────────────────────────
      mockUser.mfaEnabled = true;

      // ────────────────────────────────────────────────
      // 2. Act - Check if MFA is required
      // ────────────────────────────────────────────────
      const result = await MFAService.isMFARequired(userId);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify MFA is required
      // ────────────────────────────────────────────────
      expect(result).toBe(true);
    });

    it('should return false if MFA is disabled', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Disable MFA
      // ────────────────────────────────────────────────
      mockUser.mfaEnabled = false;

      // ────────────────────────────────────────────────
      // 2. Act - Check if MFA is required
      // ────────────────────────────────────────────────
      const result = await MFAService.isMFARequired(userId);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify MFA is not required
      // ────────────────────────────────────────────────
      expect(result).toBe(false);
    });

    it('should return false if user is not found', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock user not found
      // ────────────────────────────────────────────────
      (User.findByPk as jest.Mock).mockResolvedValueOnce(null);

      // ────────────────────────────────────────────────
      // 2. Act - Check if MFA is required for non-existent user
      // ────────────────────────────────────────────────
      const result = await MFAService.isMFARequired('nonexistent');
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify MFA is not required for non-existent user
      // ────────────────────────────────────────────────
      expect(result).toBe(false);
    });
  });
});
