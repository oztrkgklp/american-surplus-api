import path from 'path';
import mime from 'mime';

import { newStoragePaths, StoragePaths } from '@/utils/storage/paths';
import { listDirectory, readFile, getFileMimeType } from '@/utils/storage/fileSystem';
import { AppError } from '@/utils/response/appError';
import { cache } from '@/utils/cache';
import { cacheKeys } from '@/utils/cache/keys';
import { paginateArray } from '@/utils/pagination';
import { PaginatedResponse } from '@/utils/pagination/interfaces';
import { PropertyDetails } from '@/ppms/types/propertyDetails';
import { PropertyDiskFile, PropertySearchResult, SummarySearchOptions } from '@/ppms/types/summary';
import { getLogger } from '@/utils/logger';
import { propertyDetailsRepository } from '../../elasticsearch/repositories/propertyDetails.repository';
const logger = getLogger('PropertDataService');

export class PropertyDataService {

    static async getAllPropertiesSummary(page: number, limit: number, options?: SummarySearchOptions): Promise<PaginatedResponse<PropertySearchResult>> {
        const cacheIdentifier = cacheKeys.propertiesSummary;
        const cacheKey = cacheIdentifier.key();

        // Try getting the full summary list from cache
        let allSummaries = await cache.get<PropertySearchResult[]>(cacheKey);

        // If not cached, read from disk and populate cache
        if (!allSummaries) {
            const summaryDir = StoragePaths.propertyData.summary.path;
            const files = await listDirectory(summaryDir);
            const jsonFiles = files.filter((f) => f.endsWith('.json'));
            allSummaries = [];

            for (const file of jsonFiles) {
                const filePath = path.join(summaryDir, file);
                try {
                    const buffer = await readFile(filePath);
                    const diskFile = JSON.parse(buffer.toString()) as PropertyDiskFile;
                    allSummaries.push(...diskFile.data.propertySearchResultList);
                } catch (error) {
                    logger.error(`[PropertiesSummary] Skipping invalid file ${file}: ${error}`);
                    continue;
                }
            }

            await cache.set(cacheKey, allSummaries, cacheIdentifier.ttl);
        }

        if (options?.categoryCode) {
            allSummaries = allSummaries.filter((property) => property.categoryCode === options.categoryCode);
        }

        if (options?.itemName || options?.description) {
            const itemName = options.itemName ? options.itemName.toLowerCase() : null;
            const description = options.description ? options.description.toLowerCase() : null;

            allSummaries = allSummaries.filter((property) => {
                const hasItemName = !!property.itemName;
                const matchesItemName = !hasItemName || (itemName ? property.itemName.toLowerCase().includes(itemName) : false);

                const hasDescription = !!property.fscDescription;
                const matchesDescription = !hasDescription || (description ? property.fscDescription.toLowerCase().includes(description) : false);

                return matchesItemName || matchesDescription;
            });
        }

        if (options?.icn) {
            allSummaries = allSummaries.filter((property) => property.itemControlNumber === options.icn);
        }

        if (options?.icnPrefix && options?.propertyLocation && options?.propertySurplusReleaseDate) {
            allSummaries = allSummaries.filter((property) => {
                const locationMatches = !options?.propertyLocation || (
                    property.propertyLocationDTO.city === options.propertyLocation.city &&
                    property.propertyLocationDTO.stateCode === options.propertyLocation.stateCode &&
                    property.propertyLocationDTO.zip === options.propertyLocation.zip
                );

                //checking for prefix, surplus release date, location data
                return property.itemControlNumber.startsWith(options.icnPrefix as string) &&
                    (!options || property.surplusReleaseDate === options.propertySurplusReleaseDate) &&
                    locationMatches;
            });
        }

        //extract out the properties that already in the request if needed
        if (options?.existingPropertyControlNumbers?.length) {
            const existingSet = new Set(options.existingPropertyControlNumbers);
            allSummaries = allSummaries.filter(property => !existingSet.has(property.itemControlNumber));
        }

        // Filter properties with future Surplus Release Dates
        if (options?.futureSurplusReleaseDate) {
            allSummaries = allSummaries.filter((property) => {
                const releaseDate = new Date(property.surplusReleaseDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0); // normalize to start of day
                return releaseDate > today;
            });
        }

        // Filter properties that have at least one image file
        if (options?.withImagesOnly) {
            allSummaries = allSummaries.filter((property) => property.fileName !== null);
        }

        // Sort by submitted date
        allSummaries = allSummaries.sort((a, b) => {
            const dateA = new Date(a.submittedDate);
            const dateB = new Date(b.submittedDate);
            return options?.sortOrder === 'ASC'
                ? dateA.getTime() - dateB.getTime()
                : dateB.getTime() - dateA.getTime();
        });

        return paginateArray(allSummaries, page, limit);
    }

    /**
     * Fetch a single property from the Summary dataset by ICN.
     * Summary  is the primary source of truth for SurplusReleaseDate.
     * @param icn - Item Control Number to search for
     * @returns PropertySearchResult from Summary dataset, or null if not found
     */
    static async getPropertySummaryByICN(icn: string): Promise<PropertySearchResult | null> {
        const cacheIdentifier = cacheKeys.propertiesSummary;
        const cacheKey = cacheIdentifier.key();

        // Try getting the full summary list from cache
        let allSummaries = await cache.get<PropertySearchResult[]>(cacheKey);

        // If not cached, read from disk and populate cache
        if (!allSummaries) {
            const summaryDir = StoragePaths.propertyData.summary.path;
            const files = await listDirectory(summaryDir);
            const jsonFiles = files.filter((f) => f.endsWith('.json'));
            allSummaries = [];

            for (const file of jsonFiles) {
                const filePath = path.join(summaryDir, file);
                try {
                    const buffer = await readFile(filePath);
                    const diskFile = JSON.parse(buffer.toString()) as PropertyDiskFile;
                    allSummaries.push(...diskFile.data.propertySearchResultList);
                } catch (error) {
                    logger.error(`[PropertiesSummary] Skipping invalid file ${file}: ${error}`);
                    continue;
                }
            }

            await cache.set(cacheKey, allSummaries, cacheIdentifier.ttl);
        }

        // Find the property by ICN
        const property = allSummaries.find((p) => p.itemControlNumber === icn);
        return property || null;
    }

    /**
     * Reads full details of a property by its ICN.
     * If the data is cached, it will be returned from the cache.
     * If not, it will read the details from the file system and cache the result.
     * @param icn - Item Control Number (folder name inside details/)
     */
    static async getPropertyDetailsLegacy(icn: string): Promise<PropertyDetails> {
        const cacheKey = cacheKeys.propertyDetails.key(icn);
        const cached = await cache.get<PropertyDetails>(cacheKey);
        if (cached) return cached;

        const filePath = path.join(StoragePaths.propertyData.details.property(icn).path, 'icn.json');

        try {
            const buffer = await readFile(filePath);
            const property = JSON.parse(buffer.toString()) as PropertyDetails;

            await cache.set(cacheKey, property, cacheKeys.propertyDetails.ttl);
            return property;
        } catch (err) {
            throw new AppError(404, `Property with ICN '${icn}' not found.`);
        }
    }

    static async getPropertyDetails(icn: string): Promise<PropertyDetails> {
        try {
            const property = await propertyDetailsRepository.getPropertyDetailsByIcn(icn);
            if (!property) return this.getPropertyDetailsLegacy(icn);

            return propertyDetailsRepository.mapEntityToPropertyDetails(property);
        } catch (err) {
            throw new AppError(500, `Error getting property details: ${err}`);
        }
    }

    /**
    * Batch loads property details for a list of ICNs.
    * Uses cache for existing entries and reads remaining from the filesystem.
    * @param icns - Array of Item Control Numbers.
    */
    static async getManyPropertyDetails(icns: string[]): Promise<PropertyDetails[]> {
        const results: PropertyDetails[] = [];
        const missing: string[] = [];

        // Check cache first
        for (const icn of icns) {
            const cacheKey = cacheKeys.propertyDetails.key(icn);
            const cached = await cache.get<PropertyDetails>(cacheKey);
            if (cached) {
                results.push(cached);
            } else {
                missing.push(icn);
            }
        }

        // For missing ICNs, first try Elasticsearch (new index then legacy), then fallback to filesystem
        const fetched = await Promise.allSettled(
            missing.map(async (icn) => {
                try {
                    const entity = await propertyDetailsRepository.getPropertyDetailsByIcn(icn);
                    if (entity) {
                        const detail = propertyDetailsRepository.mapEntityToPropertyDetails(entity);
                        await cache.set(cacheKeys.propertyDetails.key(icn), detail, cacheKeys.propertyDetails.ttl);
                        return detail;
                    }
                } catch (err) {
                    // log and proceed to filesystem fallback
                    console.warn(`Elasticsearch lookup failed for ${icn}:`, err);
                }

                // Fallback to filesystem
                const filePath = path.join(StoragePaths.propertyData.details.property(icn).path, 'icn.json');
                const buffer = await readFile(filePath);
                const detail = JSON.parse(buffer.toString()) as PropertyDetails;

                await cache.set(cacheKeys.propertyDetails.key(icn), detail, cacheKeys.propertyDetails.ttl);
                return detail;
            })
        );

        // Only include successfully loaded results
        for (const result of fetched) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                // Optionally log or collect failed ICNs
                console.warn('Failed to load property detail:', result.reason);
            }
        }

        return results;
    }

    /**
     * Lists image file names in the ICN folder, excluding icn.json.
     * If the data is cached, it will be returned from the cache.
     * If not, it will read the image files from the file system and cache the result.
     * @param icn - The property ICN
     * @returns List of image filenames (e.g., ["1.jpg", "2.png"])
     */
    static async getPropertyImages(icn: string): Promise<string[]> {
        const cacheKey = cacheKeys.propertyImages.key(icn);
        const cached = await cache.get<string[]>(cacheKey);
        if (cached) return cached;

        const dirPath = path.join(newStoragePaths.images.image(icn).path);
        try {
            const files = await listDirectory(dirPath);

            // Exclude the icn.json and return only image files
            const imageFiles = files.filter(
                (file) => file !== 'icn.json' && /\.(jpe?g|png|webp|gif)$/i.test(file)
            );

            await cache.set(cacheKey, imageFiles, cacheKeys.propertyImages.ttl);
            return imageFiles;
        } catch (err) {
            throw new AppError(404, `Images for ICN '${icn}' not found.`);
        }
    }

    static async getPropertyImageBuffer(icn: string, imageName: string): Promise<{ buffer: Buffer, mimeType: string }> {
        // const basePath = StoragePaths.propertyData.details.property(icn).path;
        // const imagePath = path.join(basePath, imageName);

        const basePath = newStoragePaths.images.image(icn).path;
        const imagePath = path.join(basePath, imageName);

        // Prevent path traversal
        if (!imagePath.startsWith(basePath)) throw new AppError(403, 'Unauthorized image path');

        try {
            const buffer = await readFile(imagePath);
            const mimeType = getFileMimeType(imagePath);
            return { buffer, mimeType };
        } catch {
            try {
                const files = await listDirectory(basePath);
                const imageFiles = files.filter((file) => /\.(jpe?g|png|webp|gif)$/i.test(file));
                if (imageFiles.length === 0) throw new AppError(404, `No image files found for ICN '${icn}'`);

                const firstImageName = imageFiles[0];
                const firstImagePath = path.join(basePath, firstImageName);
                const buffer = await readFile(firstImagePath);
                const mimeType = getFileMimeType(firstImagePath);
                return { buffer, mimeType };
            } catch (error) {
                throw new AppError(404, `Image not found: ${imageName}`);
            }
        }
    }

    static async getCategories(): Promise<Array<{ categoryName: string; categoryCode: number; categoryCount: number; }>> {
        try {
            const summaryDir = StoragePaths.propertyData.summary.path;
            const files = await listDirectory(summaryDir);

            const jsonFiles = files.filter(f => f.endsWith('.json'));
            if (jsonFiles.length === 0) return []

            const page = jsonFiles[0];
            const filePath = path.join(summaryDir, page);
            const buffer = await readFile(filePath); 3

            const diskFile = JSON.parse(buffer.toString()) as PropertyDiskFile;
            const propertySummary = diskFile.data || {};

            return propertySummary.propertySearchCategoryCountDTOList.map((category) => ({
                categoryName: category.categoryName,
                categoryCode: category.categoryCode,
                categoryCount: category.total
            }));
        } catch (error) {
            throw new AppError(500, `Error fetching categories: ${error}`);
        }
    }
}
