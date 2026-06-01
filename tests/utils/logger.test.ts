import fs from 'fs';
import path from 'path';

jest.mock('fs'); // Mock Node.js file system
jest.mock('log4js'); // Mock log4js to prevent real logging

describe('Logger Utility - Log Directory Creation', () => {
    const logDir = path.join(__dirname, '../../logs');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should create log directory if it does not exist', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false); // Simulate directory does not exist

        // Import the logger module to trigger the directory check
        require('../../src/utils/logger');

        expect(fs.existsSync).toHaveBeenCalledWith(logDir);
        expect(fs.mkdirSync).toHaveBeenCalledWith(logDir, { recursive: true });
    });
});