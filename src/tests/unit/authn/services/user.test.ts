import { UserService } from "@/authn/services/user";
import User from "@/authn/models/User";
import { comparePasswords, hashPassword } from "@/utils/password";
import { AppError } from "@/utils/response/appError";
import { Transaction } from "sequelize";
import { OrganizationUserService } from "@/organization/services/organizationUser";

// Mock the User model and password utilities
jest.mock("@/authn/models/User");
jest.mock("@/organization/services/organizationUser", () => ({
  OrganizationUserService: {
    updateOrganizationMembershipContactFields: jest.fn(),
    syncForm1HeadAuthorizedOfficialFromUserProfile: jest.fn(),
  },
}));

// Mock password utilities with actual implementations by default
jest.mock("@/utils/password", () => ({
  comparePasswords: jest.fn(),
  hashPassword: jest.fn()
}));

describe("UserService", () => {
  const mockTransaction = {} as Transaction;
  const mockUser = {
    id: "user-123",
    email: "ozturkgokalp000@gmail.com",
    password: "current-hash",
    name: "Test User",
    typeId: 1,
    isActive: true,
    mfaEnabled: false,
    is_email_verified: true,
    save: jest.fn()
  } as unknown as User;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================================================
  // updateProfile
  // ==================================================
  describe("updateProfile", () => {
    it("should update user profile with valid data", async () => {
      const userId = "user-123";
      const profileUpdate = {
        name: "Updated Name",
        organizationMemberships: [
          {
            organizationId: "org-1",
            title: "Director",
            phoneNumber: "+15551234567",
          },
        ],
      };

      await UserService.updateProfile(userId, profileUpdate);

      expect(User.update).toHaveBeenCalledWith(
        { name: "Updated Name" },
        { where: { id: userId } },
      );
      expect(OrganizationUserService.updateOrganizationMembershipContactFields).toHaveBeenCalledWith(
        userId,
        profileUpdate.organizationMemberships,
      );
      expect(OrganizationUserService.syncForm1HeadAuthorizedOfficialFromUserProfile).toHaveBeenCalledWith(
        userId,
        { name: "Updated Name" },
      );
    });

    it("should handle empty profile update", async () => {
      const userId = "user-123";
      const profileUpdate = {};

      await UserService.updateProfile(userId, profileUpdate);

      expect(User.update).not.toHaveBeenCalled();
      expect(OrganizationUserService.updateOrganizationMembershipContactFields).not.toHaveBeenCalled();
      expect(OrganizationUserService.syncForm1HeadAuthorizedOfficialFromUserProfile).not.toHaveBeenCalled();
    });

    it("should handle partial profile updates", async () => {
      const userId = "user-123";
      const profileUpdate = { name: "New Name Only" };

      await UserService.updateProfile(userId, profileUpdate);

      expect(User.update).toHaveBeenCalledWith(
        { name: "New Name Only" },
        { where: { id: userId } },
      );
      expect(OrganizationUserService.updateOrganizationMembershipContactFields).not.toHaveBeenCalled();
      expect(OrganizationUserService.syncForm1HeadAuthorizedOfficialFromUserProfile).toHaveBeenCalledWith(
        userId,
        profileUpdate,
      );
    });
  });

  // ==================================================
  // updatePassword
  // ==================================================
  describe("updatePassword", () => {
    const userId = "user-123";
    const currentPassword = "current-password";
    const newPassword = "new-password-123!";
    const newHashedPassword = "new-hashed-password";

    beforeEach(() => {
      (User.findOne as jest.Mock).mockResolvedValue(mockUser);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (hashPassword as jest.Mock).mockResolvedValue(newHashedPassword);
    });

    it("should update password when current password is correct", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Already set up in beforeEach
      // ────────────────────────────────────────────────
      
      // ────────────────────────────────────────────────
      // 2. Act - Update password
      // ────────────────────────────────────────────────
      await UserService.updatePassword(
        userId, 
        currentPassword, 
        newPassword, 
        mockTransaction
      );

      // ────────────────────────────────────────────────
      // 3. Assert - Verify password update flow
      // ────────────────────────────────────────────────
      expect(User.findOne).toHaveBeenCalledWith({
        where: { id: userId },
        transaction: mockTransaction
      });
      expect(comparePasswords).toHaveBeenCalledWith(currentPassword, mockUser.password);
      expect(hashPassword).toHaveBeenCalledWith(newPassword);
      expect(User.update).toHaveBeenCalledWith(
        { password: newHashedPassword },
        { 
          where: { id: userId },
          transaction: mockTransaction
        }
      );
    });

    it("should throw 404 error with correct properties when user is not found", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock user not found
      // ────────────────────────────────────────────────
      (User.findOne as jest.Mock).mockResolvedValueOnce(null);

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown with correct properties
      // ────────────────────────────────────────────────
      try {
        await UserService.updatePassword(userId, currentPassword, newPassword);
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.statusCode).toBe(404);
        expect(appError.message).toBe('User not found');
        expect(appError.internalMessage).toBeUndefined();
      }
    });

    it("should throw 401 error with correct properties when current password is incorrect", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock password comparison failure
      // ────────────────────────────────────────────────
      (comparePasswords as jest.Mock).mockResolvedValueOnce(false);

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown with correct properties
      // ────────────────────────────────────────────────
      try {
        await UserService.updatePassword(userId, "wrong-password", newPassword);
        fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.statusCode).toBe(401);
        expect(appError.message).toBe('Current password is incorrect');
        expect(appError.internalMessage).toBe('Attempted to update password with an incorrect current password');
      }
    });

    it("should handle very long passwords", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup very long password
      // ────────────────────────────────────────────────
      const veryLongPassword = 'a'.repeat(1000);
      const hashedLongPassword = 'hashed-very-long-password';
      (hashPassword as jest.Mock).mockResolvedValueOnce(hashedLongPassword);

      // ────────────────────────────────────────────────
      // 2. Act - Update with very long password
      // ────────────────────────────────────────────────
      await UserService.updatePassword(userId, currentPassword, veryLongPassword);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify password was hashed and stored
      // ────────────────────────────────────────────────
      expect(hashPassword).toHaveBeenCalledWith(veryLongPassword);
      expect(User.update).toHaveBeenCalledWith(
        { password: hashedLongPassword },
        { 
          where: { id: userId },
          transaction: undefined
        }
      );
    });

    // Removed test 'should reject empty passwords' as validation now occurs at controller layer.

    it("should handle special characters in passwords", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup password with special chars
      // ────────────────────────────────────────────────
      const specialCharPassword = 'p@ssw0rd!@#$%^&*()_+{}|:"<>?~`';
      const hashedSpecialPassword = 'hashed-special-password';
      (hashPassword as jest.Mock).mockResolvedValueOnce(hashedSpecialPassword);

      // ────────────────────────────────────────────────
      // 2. Act - Update with special character password
      // ────────────────────────────────────────────────
      await UserService.updatePassword(userId, currentPassword, specialCharPassword);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify special characters are handled
      // ────────────────────────────────────────────────
      expect(hashPassword).toHaveBeenCalledWith(specialCharPassword);
      expect(User.update).toHaveBeenCalledWith(
        { password: hashedSpecialPassword },
        { 
          where: { id: userId },
          transaction: undefined
        }
      );
    });

    it("should work without a transaction", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Already set up in beforeEach
      // ────────────────────────────────────────────────
      
      // ────────────────────────────────────────────────
      // 2. Act - Update password without transaction
      // ────────────────────────────────────────────────
      await UserService.updatePassword(userId, currentPassword, newPassword);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify update without transaction
      // ────────────────────────────────────────────────
      expect(User.update).toHaveBeenCalledWith(
        { password: newHashedPassword },
        { 
          where: { id: userId },
          transaction: undefined
        }
      );
    });
  });
});
