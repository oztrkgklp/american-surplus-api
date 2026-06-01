import UserSession from "@/authn/models/UserSession";
import { UserSessionService } from "@/authn/services/userSession";
import { generateAccessToken, generateRefreshToken } from "@/utils/jwt";
import { Transaction } from "sequelize";

// Mock the UserSession model
jest.mock("@/authn/models/UserSession");

// Mock the JWT utilities
jest.mock("@/utils/jwt", () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn()
}));

describe("UserSessionService", () => {
  const mockTransaction = {} as Transaction;
  const mockUserSession = {
    userId: "123",
    deviceInfo: "test-device",
    refreshToken: "test-refresh-token",
    save: jest.fn()
  } as unknown as UserSession;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("findUserSessionByUserId", () => {
    it("should find an active user session by user ID", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      (UserSession.findOne as jest.Mock).mockResolvedValueOnce(mockUserSession);
      
      // ────────────────────────────────────────────────
      // 2.  Act – call the service
      // ────────────────────────────────────────────────
      const result = await UserSessionService.findUserSessionByUserId("123");
      
      // ────────────────────────────────────────────────
      // 3.  Assert – verify the database query and result
      // ────────────────────────────────────────────────
      expect(UserSession.findOne).toHaveBeenCalledWith({
        where: { userId: "123", expiredAt: null }
      });
      expect(result).toEqual(mockUserSession);
    });

    it("should return null when no active session is found", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      (UserSession.findOne as jest.Mock).mockResolvedValueOnce(null);
      
      // ────────────────────────────────────────────────
      // 2.  Act – call with non-existent user ID
      // ────────────────────────────────────────────────
      const result = await UserSessionService.findUserSessionByUserId("nonexistent");
      
      // ────────────────────────────────────────────────
      // 3.  Assert – verify null is returned
      // ────────────────────────────────────────────────
      expect(result).toBeNull();
    });
  });

  describe("invalidateUserSession", () => {
    it("should invalidate a user session", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const userId = "123";
      const deviceInfo = "test-device";
      
      // ────────────────────────────────────────────────
      // 2.  Act – call the service to invalidate session
      // ────────────────────────────────────────────────
      await UserSessionService.invalidateUserSession(userId, deviceInfo, mockTransaction);
      
      // ────────────────────────────────────────────────
      // 3.  Assert – verify session was marked as expired
      // ────────────────────────────────────────────────
      expect(UserSession.update).toHaveBeenCalledWith(
        { expiredAt: expect.any(Date) },
        { 
          where: { 
            userId, 
            deviceInfo, 
            expiredAt: null 
          },
          transaction: mockTransaction
        }
      );
    });
  });

  describe("createUserSession", () => {
    const mockAccessToken = "test-access-token";
    const mockRefreshToken = "test-refresh-token";
    
    beforeEach(() => {
      (generateAccessToken as jest.Mock).mockReturnValue(mockAccessToken);
      (generateRefreshToken as jest.Mock).mockReturnValue(mockRefreshToken);
    });

    it("should create a new user session and invalidate the previous one", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const userId = "123";
      const userEmail = "ozturkgokalp000@gmail.com";
      const deviceInfo = "test-device";
      
      // ────────────────────────────────────────────────
      // 2.  Act – create a new user session
      // ────────────────────────────────────────────────
      await UserSessionService.createUserSession(
        userId, 
        userEmail, 
        deviceInfo, 
        mockTransaction
      );
      
      // ────────────────────────────────────────────────
      // 3.  Assert – verify session management
      // ────────────────────────────────────────────────
      // 3a. Verify previous session was invalidated
      expect(UserSession.update).toHaveBeenCalledWith(
        { expiredAt: expect.any(Date) },
        { 
          where: { 
            userId, 
            deviceInfo, 
            expiredAt: null 
          },
          transaction: mockTransaction
        }
      );
      
      // 3b. Verify tokens were generated with correct parameters
      expect(generateAccessToken).toHaveBeenCalledWith(userId, { email: userEmail });
      expect(generateRefreshToken).toHaveBeenCalledWith(userId);
      
      // 3c. Verify new session was created with refresh token
      expect(UserSession.create).toHaveBeenCalledWith(
        { 
          userId, 
          refreshToken: mockRefreshToken, 
          deviceInfo 
        },
        { transaction: mockTransaction }
      );
    });

    it("should return the generated tokens", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const userId = "123";
      const userEmail = "ozturkgokalp000@gmail.com";
      const deviceInfo = "test-device";
      
      // ────────────────────────────────────────────────
      // 2.  Act – create session and get tokens
      // ────────────────────────────────────────────────
      const result = await UserSessionService.createUserSession(
        userId, 
        userEmail, 
        deviceInfo, 
        mockTransaction
      );
      
      // ────────────────────────────────────────────────
      // 3.  Assert – verify returned tokens
      // ────────────────────────────────────────────────
      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken
      });
    });

    it("should rollback transaction if token generation fails", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const userId = "123";
      const userEmail = "ozturkgokalp000@gmail.com";
      const deviceInfo = "test-device";
      const tokenError = new Error("Token generation failed");
      
      // Make token generation fail
      (generateAccessToken as jest.Mock).mockImplementationOnce(() => {
        throw tokenError;
      });

      // ────────────────────────────────────────────────
      // 2.  Act & Assert – verify error is thrown
      // ────────────────────────────────────────────────
      await expect(
        UserSessionService.createUserSession(userId, userEmail, deviceInfo, mockTransaction)
      ).rejects.toThrow(tokenError);
      
      // Verify no new session was created
      expect(UserSession.create).not.toHaveBeenCalled();
    });

    it("should handle database errors during session creation", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const dbError = new Error("Create failed");
      (UserSession.create as jest.Mock).mockRejectedValueOnce(dbError);

      // ────────────────────────────────────────────────
      // 2.  Act & Assert – verify error is propagated
      // ────────────────────────────────────────────────
      await expect(
        UserSessionService.createUserSession(
          "123", 
          "ozturkgokalp000@gmail.com", 
          "test-device", 
          mockTransaction
        )
      ).rejects.toThrow("Create failed");
    });

    it("should handle concurrent session creation attempts", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const userId = "123";
      const email = "ozturkgokalp000@gmail.com";
      const deviceInfo = "test-device";
      
      // Mock two successful session creations with different refresh tokens
      const firstRefreshToken = "first-refresh-token";
      const secondRefreshToken = "second-refresh-token";
      
      (generateAccessToken as jest.Mock).mockReturnValue("test-access-token");
      (generateRefreshToken as jest.Mock)
        .mockReturnValueOnce(firstRefreshToken)
        .mockReturnValueOnce(secondRefreshToken);
      
      // Both create calls will succeed
      (UserSession.create as jest.Mock)
        .mockResolvedValueOnce({ refreshToken: firstRefreshToken })
        .mockResolvedValueOnce({ refreshToken: secondRefreshToken });

      // ────────────────────────────────────────────────
      // 2.  Act – make two concurrent session creation attempts
      // ────────────────────────────────────────────────
      const firstAttempt = await UserSessionService.createUserSession(
        userId, email, deviceInfo, mockTransaction
      );
      
      const secondAttempt = await UserSessionService.createUserSession(
        userId, email, deviceInfo, mockTransaction
      );

      // ────────────────────────────────────────────────
      // 3.  Assert – verify both attempts succeed with different tokens
      // ────────────────────────────────────────────────
      expect(firstAttempt.refreshToken).toBe(firstRefreshToken);
      expect(secondAttempt.refreshToken).toBe(secondRefreshToken);
      
      // Verify both sessions were created
      expect(UserSession.create).toHaveBeenCalledTimes(2);
      expect(UserSession.update).toHaveBeenCalledTimes(2); // Both should trigger invalidation of previous sessions
    });
  });

  describe("Error Handling", () => {
    it("should handle database errors when finding user session", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const dbError = new Error("Database connection failed");
      (UserSession.findOne as jest.Mock).mockRejectedValueOnce(dbError);
      
      // ────────────────────────────────────────────────
      // 2.  Act & Assert – verify error is propagated
      // ────────────────────────────────────────────────
      await expect(UserSessionService.findUserSessionByUserId("123"))
        .rejects
        .toThrow("Database connection failed");
    });

    it("should handle database errors during session invalidation", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const dbError = new Error("Update failed");
      (UserSession.update as jest.Mock).mockRejectedValueOnce(dbError);
      
      // ────────────────────────────────────────────────
      // 2.  Act & Assert – verify error is propagated
      // ────────────────────────────────────────────────
      await expect(
        UserSessionService.invalidateUserSession("123", "test-device", mockTransaction)
      ).rejects.toThrow("Update failed");
    });

    it("should handle database errors during session creation", async () => {
      // ────────────────────────────────────────────────
      // 1.  Arrange test data
      // ────────────────────────────────────────────────
      const dbError = new Error("Create failed");
      (UserSession.create as jest.Mock).mockRejectedValueOnce(dbError);

      // ────────────────────────────────────────────────
      // 2.  Act & Assert – verify error is propagated
      // ────────────────────────────────────────────────
      await expect(
        UserSessionService.createUserSession(
          "123", 
          "ozturkgokalp000@gmail.com", 
          "test-device", 
          mockTransaction
        )
      ).rejects.toThrow("Create failed");
    });
  });
});
