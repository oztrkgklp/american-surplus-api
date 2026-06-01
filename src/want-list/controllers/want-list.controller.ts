import { Request, Response } from 'express';
import { sendError, sendSuccess } from '@/utils/response/responseHelper';
import { parseId } from '@/utils/validators';
import { AppError } from '@/utils/response/appError';
import { keywordInputSchema } from '@/want-list/validators/keyword.validator';
import { WantListService } from '@/want-list/services/want-list.service';

const parsePage = (q: unknown): number => {
    const n = Number(q);
    return Number.isInteger(n) && n >= 1 ? n : 1;
};
const parseLimit = (q: unknown): number => {
    const n = Number(q);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 10;
};
const parseQueryId = (q: unknown): number => {
    if (!q || typeof q !== 'string') {
        throw new AppError(400, 'Keyword ID is required');
    }
    const n = Number(q);
    if (!Number.isInteger(n) || n <= 0) {
        throw new AppError(400, 'Invalid keyword ID format');
    }
    return n;
};

export const getKeywords = async (req: Request, res: Response): Promise<void> => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);
        const result = await WantListService.getKeywords(doneeAccountId);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const addKeyword = async (req: Request, res: Response): Promise<void> => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);
        const validatedBody = await keywordInputSchema.validate(req.body, { abortEarly: false });
        const keyword = await WantListService.addKeyword(doneeAccountId, validatedBody.keyword);
        sendSuccess(res, keyword, 201);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const updateKeyword = async (req: Request, res: Response): Promise<void> => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);
        const wantListKeywordId = parseId(req.params.wantListKeywordId);
        const validatedBody = await keywordInputSchema.validate(req.body, { abortEarly: false });
        const keyword = await WantListService.updateKeyword(doneeAccountId, wantListKeywordId, validatedBody.keyword);
        sendSuccess(res, keyword);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const toggleKeywordActivation = async (req: Request, res: Response): Promise<void> => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);
        const wantListKeywordId = parseId(req.params.wantListKeywordId);
        const keyword = await WantListService.toggleKeywordActivation(doneeAccountId, wantListKeywordId);
        sendSuccess(res, keyword);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const deleteKeyword = async (req: Request, res: Response): Promise<void> => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);
        const wantListKeywordId = parseId(req.params.wantListKeywordId);
        await WantListService.deleteKeyword(doneeAccountId, wantListKeywordId);
        sendSuccess(res, { message: 'Keyword deleted successfully' });
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getKeywordMatches = async (req: Request, res: Response): Promise<void> => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);
        const keywordId = parseQueryId(req.query.keywordId);
        const page = parsePage(req.query.page);
        const limit = parseLimit(req.query.limit);
        const result = await WantListService.getKeywordMatches(doneeAccountId, keywordId, page, limit);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};

export const getKeywordMatchHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const doneeAccountId = parseId(req.params.doneeAccountId);
        const page = parsePage(req.query.page);
        const limit = parseLimit(req.query.limit);
        const result = await WantListService.getKeywordMatchHistory(doneeAccountId, page, limit);
        sendSuccess(res, result);
    } catch (error) {
        sendError(req, res, error);
    }
};
