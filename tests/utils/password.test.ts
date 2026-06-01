import bcrypt from 'bcrypt';
import { hashPassword, comparePasswords } from '../../src/utils/password';

jest.mock('bcrypt', () => ({
    hashSync: jest.fn(),
    compare: jest.fn(),
}));

describe('password utils', () => {
    const testPassword = 'mypassword';
    const testHash = 'mockedHash';

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('hashPassword', () => {
        test("should hash the password using bcrypt.hashSync", async () => {
            // Arrange
            const saltRounds = 10;
            (bcrypt.hashSync as jest.Mock).mockReturnValue(testHash);

            // Act
            const result = await hashPassword(testPassword);

            // Assert
            expect(bcrypt.hashSync).toHaveBeenCalledWith(testPassword, saltRounds);
            expect(result).toBe(testHash);
        });
    });

    describe('comparePasswords', () => {
        test("should compare the password with the hash", async () => {
            // Arrange
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            // Act
            const result = await comparePasswords(testPassword, testHash);

            // Assert
            expect(bcrypt.compare).toHaveBeenCalledWith(testPassword, testHash);
            expect(result).toBe(true);
        });

        test("should return false if passwords do not match", async () => {
            // Arrange
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            // Act
            const result = await comparePasswords(testPassword, testHash);

            // Assert
            expect(bcrypt.compare).toHaveBeenCalledWith(testPassword, testHash);
            expect(result).toBe(false);
        });
    });
});
