import * as yup from 'yup';
import envvars from '@/config/envvars';
import { AppError } from '@/utils/response/appError';

const ALLOWED_CHAR_REGEX = /^[A-Za-z0-9 ]+$/;
const DISALLOWED_CHAR_REGEX = /[^A-Za-z0-9 ]/g;

const formatCharacterForMessage = (char: string): string => {
    if (char === '\t') return '\\t';
    if (char === '\n') return '\\n';
    if (char === '\r') return '\\r';
    return char;
};

export const keywordInputSchema = yup.object({
    keyword: yup.string().required('Keyword is required'),
});

export const sanitizeKeyword = (
    rawKeyword: string,
    maxKeywordLength: number = envvars.wantList.maxKeywordLength
): string => {
    if (typeof rawKeyword !== 'string') {
        throw new AppError(400, 'Keyword is required');
    }

    const trimmed = rawKeyword.trim();
    if (!trimmed) {
        throw new AppError(400, 'Keyword cannot be empty');
    }

    if (!ALLOWED_CHAR_REGEX.test(trimmed)) {
        const matches = trimmed.match(DISALLOWED_CHAR_REGEX) || [];
        const unique = Array.from(new Set(matches.map(formatCharacterForMessage)));
        throw new AppError(400, `Keyword contains disallowed characters: ${unique.join(', ')}`);
    }

    const normalized = trimmed.replace(/ +/g, ' ').toLowerCase();
    if (!normalized) {
        throw new AppError(400, 'Keyword cannot be empty');
    }

    if (normalized.length > maxKeywordLength) {
        throw new AppError(400, `Keyword must be at most ${maxKeywordLength} characters`);
    }

    return normalized;
};
