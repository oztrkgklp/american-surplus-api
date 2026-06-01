import { sanitizeKeyword } from '@/want-list/validators/keyword.validator';
import { AppError } from '@/utils/response/appError';

describe('sanitizeKeyword', () => {
    it('rejects keyword containing disallowed characters', () => {
        expect(() => sanitizeKeyword('hello   world!')).toThrow(
            new AppError(400, 'Keyword contains disallowed characters: !')
        );
    });

    it('trims, collapses spaces, and lowercases keyword', () => {
        expect(sanitizeKeyword('  Hello   World  ')).toBe('hello world');
    });

    it('rejects empty keyword', () => {
        expect(() => sanitizeKeyword('')).toThrow(new AppError(400, 'Keyword cannot be empty'));
    });

    it('rejects whitespace-only keyword', () => {
        expect(() => sanitizeKeyword('   ')).toThrow(new AppError(400, 'Keyword cannot be empty'));
    });

    it('rejects over max length keyword', () => {
        const overLimit = 'a'.repeat(51);
        expect(() => sanitizeKeyword(overLimit, 50)).toThrow(
            new AppError(400, 'Keyword must be at most 50 characters')
        );
    });

    it('accepts SQL-looking text if it only uses allowed characters', () => {
        expect(sanitizeKeyword('DROP TABLE')).toBe('drop table');
    });
});
