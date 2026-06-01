import { PropertyMetadataService } from '@/metadata/services/property';
import { RequestMetadataService } from '@/metadata/services/request';
import { cache } from '@/utils/cache';
import { cacheKeys } from '@/utils/cache/keys';
import PropertyType from '@/metadata/models/PropertyType';
import DemilCondition from '@/metadata/models/DemilCondition';
import DisposalCondition from '@/metadata/models/DisposalCondition';
import SupplyCondition from '@/metadata/models/SupplyCondition';
import RequestAttachmentType from '@/metadata/models/RequestAttachmentType';

export const getAllMetadata = async (): Promise<{
    propertyTypes: PropertyType[];
    demilConditions: DemilCondition[];
    disposalConditions: DisposalCondition[];
    supplyConditions: SupplyCondition[];
    requestAttachmentTypes: RequestAttachmentType[];
}> => {
    const { key, ttl } = cacheKeys.metadata;
    const cacheKey = key();

    const cachedMetadata = await cache.get<ReturnType<typeof getAllMetadata>>(cacheKey);
    if (cachedMetadata) return cachedMetadata;

    const [propertyTypes, demilConditions, disposalConditions, supplyConditions, requestAttachmentTypes, categories] =
        await Promise.all([
            PropertyMetadataService.getPropertyTypes(),
            PropertyMetadataService.getDemilConditions(),
            PropertyMetadataService.getDisposalConditions(),
            PropertyMetadataService.getSupplyConditions(),
            RequestMetadataService.getRequestAttachmentTypes(),
            PropertyMetadataService.getCategories(),

        ]);

    const metadata = {
        propertyTypes,
        demilConditions,
        disposalConditions,
        supplyConditions,
        requestAttachmentTypes,
        categories,
    };

    await cache.set(cacheKey, metadata, ttl);
    return metadata;
};
