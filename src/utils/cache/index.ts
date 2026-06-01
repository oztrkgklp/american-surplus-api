import Redis from 'ioredis';
import envvars from '@/config/envvars';
import { logger } from '@/utils/cache/logger';
import { CacheKeyEntry } from '@/utils/cache/types';


const redis = new Redis({
    host: envvars.redis.host,
    port: envvars.redis.port,
    password: envvars.redis.password,
    maxRetriesPerRequest: null, // ← retry forever bull mq requires it 
});

// Catastrophic failure handler for Redis connection errors
redis.on('error', (err) => {
    logger.error(`Redis connection error: ${err.message}`);
    
    const connectionErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'];
    const isConnectionError = connectionErrors.some(errCode => err.message.includes(errCode));
    
    if (isConnectionError) {
        logger.error('Critical: Unable to connect to Redis. Application will exit.');
        process.exit(1);
    }
});

const subscriber = new Redis({
    host: envvars.redis.host,
    port: envvars.redis.port,
    password: envvars.redis.password,
});

// Catastrophic failure handler for subscriber connection errors
subscriber.on('error', (err) => {
    logger.error(`Redis subscriber connection error: ${err.message}`);
    
    const connectionErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH'];
    const isConnectionError = connectionErrors.some(errCode => err.message.includes(errCode));
    
    if (isConnectionError) {
        logger.error('Critical: Unable to connect to Redis subscriber. Application will exit.');
        process.exit(1);
    }
});

const DEFAULT_EXPIRATION = envvars.redis.defaultExpiration;

subscriber.subscribe('invalidate-cache');

subscriber.on('message', async (channel, key) => {
    if (channel === 'invalidate-cache') {
        await redis.del(key);
        logger.info(`Cache invalidated across instances: ${key}`);
    }
});

function hasUnique<T>(param: T): param is T & { unique: string } {
    return typeof (param as any)?.unique === 'string';
}

export const cache = {
    /**
    * Get a value from the cache
    * @param key The key to get the value for
    * @returns A promise that resolves to the value or null if not found
    */
    async get<T>(key: string): Promise<T | null> {
        try {
            const data = await redis.get(key);
            if (data) {
                logger.info(`Cache hit: ${key}`);
                return JSON.parse(data);
            } else {
                logger.info(`Cache miss: ${key}`);
                return null;
            }
        } catch (err) {
            logger.error(`Cache get error: ${err}`);
            return null;
        }
    },

    /**
    * Set a value in the cache
    * @param key The key to set the value for
    * @param value The value to set
    * @param expiration The expiration time in seconds
    * @returns A promise that resolves when the value is set
    */
    async set<T>(key: string, value: T, expiration = DEFAULT_EXPIRATION): Promise<void> {
        try {
            await redis.set(key, JSON.stringify(value), 'EX', expiration);
            logger.info(`Cache set: ${key} (expires in ${expiration}s)`);
        } catch (err) {
            logger.error(`Cache set error: ${err}`);
        }
    },

    /**
     * Deletes cache entries using either a prefix scan or a direct key match.
     *
     * - If `prefix` is defined, scans Redis for all keys that start with the generated prefix
     *   and deletes them (useful for paginated or dynamic cache entries).
     * - If `prefix` is not defined, deletes the single cache key returned by the `key` function.
     *
     * @template KeyParam - The type used for generating the key.
     * @template PrefixParam - The type used for generating the prefix (if applicable).
     *
     * @param cache - The cache key definition object containing `key`, optional `prefix`, and `ttl`.
     * @param param - The parameter used to generate either the key or the prefix (e.g., userId or { unique, page, limit }).
     */
    async deleteSmart<KeyParam, PrefixParam>(
        cache: CacheKeyEntry<KeyParam, PrefixParam>,
        param: KeyParam | PrefixParam
    ): Promise<void> {
        try {
            if (cache.prefix) {
                // If it's an object with a `unique` field, use that
                const unique = (param as any)?.unique ?? param;
                const prefix = cache.prefix(unique as PrefixParam);

                let cursor = '0';
                const keysToDelete: string[] = [];

                do {
                    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
                    cursor = nextCursor;
                    keysToDelete.push(...keys);
                } while (cursor !== '0');

                if (keysToDelete.length > 0) {
                    await redis.del(...keysToDelete);
                    await redis.publish('invalidate-cache', prefix);
                    logger.info(`Cache deleted for prefix: ${prefix} (${keysToDelete.length} keys)`);
                }
            } else {
                const key = cache.key(param as KeyParam);
                await redis.del(key as string);
                await redis.publish('invalidate-cache', key as string);
                logger.info(`Cache deleted: ${key}`);
            }
        } catch (err) {
            logger.error(`Cache delete error: ${err}`);
        }
    }
};

export default redis;