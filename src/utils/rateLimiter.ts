import rateLimit from 'express-rate-limit';
import { getLogger } from '@/utils/logger';
import envvars from '@/config/envvars';

const Logger = getLogger('rateLimiter');

export const apiLimiter = rateLimit({
    windowMs: envvars.rateLimiter.windowMs,
    limit: envvars.rateLimiter.maxRequests,
    standardHeaders: envvars.rateLimiter.standardHeaders,
    legacyHeaders: envvars.rateLimiter.legacyHeaders,
    handler: (req, res) => {
        res.status(429).json({ error: envvars.rateLimiter.message });
        Logger.warn(`Rate limit exceeded for IP: ${req.ip} at ${req.originalUrl} - ${req.method}`);
    },
});