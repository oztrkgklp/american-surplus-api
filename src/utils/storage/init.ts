import { StoragePaths } from '@/utils/storage/paths';
import { ensureDirExists } from '@/utils/storage/fileSystem';
import storageLogger from '@/utils/storage/logger';

const staticDirs = [
    StoragePaths.root,
    StoragePaths.conf,

    // Public area
    StoragePaths.public,

    // Private base
    StoragePaths.private.path,

    // Org and SASP base folders
    StoragePaths.private.orgs.path,
    StoragePaths.private.sasp.path,

    // Property data folders
    StoragePaths.propertyData.path,
    StoragePaths.propertyData.details.path,
    StoragePaths.propertyData.summary.path,

    // Invoice data folders
    StoragePaths.propertyData.invoice.path,
    StoragePaths.propertyData.invoice.export.path,
    StoragePaths.propertyData.invoice.import.path,
    StoragePaths.propertyData.invoice.reconciliation.path,
];

export const initializeStorageStructure = async (): Promise<void> => {
    storageLogger.info('Initializing storage for static directories...');

    for (const dir of staticDirs) {
        await ensureDirExists(dir);
    }

    storageLogger.info('Storage structure initialized.');
};
