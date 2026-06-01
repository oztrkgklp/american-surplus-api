/**
 * @file Authentication Service Tests
 * @description Unit tests for the authentication service layer
 * @module authn/services/authentication.test
 */

// ────────────────────────────────────────────────
// 1. Import Dependencies
// ────────────────────────────────────────────────
import { AppError } from "@/utils/response/appError";
import { AuthService } from "@/authn/services/authentication";
import { hashPassword, comparePasswords } from "@/utils/password";
import { verifyAccessToken, generateAccessToken, generateRefreshToken } from "@/utils/jwt";
import { UserSessionService } from "@/authn/services/userSession";
import { loginSchema, creationSchema } from "@/authn/schemas/userSchema";
import { v4 as uuidv4 } from 'uuid';
import { MFAService } from "@/authn/services/mfa";
import { emailQueue } from "@/utils/mail/emailQueue";
import { renderEmail } from "@/utils/mail/render";
import { ScopeType } from "@/enums/scope.enum";
import { Model } from 'sequelize';
import { getDeviceInfoString } from "@/utils/userAgentParser";
import UserScope from '@/authz/models/UserScope';
import Role from '@/authz/models/Role';
import RolePermission from '@/authz/models/RolePermission';
import Permission from '@/authz/models/Permission';
import Scope from '@/authz/models/Scope';
import OrganizationUser from '@/organization/models/OrganizationUser';
import Organization from '@/organization/models/Organization';
import SaspUser from '@/sasp/models/SaspUsers.entity';
import State from '@/states/models/State';
import DoneeAccount from '@/organization/models/DoneeAccount';

// ────────────────────────────────────────────────
// 2. Mock Dependencies
// ────────────────────────────────────────────────
// Mock external dependencies to isolate tests and control their behavior
// Note: We keep real crypto helpers but wrap them in mocks to track calls
jest.mock("@/utils/password", () => {
  const real = jest.requireActual("@/utils/password");
  return {
    ...real,
    hashPassword: jest.fn(real.hashPassword), // spy while keeping real logic
    comparePasswords: jest.fn(real.comparePasswords),
  };
});
jest.mock("@/utils/jwt"); // Use a simple mock, implementation will be provided in beforeEach
jest.mock("@/authn/services/userSession");
jest.mock("@/authn/services/mfa");
jest.mock("@/utils/mail/emailQueue", () => ({
  emailQueue: {
    add: jest.fn().mockResolvedValue({}),
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  }
}));
jest.mock("@/utils/mail/render", () => ({
  renderEmail: jest.fn().mockResolvedValue("<html>Test email</html>")
}));
jest.mock("@/utils/userAgentParser", () => ({
  getDeviceInfoString: jest.fn().mockReturnValue('test-device'),
}));
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-verification-token')
}));

// Mock the User model with an inline definition to avoid hoisting issues
jest.mock('@/authn/models/User', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    update: jest.fn(function (this: any, data: any) { Object.assign(this, data); return Promise.resolve(this); }),
    $set: jest.fn(),
    $add: jest.fn(),
    $get: jest.fn(),
    $count: jest.fn(),
    $create: jest.fn(),
    $has: jest.fn(),
    $remove: jest.fn(),
    $addScope: jest.fn(),
    $getScopes: jest.fn(),
    $hasScope: jest.fn(),
    $removeScope: jest.fn(),
  },
}));

// Import the mocked User model after setting up the mock
import User from '@/authn/models/User';

// Create a typed reference to the mocked User model
const mockUserModel = User as jest.Mocked<typeof User>;

// Mock the UserScope model
jest.mock('@/authz/models/UserScope', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
  },
}));

// Mock MFAAuditLog model to prevent database connection attempts
jest.mock('@/authn/models/MFAAuditLog', () => ({
  MFAAuditLog: {
    init: jest.fn(),
    belongsTo: jest.fn(),
  }
}));

// ────────────────────────────────────────────────
// 3. Setup Test Data
// ────────────────────────────────────────────────
// Create a typed reference to the mocked User model

// Extend existing mock for UserSessionService to include invalidateUserSession
(UserSessionService.invalidateUserSession as jest.Mock) = jest.fn();

// ────────────────────────────────────────────────
// 4. Test Data
// ────────────────────────────────────────────────
// Define constants used across multiple test cases
const userId = 'c4f1be03-023c-4564-aa32-b9c55a581d53';
const email = 'ozturkgokalp000@gmail.com';
const password = 'password';
const hashedPassword = 'hashedpassword';
const verificationCode = '123456';
const jwtToken = 'test.jwt.token';

// Helper to create a mock model instance
const createMockModel = <T extends {}>(data: T): T & Model => ({
  ...data,
  isNewRecord: false,
  _model: null as any,
  _options: {},
  _schema: '',
  _$modelOptions: {},
  _hasPrimaryKey: true,
  _isInitialized: true,
  _isSoftDeleted: false,
  _changed: new Set(),
  _previousDataValues: {},
  _changedDataValues: {},
  dataValues: data,
  getDataValue: jest.fn(<K extends keyof T>(key: K) => data[key]),
  setDataValue: jest.fn(<K extends keyof T>(key: K, value: T[K]) => {
    data[key] = value;
  }),
  // Add other Model methods as needed
  toJSON: jest.fn(() => data),
  save: jest.fn(),
  reload: jest.fn(),
  update: jest.fn(function (this: any, data: any) { Object.assign(this, data); return Promise.resolve(this); }),
  destroy: jest.fn(),
  // Add other Model methods that might be needed
} as any);

describe("AuthService", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockUserModel.findOne.mockResolvedValue(null);
    mockUserModel.findByPk.mockImplementation((id) => {
      if (id === userId) {
        return Promise.resolve(createMockModel({
          id: userId,
          email: 'ozturkgokalp000@gmail.com',
          isActive: true,
          userScopes: []
        }));
      }
      return Promise.resolve(null);
    });
    mockUserModel.create.mockImplementation((data) => Promise.resolve(
      createMockModel({
        id: userId,
        ...data,
      })
    ));
    
    // Default verifyAccessToken mock
    (verifyAccessToken as jest.Mock).mockImplementation((token: string) => {
      if (token !== jwtToken) {
        throw new Error('Invalid token');
      }
      return { sub: userId, scopeId: '1' };
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe("validateToken", () => {
    const mockUser = createMockModel({
      id: userId,
      email: 'ozturkgokalp000@gmail.com',
      isActive: true,
      userScopes: [{
        id: 1,
        scope: { 
          dataValues: { 
            id: 1, 
            type: ScopeType.ORGANIZATION, 
            name: 'Org' 
          }, 
          type: ScopeType.ORGANIZATION 
        },
        role: {
          rolePermissions: [
            { Permission: { identifier: 'sasp_manage_settings' } },
            { Permission: { identifier: 'sasp_manage_sasp_users' } },
          ],
        },
        organizationUser: { 
          is_active: true, 
          organizationId: 'org1', 
          organization: { 
            id: 'org1', 
            name: 'Org' 
          } 
        },
        doneeAccount: null,
        saspUser: null,
      }]
    });

    it("should get token from Authorization header when cookies.accessToken is missing", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      mockUserModel.findByPk.mockResolvedValueOnce(mockUser);

      const req = {
        headers: { 
          authorization: `Bearer ${jwtToken}`,
          'user-scope-id': '1'
        },
        cookies: {},
        query: {}
      } as any;

      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const result = await AuthService.validateToken(req);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      expect(result.id).toBe(userId);
      expect(verifyAccessToken).toHaveBeenCalledWith(jwtToken);
    });

    it("should throw error when token is missing", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const req = {
        headers: {},
        cookies: {},
        query: {}
      } as any;

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown with correct details
      // ────────────────────────────────────────────────
      await expect(AuthService.validateToken(req))
        .rejects.toThrow('Unauthenticated');
      
      // Verify the error details
      try {
        await AuthService.validateToken(req);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.statusCode).toBe(401);
        expect(appError.message).toBe('Unauthenticated');
        expect(appError.internalMessage).toBe('Token missing');
      }
    });

    it("should throw error when token is invalid or missing sub", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks for invalid token case
      // ────────────────────────────────────────────────
      (verifyAccessToken as jest.Mock).mockRejectedValueOnce(
        new AppError(401, "Something went wrong in the authentication process. Please try again.", 'An invalid token was presented')
      );

      const req = {
        cookies: { accessToken: 'invalid-token' },
        headers: {},
        query: {}
      } as any;

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify invalid token error
      // ────────────────────────────────────────────────
      await expect(AuthService.validateToken(req))
        .rejects.toThrow('Something went wrong in the authentication process. Please try again.');
      
      // ────────────────────────────────────────────────
      // 3. Arrange - Setup test for missing sub in token
      // ────────────────────────────────────────────────
      (verifyAccessToken as jest.Mock).mockResolvedValueOnce({});
      
      // ────────────────────────────────────────────────
      // 4. Act & Assert - Verify missing sub error
      // ────────────────────────────────────────────────
      await expect(AuthService.validateToken(req))
        .rejects.toThrow('Unauthenticated');
    });

    it("should throw error when user not found", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      (verifyAccessToken as jest.Mock).mockResolvedValue({ sub: userId });
      mockUserModel.findByPk.mockResolvedValue(null as any);

      const req = { headers: { authorization: `Bearer ${jwtToken}` }, cookies: {} } as any;
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown when user not found
      // ────────────────────────────────────────────────
      await expect(AuthService.validateToken(req)).rejects.toThrow("Unauthenticated");
    });

    it("should throw error when user is inactive", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const inactiveUser = { id: userId, isActive: false };
      (verifyAccessToken as jest.Mock).mockResolvedValue({ sub: userId });
      mockUserModel.findByPk.mockResolvedValue(inactiveUser as any);

      const req = { headers: { authorization: `Bearer ${jwtToken}` }, cookies: {} } as any;
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown for inactive user
      // ────────────────────────────────────────────────
      await expect(AuthService.validateToken(req)).rejects.toThrow("Unauthenticated");
    });

    it("should throw error when verifyAccessToken throws", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      (verifyAccessToken as jest.Mock).mockImplementation(() => { throw new Error('jwt expired'); });
      const req = { headers: { authorization: `Bearer ${jwtToken}` }, cookies: {} } as any;
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Verify error is thrown when token verification fails
      // ────────────────────────────────────────────────
      await expect(AuthService.validateToken(req)).rejects.toThrow();
    });
  });

  describe("validateToken scope processing", () => {
    const jwtTokenScopes = "scopes-token";
    const userIdScopes = "user-with-scopes";

    beforeEach(() => {
      (verifyAccessToken as jest.Mock).mockImplementation(t => {
        if (t !== jwtTokenScopes) throw new Error("Invalid token");
        return { sub: userIdScopes } as any;
      });
    });

    function buildUserScope({ id, isOrgActive = true, isSaspActive = true }: { id: number; isOrgActive?: boolean; isSaspActive?: boolean; }) {
      return {
        id,
        scope: { type: ScopeType.ORGANIZATION, dataValues: {} },
        role: {
          rolePermissions: [
            { Permission: { identifier: "sasp_manage_settings" } },
          ],
        },
        organizationUser: {
          organizationId: 10,
          organization: { name: "Test Org" },
          is_active: isOrgActive,
        },
        saspUser: { is_active: isSaspActive },
      } as any;
    }

    it("filters out inactive scopes and sets isActive correctly from header", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const mockUser = {
        id: userIdScopes,
        email: "ozturkgokalp000@gmail.com",
        name: "Scopes User",
        isActive: true,
        userScopes: [
          buildUserScope({ id: 1, isOrgActive: true }), // active and selected
          buildUserScope({ id: 2, isOrgActive: true }), // same org, will inherit active flag
          buildUserScope({ id: 3, isOrgActive: false }), // inactive, should be filtered
        ],
        save: jest.fn(),
      } as any;

      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = {
        headers: { authorization: `Bearer ${jwtTokenScopes}`, "user-scope-id": "1" },
        cookies: {},
        query: {},
      } as any;

      const user = await AuthService.validateToken(req);

      // ────────────────────────────────────────────────
      // 2. Assert - Verify the results
      // ────────────────────────────────────────────────
      const scopes: any[] = (user as any).scopes;
      expect(scopes).toHaveLength(2);

      const scope1 = scopes.find(s => s.id === 1)!;
      const scope2 = scopes.find(s => s.id === 2)!;
      expect(scope1).toBeDefined();
      expect(scope2).toBeDefined();
      expect(scope1.isActive).toBe(true);
      expect(scope2.isActive).toBe(true); // inherits active via same organizationId
      // ensure permission mapping propagated
      expect(scope1.permissions.sasp_manage_settings).toBe(true);
    });

    it("derives activeScopeId from query param when header absent", async () => {
      const mockUser = {
        id: userIdScopes,
        email: "ozturkgokalp000@gmail.com",
        name: "Scopes2 User",
        isActive: true,
        userScopes: [buildUserScope({ id: 5 })],
        save: jest.fn(),
      } as any;
      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = {
        headers: { authorization: `Bearer ${jwtTokenScopes}` },
        cookies: {},
        query: { userScopeId: "5" },
      } as any;

      const user = await AuthService.validateToken(req);
      const scopes: any[] = (user as any).scopes;
      expect(scopes).toHaveLength(1);
      expect(scopes[0].isActive).toBe(true);
    });

    it("filters out inactive DONEE scopes", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const userIdDonee = "user-donee";
      const jwtTokenDonee = "donee-token";

      (verifyAccessToken as jest.Mock).mockImplementation(t => {
        if (t !== jwtTokenDonee) throw new Error("Invalid token");
        return { sub: userIdDonee } as any;
      });

      const doneeScopeInactive = {
        id: 11,
        scope: { type: ScopeType.DONEE, dataValues: {} },
        role: {
          rolePermissions: [
            { Permission: { identifier: "donee_manage" } },
          ],
        },
        organizationUser: {
          organizationId: 30,
          organization: { name: "Donee Org" },
          is_active: false,
        },
        doneeAccount: {
          id: 99,
          name: "Donee Account",
          organization: { id: 30, name: "Donee Org" },
          stateId: 7,
        },
      } as any;

      const mockUser = {
        id: userIdDonee,
        email: "ozturkgokalp000@gmail.com",
        name: "Donee User",
        isActive: true,
        userScopes: [doneeScopeInactive],
        save: jest.fn(),
      } as any;

      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = {
        headers: { authorization: `Bearer ${jwtTokenDonee}` },
        cookies: {},
        query: {},
      } as any;

      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const user = await AuthService.validateToken(req);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      const scopes: any[] = (user as any).scopes;
      expect(scopes).toHaveLength(0);
    });

    it("filters out inactive SASP scopes", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const userIdSasp = "user-sasp";
      const jwtTokenSasp = "sasp-token";
      (verifyAccessToken as jest.Mock).mockImplementation(t => {
        if (t !== jwtTokenSasp) throw new Error("Invalid token");
        return { sub: userIdSasp } as any;
      });

      const saspScopeInactive = {
        id: 22,
        scope: { type: ScopeType.SASP, dataValues: {} },
        role: {
          rolePermissions: [
            { Permission: { identifier: "sasp_manage_inventory" } },
          ],
        },
        saspUser: {
          is_active: false,
          state: { stateId: 12, stateName: "TestState" },
        },
      } as any;

      const mockUser = {
        id: userIdSasp,
        email: "ozturkgokalp000@gmail.com",
        name: "Sasp User",
        isActive: true,
        userScopes: [saspScopeInactive],
        save: jest.fn(),
      } as any;

      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = {
        headers: { authorization: `Bearer ${jwtTokenSasp}` },
        cookies: {},
        query: {},
      } as any;

      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const user = await AuthService.validateToken(req);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      const scopes: any[] = (user as any).scopes;
      expect(scopes).toHaveLength(0);
    });
  });

  describe("validateToken scope processing additional coverage", () => {
    it("covers all inactive scope branches (ORG, DONEE, SASP)", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const userIdAll = "user-all-inactive";
      const jwtTokenAll = "all-inactive-token";

      (verifyAccessToken as jest.Mock).mockImplementation(t => {
        if (t !== jwtTokenAll) throw new Error("Invalid token");
        return { sub: userIdAll } as any;
      });

      const orgInactive = {
        id: 101,
        scope: { type: ScopeType.ORGANIZATION, dataValues: {} },
        role: { rolePermissions: [] },
        organizationUser: {
          organizationId: 41,
          organization: { name: "Org Inc" },
          is_active: false,
        },
      } as any;

      const doneeInactive = {
        id: 102,
        scope: { type: ScopeType.DONEE, dataValues: {} },
        role: { rolePermissions: [] },
        organizationUser: {
          organizationId: 42,
          organization: { name: "Donee Org" },
          is_active: false,
        },
        doneeAccount: {
          id: 5,
          name: "Donee Acc",
          organization: { id: 42, name: "Donee Org" },
          stateId: 9,
        },
      } as any;

      const saspInactive = {
        id: 103,
        scope: { type: ScopeType.SASP, dataValues: {} },
        role: { rolePermissions: [] },
        saspUser: {
          is_active: false,
          state: { stateId: 10, stateName: "SaspState" },
        },
      } as any;

      const mockUser = {
        id: userIdAll,
        email: "ozturkgokalp000@gmail.com",
        name: "All Inactive",
        isActive: true,
        userScopes: [orgInactive, doneeInactive, saspInactive],
        save: jest.fn(),
      } as any;

      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = {
        headers: { authorization: `Bearer ${jwtTokenAll}` },
        cookies: {},
        query: {},
      } as any;

      const user = await AuthService.validateToken(req);
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      expect((user as any).scopes).toHaveLength(0);
    });
  });

  describe("validateToken scope processing active branches", () => {
    it("keeps active DONEE scope", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const userId = "user-donee-active";
      const jwtToken = "token-donee-active";
      (verifyAccessToken as jest.Mock).mockImplementation(t => {
        if (t !== jwtToken) throw new Error("Invalid token");
        return { sub: userId } as any;
      });

      const doneeActive = {
        id: 55,
        scope: { type: ScopeType.DONEE, dataValues: {} },
        role: { rolePermissions: [] },
        organizationUser: {
          organizationId: 70,
          organization: { name: "OrgA" },
          is_active: true,
        },
        doneeAccount: {
          id: 77,
          name: "DoneeA",
          organization: { id: 70, name: "OrgA" },
          stateId: 1,
        },
      } as any;

      const mockUser = {
        id: userId,
        email: "ozturkgokalp000@gmail.com",
        name: "Donee Active",
        isActive: true,
        userScopes: [doneeActive],
        save: jest.fn(),
      } as any;
      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = { headers: { authorization: `Bearer ${jwtToken}`, "user-scope-id": "55" }, cookies: {}, query: {} } as any;

      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const user = await AuthService.validateToken(req);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      expect((user as any).scopes).toHaveLength(1);
    });

    it("keeps active SASP scope", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const userId = "user-sasp-active";
      const jwtToken = "token-sasp-active";
      (verifyAccessToken as jest.Mock).mockImplementation(t => {
        if (t !== jwtToken) throw new Error("Invalid token");
        return { sub: userId } as any;
      });

      const saspActive = {
        id: 66,
        scope: { type: ScopeType.SASP, dataValues: {} },
        role: { rolePermissions: [] },
        saspUser: {
          is_active: true,
          state: { stateId: 2, stateName: "StateB" },
        },
      } as any;

      const mockUser = {
        id: userId,
        email: "ozturkgokalp000@gmail.com",
        name: "Sasp Active",
        isActive: true,
        userScopes: [saspActive],
        save: jest.fn(),
      } as any;
      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = { 
        headers: { 
          authorization: `Bearer ${jwtToken}`, 
          "user-scope-id": "66" 
        }, 
        cookies: {}, 
        query: {} 
      } as any;

      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const user = await AuthService.validateToken(req);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      expect((user as any).scopes).toHaveLength(1);
    });

    it("keeps active ORGANIZATION scope", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const userId = "user-org-active";
      const jwtToken = "token-org-active";
      (verifyAccessToken as jest.Mock).mockImplementation(t => {
        if (t !== jwtToken) throw new Error("Invalid token");
        return { sub: userId } as any;
      });

      const orgActive = {
        id: 88,
        scope: { type: ScopeType.ORGANIZATION, dataValues: {} },
        role: { rolePermissions: [] },
        organizationUser: {
          organizationId: 200,
          organization: { id: 'org-1', name: "Org" },
          is_active: true,
        },
      } as any;

      const mockUser = {
        id: userId,
        email: "ozturkgokalp000@gmail.com",
        name: "Org Active",
        isActive: true,
        userScopes: [orgActive],
        save: jest.fn(),
      } as any;
      mockUserModel.findByPk.mockResolvedValue(mockUser);

      const req = { headers: { authorization: `Bearer ${jwtToken}`, "user-scope-id": "88" }, cookies: {}, query: {} } as any;

      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const user = await AuthService.validateToken(req);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      const scopes: any[] = (user as any).scopes;
      expect(scopes).toHaveLength(1);
      expect(scopes[0].id).toBe(88);
    });
  });

  describe("validateToken", () => {
    const mockDecodedToken = {
      sub: 'test-user-id',
      email: 'ozturkgokalp000@gmail.com',
      scopes: ['user:read']
    };
    
    const baseReqWithToken = {
      cookies: { accessToken: jwtToken },
      headers: { 'user-scope-id': '1', authorization: `Bearer ${jwtToken}` },
      query: {}
    } as any;

    it("should map scopes and return user when token and scopes are valid", async () => {
      // Build a mock scope hierarchy
      const userScope = {
        id: 1,
        scope: { dataValues: { id: 1, type: ScopeType.ORGANIZATION, name: 'Org' }, type: ScopeType.ORGANIZATION },
        role: {
          rolePermissions: [
            { Permission: { identifier: 'sasp_manage_settings' } },
            { Permission: { identifier: 'sasp_manage_sasp_users' } },
          ],
        },
        organizationUser: { is_active: true, organizationId: 'org1', organization: { id: 'org1', name: 'Org' } },
        doneeAccount: null,
        saspUser: null,
      } as any;

      const mockUserFull = {
        id: userId,
        isActive: true,
        userScopes: [userScope],
      } as any;

      jest.spyOn(AuthService, 'findUserById').mockResolvedValue(mockUserFull);

      const res = await AuthService.validateToken(baseReqWithToken as any);
      const resAny = res as any;
      expect(resAny.scopes!.length).toBe(1);
      // Expect mapped permission flags to exist
      expect(resAny.scopes![0].permissions.sasp_manage_settings).toBe(true);
    });
  });

  describe("logoutUser", () => {
    const deviceInfo = "test-device-info";
    const userId = "logout-user-id";

    beforeAll(() => {
      (getDeviceInfoString as jest.Mock).mockReturnValue(deviceInfo);
    });

    it("should invalidate user session with correct parameters", async () => {
      // Arrange
      const req = { user: { id: userId } } as any;

      // Act
      await AuthService.logoutUser(req);

      // Assert
      expect(UserSessionService.invalidateUserSession).toHaveBeenCalledWith(
        userId,
        deviceInfo
      );
    });

    it("should throw 401 if user ID is missing", async () => {
      // Arrange
      const req = { user: {} } as any;

      // Act & Assert
      await expect(AuthService.logoutUser(req)).rejects.toThrow("Unauthenticated");
    });
  });

  describe("createUser", () => {
    const userData = {
      name: "New User",
      email: "ozturkgokalp000@gmail.com",
      password: "Password123!",
      passwordConfirm: "Password123!",
    };

    it("should create a new user", async () => {
      const mockUser = {
        id: userId,
        email: userData.email,
        name: userData.name,
        password: 'hashedpassword',
        typeId: 1,
        is_email_verified: false,
        mfaEnabled: false,
        save: jest.fn().mockResolvedValue(true),
        update: jest.fn(function (this: any, data: any) { Object.assign(this, data); return Promise.resolve(this); }) // Added mocked update method
      };

      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(mockUser as any);
      (renderEmail as jest.Mock).mockResolvedValue("<html>Verify your email</html>");

      const result = await AuthService.createUser(userData as any, 1);

      expect(result).toEqual(expect.objectContaining({
        id: userId,
        email: userData.email,
        name: userData.name
      }));
      expect(mockUserModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: userData.email,
          name: userData.name,
          typeId: 1,
          is_email_verified: false,
          mfaEnabled: false
        }),
        expect.any(Object)
      );
      expect(hashPassword).toHaveBeenCalledWith("Password123!");
    });

    it("should throw error if user already exists", async () => {
      const existingUser = createMockModel({
        id: "existing-user",
        email: userData.email,
        name: "Existing User"
      });
      
      mockUserModel.findOne.mockResolvedValue(existingUser);

      // Act & Assert
      await expect(AuthService.createUser(userData as any, 1))
        .rejects.toThrow("User already exists");
    });

    it("should throw error for case-insensitive duplicate email", async () => {
      const existingUser = { email: 'ozturkgokalp000@gmail.com' };
      mockUserModel.findOne.mockResolvedValue(existingUser as any);

      const duplicateUserData = {
        name: "Duplicate User",
        email: "ozturkgokalp000@gmail.com",
        password: "Password123!",
        passwordConfirm: "Password123!",
      } as any;

      await expect(AuthService.createUser(duplicateUserData, 1)).rejects.toThrow('User already exists');
    });
  });

  describe("createUser validation", () => {
    it("should throw validation error for mismatched passwords", async () => {
      const invalidData = {
        name: "Bad User",
        email: "ozturkgokalp000@gmail.com",
        password: "Password123!",
        passwordConfirm: "Different123!",
      } as any;

      await expect(AuthService.createUser(invalidData, 1)).rejects.toThrow();
    });
  });

  describe("loginUser", () => {
    // ────────────────────────────────────────────────
    // 1. Arrange - Setup test data and mocks
    // ────────────────────────────────────────────────
    const email = "ozturkgokalp000@gmail.com";
    const password = "password123";
    const hashedPassword = "hashedPassword";
    const verificationCode = "123456";
    const mockUser = {
      id: userId,
      name: "Test User",
      email,
      password: hashedPassword,
      is_email_verified: true,
      mfaEnabled: false,
      verification_code: verificationCode,
      verification_code_expiry: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      save: jest.fn().mockResolvedValue(true),
      update: jest.fn(function (this: any, data: any) { Object.assign(this, data); return Promise.resolve(this); }) // Added mocked update method
    };

    beforeEach(() => {
      (comparePasswords as jest.Mock).mockReset();
      mockUserModel.findOne.mockReset();
    });

    it("should login user with valid credentials", async () => {
      mockUserModel.findOne.mockResolvedValue(mockUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);

      const result = await AuthService.loginUser({
        body: { email, password, verificationCode }
      } as any);

      expect(result.id).toBe(userId);
      expect(comparePasswords).toHaveBeenCalledWith(password, hashedPassword);
    });

    it("should require MFA when enabled", async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };
      
      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);

      const result = await AuthService.loginUser({
        body: { email, password }
      } as any);

      expect(result).toHaveProperty('requiresMFA', true);
    });

    it("should throw error when mfaToken is invalid", async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };

      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (MFAService.verifyMFAToken as jest.Mock).mockResolvedValue(false);

      const badReq = {
        body: { email, password, mfaToken: "123456" },
        ip: "127.0.0.1",
        headers: { "user-agent": "jest" },
      } as any;

      await expect(AuthService.loginUser(badReq)).rejects.toThrow("Invalid MFA code");
    });

    it("should throw error when backupCode is invalid", async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };

      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (MFAService.verifyBackupCode as jest.Mock).mockResolvedValue(false);

      const badReq = {
        body: { email, password, backupCode: "BADCODE" },
        ip: "127.0.0.1",
        headers: { "user-agent": "jest" },
      } as any;

      await expect(AuthService.loginUser(badReq)).rejects.toThrow("Invalid MFA code");
    });

    it("should login when mfaToken is valid", async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };
      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (MFAService.verifyMFAToken as jest.Mock).mockResolvedValue(true);

      const goodReq = {
        body: { email, password, mfaToken: "123456" },
        ip: "127.0.0.1",
        headers: { "user-agent": "jest" },
      } as any;

      const res = await AuthService.loginUser(goodReq);
      expect(res.requiresMFA).toBe(false);
      expect(MFAService.verifyMFAToken).toHaveBeenCalledWith(mfaUser.id, "123456", goodReq.ip, goodReq.headers["user-agent"]);
    });

    it("should login when backupCode is valid", async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };
      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (MFAService.verifyBackupCode as jest.Mock).mockResolvedValue(true);

      const goodReq = {
        body: { email, password, backupCode: "BACKUP-CODE" },
        ip: "127.0.0.1",
        headers: { "user-agent": "jest" },
      } as any;

      const res = await AuthService.loginUser(goodReq);
      expect(res.requiresMFA).toBe(false);
      expect(MFAService.verifyBackupCode).toHaveBeenCalledWith(mfaUser.id, "BACKUP-CODE", goodReq.ip, goodReq.headers["user-agent"]);
    });

    it("should call verifyMFAToken with correct parameters and succeed", async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };

      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);

      const verifySpy = (MFAService.verifyMFAToken as jest.Mock).mockResolvedValue(true);

      const req = {
        body: { email, password, mfaToken: "999999" },
        ip: "127.0.0.1",
        headers: { "user-agent": "jest" },
      } as any;

      const result = await AuthService.loginUser(req);
      expect(verifySpy).toHaveBeenCalledWith(mfaUser.id, "999999", req.ip, req.headers["user-agent"]);
      expect(result.requiresMFA).toBe(false);
    });

    it("should call verifyMFAToken with blank ip and user-agent when absent", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const mfaUser = { ...mockUser, mfaEnabled: true };
      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (MFAService.verifyMFAToken as jest.Mock).mockResolvedValue(true);

      const req = {
        body: { email, password, mfaToken: "444555" },
        headers: {},
      } as any; // ip undefined, headers missing user-agent

      await AuthService.loginUser(req);
      expect(MFAService.verifyMFAToken).toHaveBeenCalledWith(mfaUser.id, "444555", "", "");
    });

    it("should call verifyBackupCode with blank ip and user-agent when absent", async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true };
      mockUserModel.findOne.mockResolvedValue(mfaUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      (MFAService.verifyBackupCode as jest.Mock).mockResolvedValue(true);

      const req = {
        body: { email, password, backupCode: "XYZ123" },
        headers: {},
      } as any;

      await AuthService.loginUser(req);
      expect(MFAService.verifyBackupCode).toHaveBeenCalledWith(mfaUser.id, "XYZ123", "", "");
    });
  });

  describe("loginUser error paths", () => {
    // ────────────────────────────────────────────────
    // 1. Arrange - Setup test data and mocks
    // ────────────────────────────────────────────────
    const baseReq = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } } as any;

    const mockUser = {
      id: userId,
      email,
      password: hashedPassword,
      name: "Test User",
      is_email_verified: true,
      mfaEnabled: false,
      verification_code: verificationCode,
      verification_code_expiry: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      save: jest.fn().mockResolvedValue(true),
      update: jest.fn(function (this: any, data: any) { Object.assign(this, data); return Promise.resolve(this); }) // Added mocked update method
    };

    it("should throw when user not found", async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      const req = { ...baseReq, body: { email, password } } as any;
      await expect(AuthService.loginUser(req)).rejects.toThrow("Invalid email or password");
    });

    it("should throw when password mismatch", async () => {
      mockUserModel.findOne.mockResolvedValue({ ...mockUser, password: 'different' } as any);
      (comparePasswords as jest.Mock).mockResolvedValue(false);
      const req = { ...baseReq, body: { email, password } } as any;
      await expect(AuthService.loginUser(req)).rejects.toThrow("Invalid email or password");
    });

    it("should throw when email not verified", async () => {
      mockUserModel.findOne.mockResolvedValue({ ...mockUser, is_email_verified: false } as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      const req = { ...baseReq, body: { email, password } } as any;
      await expect(AuthService.loginUser(req)).rejects.toThrow('You must verify email to login');
    });

    it("should send verification code when missing and mfa disabled", async () => {
      mockUserModel.findOne.mockResolvedValue({ ...mockUser, mfaEnabled: false } as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);
      const res = await AuthService.loginUser({ ...baseReq, body: { email, password } } as any);
      expect(res.requiresVerification).toBe(true);
      expect(emailQueue.add).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expect.any(Object));
    });

    it("should throw when verification code is expired", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const expiredUser = {
        ...mockUser,
        verification_code_expiry: new Date(Date.now() - 1000), // 1s ago
      };
      mockUserModel.findOne.mockResolvedValue(expiredUser as any);
      (comparePasswords as jest.Mock).mockResolvedValue(true);

      const req = { 
        body: { email, password, verificationCode }, 
        ip: '127.0.0.1', 
        headers: { 'user-agent': 'jest' } 
      } as any;

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify error
      // ────────────────────────────────────────────────
      await expect(AuthService.loginUser(req)).rejects.toThrow('Invalid verification code');
    });

    it("should throw 400 when email or password fails validation", async () => {
      // Arrange – invalid email format triggers Yup validation error before any DB call
      const invalidReq = {
        body: { email: "not-an-email", password: "short" },
      } as any;

      // Act & Assert
      await expect(AuthService.loginUser(invalidReq)).rejects.toThrow();
      // Ensure we bailed out before hitting the DB lookup
      expect(mockUserModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe("updateUser", () => {
    it("should update user details", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const mockUser = { 
        id: userId, 
        email, 
        update: jest.fn(function (this: any, data: any) { Object.assign(this, data); return Promise.resolve(this); }) 
      };
      mockUserModel.findByPk.mockResolvedValue(mockUser as any);

      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const result = await AuthService.updateUser(userId, { name: "Updated Name" });
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      expect(mockUser.update).toHaveBeenCalledWith({ name: "Updated Name" }, { transaction: undefined });
      expect(result).toEqual(mockUser);
    });

    it("should throw 404 when user not found", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      mockUserModel.findByPk.mockResolvedValue(null);

      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify error
      // ────────────────────────────────────────────────
      await expect(AuthService.updateUser("nonexistent-id", { name: "X" })).rejects.toThrow("User not found");
    });
  });

  describe("schema validation edge cases", () => {
    it("should reject missing email", async () => {
      const data = { name: "No email", password: "Password123!", passwordConfirm: "Password123!" } as any;
      await expect(AuthService.createUser(data, 1)).rejects.toThrow();
    });

    it("should reject weak password", async () => {
      const data = { email: "ozturkgokalp000@gmail.com", name: "Weak", password: "123", passwordConfirm: "123" } as any;
      await expect(AuthService.createUser(data, 1)).rejects.toThrow();
    });
  });

  describe("loginSchema.validate", () => {
    // ────────────────────────────────────────────────
    // 1. Arrange - Setup test data and mocks
    // ────────────────────────────────────────────────
    const base = {
      email: "ozturkgokalp000@gmail.com",
      password: "Password123!",
    };

    it("should accept minimal valid payload", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(base, { abortEarly: false })).resolves.toEqual(
        expect.objectContaining(base),
      );
    });

    it("should accept payload with only mfaToken", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, mfaToken: "123456" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false })).resolves.toEqual(
        expect.objectContaining(data),
      );
    });

    it("should accept payload with only backupCode", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, backupCode: "A1B2C3D4" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false })).resolves.toEqual(
        expect.objectContaining(data),
      );
    });

    it("should reject when both mfaToken and backupCode are provided", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, mfaToken: "123456", backupCode: "A1B2C3D4" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify error
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false })).rejects.toThrow();
    });

    it("should reject invalid email format", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, email: "not-an-email" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false }))
        .rejects
        .toThrow("Email must be a valid email address");
    });

    it("should reject missing password", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const { password, ...data } = base;
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data as any, { abortEarly: false })).rejects.toThrow();
    });

    it("should reject when email is empty string", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, email: "" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false }))
        .rejects
        .toThrow("Email is required");
    });

    it("should reject when password is empty string", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, password: "" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false }))
        .rejects
        .toThrow("Password is required");
    });

    it("should reject when email is not a valid format", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, email: "not-an-email" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false }))
        .rejects
        .toThrow("Email must be a valid email address");
    });

    it("should strip unknown fields from input", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, extraField: "should be removed" };
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      const result = await loginSchema.validate(data, { stripUnknown: true, abortEarly: false });
      expect(result).not.toHaveProperty("extraField");
      expect(result).toEqual(expect.objectContaining(base));
    });

    it("should reject when mfaToken is not 6 digits", async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const data = { ...base, mfaToken: "12345" }; // 5 digits
      
      // ────────────────────────────────────────────────
      // 2. Act & Assert - Execute and verify
      // ────────────────────────────────────────────────
      await expect(loginSchema.validate(data, { abortEarly: false }))
        .rejects
        .toThrow("MFA token must be 6 digits");
    });
  });

  describe("mapPermission", () => {
    it("sets matching identifiers to true and leaves others false", () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Setup test data and mocks
      // ────────────────────────────────────────────────
      const permissions = ["sasp_manage_settings", "unknown_key"];
      
      // ────────────────────────────────────────────────
      // 2. Act - Execute the code under test
      // ────────────────────────────────────────────────
      const result = AuthService.mapPermission(permissions);
      
      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      expect(result.sasp_manage_settings).toBe(true);
      expect(result.sasp_manage_sasp_users).toBe(false);
    });

    it("should leave all flags false for non-matching identifiers", () => {
      // Act
      const result = AuthService.mapPermission(["non_existing_permission"]);

      // Assert
      Object.values(result).forEach(value => {
        expect(value).toBe(false);
      });
    });

    it("should correctly map permission identifiers to flags", () => {
      // Act
      const result = AuthService.mapPermission([
        "sasp_manage_settings",
        "manage_organization_users"
      ]);

      // Assert
      expect(result.sasp_manage_settings).toBe(true);
      expect(result.manage_organization_users).toBe(true);
      
      // Verify some other permissions remain false
      expect(result.sasp_manage_sasp_users).toBe(false);
      expect(result.manage_organization_donee_account).toBe(false);
    });
  });

  describe('findUserByEmail', () => {
    const mockEmail = 'ozturkgokalp000@gmail.com';
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: mockEmail,
      name: 'Test User',
      isActive: true
    };

    it('should find a user by email', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock the User.findOne method
      // ────────────────────────────────────────────────
      const mockFindOne = jest.spyOn(User, 'findOne').mockResolvedValue(mockUser as any);

      // ────────────────────────────────────────────────
      // 2. Act - Call the method being tested
      // ────────────────────────────────────────────────
      const result = await AuthService.findUserByEmail(mockEmail);

      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results
      // ────────────────────────────────────────────────
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { email: mockEmail },
      });
      
      expect(result).toEqual(mockUser);
      expect(result?.email).toBe(mockEmail);
    });

    it('should return null when user with email is not found', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock User.findOne to return null
      // ────────────────────────────────────────────────
      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      // ────────────────────────────────────────────────
      // 2. Act - Call the method being tested
      // ────────────────────────────────────────────────
      const result = await AuthService.findUserByEmail('ozturkgokalp000@gmail.com');

      // ────────────────────────────────────────────────
      // 3. Assert - Verify the result is null
      // ────────────────────────────────────────────────
      expect(result).toBeNull();
    });

    it('should be case insensitive for email lookup', async () => {
      // ────────────────────────────────────────────────
      // 1. Arrange - Mock the User.findOne method
      // ────────────────────────────────────────────────
      const mockFindOne = jest.spyOn(User, 'findOne').mockResolvedValue(mockUser as any);

      // ────────────────────────────────────────────────
      // 2. Act - Call the method with different email cases
      // ────────────────────────────────────────────────
      const result1 = await AuthService.findUserByEmail('ozturkgokalp000@gmail.com');
      const result2 = await AuthService.findUserByEmail('ozturkgokalp000@gmail.com');

      // ────────────────────────────────────────────────
      // 3. Assert - Verify the results and calls
      // ────────────────────────────────────────────────
      expect(mockFindOne).toHaveBeenCalledTimes(2);
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { email: 'ozturkgokalp000@gmail.com' },
      });
      expect(mockFindOne).toHaveBeenCalledWith({
        where: { email: 'ozturkgokalp000@gmail.com' },
      });
      
      expect(result1).toEqual(mockUser);
      expect(result2).toEqual(mockUser);
    });
  });

  describe('findUserById', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    
    // Interface for the mock user scope
    interface MockUserScope {
      id: number;
      role: any;
      scope: any;
      organizationUser: any;
      saspUser: any;
      doneeAccount: any;
    }

    // Helper to create a mock user with proper Model type
    const createMockUser = (overrides: Partial<User> = {}) => {
      const baseUser = {
        id: userId,
        email: 'ozturkgokalp000@gmail.com',
        firstName: 'Test',
        lastName: 'User',
        userScopes: [
          {
            id: 1,
            role: {
              id: 1,
              name: 'admin',
              rolePermissions: [
                {
                  permissionId: 1,
                  Permission: {
                    id: 1,
                    name: 'users:read',
                    description: 'Read users'
                  }
                }
              ]
            },
            scope: {
              id: 1,
              type: 'GLOBAL',
              name: 'global',
              description: 'Global scope'
            },
            organizationUser: null,
            saspUser: null,
            doneeAccount: null
          } as MockUserScope
        ]
      };

      // Create a mock Sequelize model instance
      const mockUser = {
        ...baseUser,
        ...overrides,
        // Add required Model methods
        toJSON: function() { return { ...this }; },
        isNewRecord: false,
        _model: undefined,
        _schema: undefined,
        _schemaDelimiter: undefined,
        _attributes: {},
        _creationAttributes: {},
        _previousDataValues: {},
        _changed: new Set(),
        _modelOptions: {},
        _options: { isNewRecord: false },
        isSoftDeleted: () => false,
        save: jest.fn().mockResolvedValue(undefined),
        update: jest.fn(function (this: any, data: any) { Object.assign(this, data); return Promise.resolve(this); }),
        destroy: jest.fn().mockResolvedValue(undefined),
        reload: jest.fn().mockResolvedValue(undefined),
        validate: jest.fn().mockResolvedValue(undefined),
        get: jest.fn(),
        set: jest.fn(),
        changed: jest.fn().mockReturnValue(false),
        previous: jest.fn(),
        setDataValue: jest.fn(),
        getDataValue: jest.fn(),
        hasDataValue: jest.fn().mockReturnValue(false),
        increment: jest.fn().mockResolvedValue(undefined),
        decrement: jest.fn().mockResolvedValue(undefined),
        equals: jest.fn().mockReturnValue(true),
        equalsOneOf: jest.fn().mockReturnValue(true)
      };
      
      // Ensure dataValues is kept in sync
      Object.defineProperty(mockUser, 'dataValues', {
        get() {
          const { toJSON, ...values } = this;
          return values;
        }
      });
      
      return mockUser as unknown as User;
    };

    let mockUser: User;

    beforeEach(() => {
      jest.clearAllMocks();
      mockUser = createMockUser();
    });

    it("should include organization data when user has organization scope", async () => {
      // Arrange
      const baseUserScope = Array.isArray(mockUser.userScopes) ? mockUser.userScopes[0] : null;
      if (!baseUserScope) {
        throw new Error('Base user scope not found');
      }

      const orgUser = createMockUser({
        userScopes: [
          ({
            ...baseUserScope,
            organizationUser: ({
              id: 1, // Changed to number to match expected type
              organization: ({
                id: 'org-1',
                name: 'Org',
                toJSON: function() { return this; }
              } as unknown) as Organization,
              toJSON: function() { return this; }
            } as unknown) as OrganizationUser,
          } as any)
        ]
      });
      
      mockUserModel.findByPk.mockResolvedValue(orgUser);

      // Act
      const result = await AuthService.findUserById(userId);

      // Assert
      if (!result || !result.userScopes?.[0]?.organizationUser) {
        fail('Expected organizationUser to be defined');
        return;
      }
      
      expect(result.userScopes[0].organizationUser).toBeDefined();
      expect(result.userScopes[0].organizationUser!.organization!.name).toBe('Org');
    });
  });
});
