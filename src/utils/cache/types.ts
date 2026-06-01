export type CacheKeyEntry<KeyParam = void, PrefixParam = void> = {
    key: KeyParam extends void ? () => string : (...params: KeyParam[]) => string;
    prefix?: (param: PrefixParam) => string;
    ttl: number;
};

export type PaginatedCacheKey = { unique?: string; page: number; limit: number };