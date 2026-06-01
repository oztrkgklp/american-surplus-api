import { StoragePaths } from '@/utils/storage/paths';
import { ensureDirExists, getFilePath, readFile, writeFile } from '@/utils/storage/fileSystem';

import path from 'path';
import { AppError } from '@/utils/response/appError';
import { FileExtension } from '@/utils/storage/fileTypes';

export class OrganizationFileService {
    /**
     * Ensures the organization folder exists and returns the full path.
     * @param orgId - The organization ID
     * @returns The full path to the organization folder
     */
    static async prepareOrgFolder(orgId: string): Promise<string> {
        const orgPath = StoragePaths.private.orgs.org(orgId).path;
        await ensureDirExists(orgPath);
        return orgPath;
    }
}
