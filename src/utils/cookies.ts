import { Response } from 'express';
import envvars from '@/config/envvars';
import { parseDuration } from '@/utils/parseExpirationPeriod';

const getDurationMs = (duration: string): number => {
    const { value, unit } = parseDuration(duration);
    const multipliers: Record<string, number> = {
        seconds: 1000,
        minutes: 60 * 1000,
        hours: 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
        years: 365 * 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit as string];
};

export const resetAccessTokenCookie = (res: Response, accessToken: string): void => {
    res.clearCookie('accessToken');
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: getDurationMs(envvars.auth.jwt.accessExpiration),
    });
};

export const resetRefreshTokenCookie = (res: Response, refreshToken: string): void => {
    res.clearCookie('refreshToken');
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        maxAge: getDurationMs(envvars.auth.jwt.accessExpiration) + 60 * 1000,
    });
};

export const clearAuthCookies = (res: Response): void => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
};
