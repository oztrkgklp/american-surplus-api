import fs, { constants } from 'fs/promises';
import path from 'path';
import mime from 'mime';

import { FileExtension } from './fileTypes';

/**
 * Ensures a directory exists, creating it if necessary.
 */
export const ensureDirExists = async (dirPath: string): Promise<void> => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        console.error(`Could not create directory ${dirPath}:`, error);
        throw error;
    }
};

/**
 * Check if a file exists at the specified path.
 * @param filePath Absolute or relative path to the file.
 * @returns `true` if the file exists and is accessible, otherwise `false`.
 */
export const fileExists = async (filePath: string): Promise<boolean> => {
    try {
        const stat = await fs.stat(filePath);
        return stat.isFile();
    } catch (err: any) {
        // Return false if the file doesn't exist or is not accessible
        if (err.code === 'ENOENT') return false;
        // Optionally rethrow other types of errors (e.g., permission issues)
        throw err;
    }
};

/**
 * Writes data to a file.
 */
export const writeFile = async (filePath: string, data: Buffer | string): Promise<void> => {
    await ensureDirExists(require('path').dirname(filePath));
    await fs.writeFile(filePath, data);
};

/**
 * Reads a file.
 */
export const readFile = async (filePath: string): Promise<Buffer> => {
    return await fs.readFile(filePath);
};

/**
 * Deletes a file.
 */
export const deleteFile = async (filePath: string): Promise<void> => {
    await fs.unlink(filePath);
};

/**
 * Lists files in a directory.
 * @param dirPath - Path to the directory
 * @returns Array of filenames
 */
export const listDirectory = async (dirPath: string): Promise<string[]> => {
    const files = await fs.readdir(dirPath);
    return files;
};

/**
 * Get file path.
 */
export const getFilePath = (folder: string, filename: string): string => {
    return path.join(folder, filename);
};

/**
 * 
 * @param filePath - The path of the file.
 * @returns The file's mime type.
 */
export const getFileMimeType = (filePath: string) => {
    return mime.lookup(filePath) || 'application/octet-stream';
}

/**
 * Sanitizes a filename by replacing invalid characters with underscores.
 */
export const sanitizeFileName = (originalName: string): string => {
    const { name: baseName, ext } = path.parse(originalName);

    const sanitizedBase = baseName.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 100); // trim length
    const sanitizedExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase(); // clean unsafe chars

    return sanitizedExt ? `${sanitizedBase}.${sanitizedExt}` : sanitizedBase;
};

export const saveUploadedFile = async (
    fileBuffer: Buffer,
    targetDir: string,
    originalName: string
): Promise<string> => {
    await ensureDirExists(targetDir);
    const ext = path.extname(originalName).replace('.', '');
    if (!isValidFileExtension(ext)) {
        throw new Error(`Unsupported file extension: ${ext}`);
    }
    const filename = sanitizeFileName(originalName);
    const filePath = path.join(targetDir, filename);
    await writeFile(filePath, fileBuffer);
    return filePath;
};


export function isValidFileExtension(ext: string): ext is FileExtension {
    return Object.values(FileExtension).includes(ext as FileExtension);
}