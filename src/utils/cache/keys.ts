import { CacheKeyEntry, PaginatedCacheKey } from './types';

export const cacheKeys = {
    state: {
        key: (stateId: string) => `/states/${stateId}`,
        ttl: 60,
    } satisfies CacheKeyEntry<string>,

    userOrganizations: {
        key: (params: PaginatedCacheKey) =>
            `/organizations/user:${params.unique}?page=${params.page}&limit=${params.limit}`,
        prefix: (unique: string) => `/organizations/user:${unique}`,
        ttl: 60,
    } satisfies CacheKeyEntry<PaginatedCacheKey, string>,

    organization: {
        key: (orgId: string) => `/organizations/${orgId}`,
        ttl: 60,
    } satisfies CacheKeyEntry<string>,

    doneeProperty: {
        key: (propertyId: string) =>
            `/properties/donee/${propertyId}`,
        ttl: 60,
    } satisfies CacheKeyEntry<string, string>,

    propertiesSummary: {
        key: () => '/properties/summary',
        ttl: 60,
    } satisfies CacheKeyEntry<string>,

    propertyDetails: {
        key: (icn: string) => `/properties/details/${icn}`,
        ttl: 60,
    } satisfies CacheKeyEntry<string>,

    propertyImages: {
        key: (icn: string) => `/properties/images/${icn}`,
        ttl: 60,
    } satisfies CacheKeyEntry<string>,

    request: {
        key: (requestId: string) => `/requests/${requestId}`,
        ttl: 60,
    } satisfies CacheKeyEntry<string>,

    metadata: {
        key: () => `/metadata`,
        ttl: 60,
    } satisfies CacheKeyEntry<string>,

    applicationStatusCounts: {
        key: (stateId: string) => `/applications/state/${stateId}/counts`,
        ttl: 60,
    } satisfies CacheKeyEntry<string, { [status: string]: number }>,
};
