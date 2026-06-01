import { Op } from 'sequelize';
import envvars from '@/config/envvars';
import { AppError } from '@/utils/response/appError';
import { withTransaction } from '@/utils/transactionalOperation';
import { paginateSequelize, paginateArray } from '@/utils/pagination';
import { PropertyService } from '@/properties/services/property';
import WantListKeyword from '@/want-list/models/WantListKeyword.entity';
import WantListMatch from '@/want-list/models/WantListMatch.entity';
import WantListMatchHistory from '@/want-list/models/WantListMatchHistory.entity';
import { sanitizeKeyword } from '@/want-list/validators/keyword.validator';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export class WantListService {
    static async getKeywords(doneeAccountId: number) {
        const keywords = await WantListKeyword.findAll({
            where: { donee_account_id: doneeAccountId },
            order: [['created_at', 'DESC']],
        });

        const matches = await WantListMatch.findAll({
            where: { donee_account_id: doneeAccountId },
            include: [
                {
                    model: WantListKeyword,
                    as: 'keyword',
                    attributes: ['id'],
                },
            ],
        });

        const matchedKeywordIds = new Set(
            matches
                .map((match) => match.get('keyword') as { id?: number } | undefined)
                .map((keyword) => keyword?.id)
                .filter((id): id is number => typeof id === 'number'),
        );

        return keywords.map((keyword) => ({
            ...keyword.get({ plain: true }),
            hasMatches: matchedKeywordIds.has(keyword.id),
        }));
    }

    static async addKeyword(doneeAccountId: number, rawKeyword: string): Promise<WantListKeyword> {
        const keyword = sanitizeKeyword(rawKeyword, envvars.wantList.maxKeywordLength);
        const keywordCount = await WantListKeyword.count({ where: { donee_account_id: doneeAccountId } });

        if (keywordCount >= envvars.wantList.maxKeywords) {
            throw new AppError(400, `Maximum ${envvars.wantList.maxKeywords} keywords allowed`);
        }

        const existingKeyword = await WantListKeyword.findOne({ where: { donee_account_id: doneeAccountId, keyword } });
        if (existingKeyword) throw new AppError(409, 'Keyword already exists for this donee account');

        return WantListKeyword.create({ donee_account_id: doneeAccountId, keyword, is_active: 1 });
    }

    static async updateKeyword(doneeAccountId: number, wantListKeywordId: number, rawKeyword: string): Promise<WantListKeyword> {
        const keyword = sanitizeKeyword(rawKeyword, envvars.wantList.maxKeywordLength);
        const keywordRecord = await WantListKeyword.findOne({
            where: {
                id: wantListKeywordId,
                donee_account_id: doneeAccountId,
            },
        });

        if (!keywordRecord) throw new AppError(404, 'Want-list keyword not found');

        const existingMatch = await WantListMatch.findOne({
            where: { donee_account_id: doneeAccountId },
            include: [
                {
                    model: WantListKeyword,
                    as: 'keyword',
                    attributes: [],
                    where: { id: wantListKeywordId },
                },
            ],
        });
        if (existingMatch) throw new AppError(409, 'Cannot update keyword because it already has matches');

        const duplicate = await WantListKeyword.findOne({
            where: {
                id: { [Op.ne]: wantListKeywordId },
                donee_account_id: doneeAccountId,
                keyword,
            },
        });
        if (duplicate) throw new AppError(409, 'Keyword already exists for this donee account');


        keywordRecord.keyword = keyword;
        await keywordRecord.save();
        return keywordRecord;
    }

    static async toggleKeywordActivation(doneeAccountId: number, wantListKeywordId: number): Promise<WantListKeyword> {
        const keywordRecord = await WantListKeyword.findOne({
            where: { id: wantListKeywordId, donee_account_id: doneeAccountId, },
        });

        if (!keywordRecord) throw new AppError(404, 'Want-list keyword not found');

        keywordRecord.is_active = keywordRecord.is_active ? 0 : 1;
        await keywordRecord.save();
        return keywordRecord;
    }

    static async deleteKeyword(doneeAccountId: number, wantListKeywordId: number): Promise<void> {
        const deletedCount = await WantListKeyword.destroy({
            where: { id: wantListKeywordId, donee_account_id: doneeAccountId },
        });

        if (!deletedCount) throw new AppError(404, 'Want-list keyword not found');
    }

    static async getKeywordMatches(doneeAccountId: number, keywordId: number, page: number = DEFAULT_PAGE, limit: number = DEFAULT_LIMIT,) {
        const rows = await WantListMatch.findAll({
            where: {
                donee_account_id: doneeAccountId,
                want_list_keyword_id: keywordId,
            },
            include: [
                {
                    model: WantListKeyword,
                    as: 'keyword',
                    attributes: ['id', 'keyword', 'is_active'],
                },
            ],
            order: [['created_at', 'DESC'], ['id', 'DESC']] as [string, string][],
        });

        const requestedIcns = await PropertyService.getRequestedControlNumbersByDoneeAccountId(doneeAccountId, false);
        const requestedSet = new Set(requestedIcns);

        const allItems = rows.map((match) => ({
            ...match.get({ plain: true }),
            isRequestedByOrganization: requestedSet.has(match.get('ICN') as string),
        }));
        return paginateArray(allItems, page, limit);
    }

    static async getKeywordMatchHistory(doneeAccountId: number, page: number = DEFAULT_PAGE, limit: number = DEFAULT_LIMIT,) {
        return paginateSequelize(WantListMatchHistory, page, limit, {
            where: { donee_account_id: doneeAccountId },
            order: [['archived_at', 'DESC'], ['created_at', 'DESC']],
        });
    }


    // ----------------- EXPIRY CRONS -----------------------


    static async archiveExpiredMatches(): Promise<number> {
        const now = Date.now();

        return withTransaction(async transaction => {
            const expiredMatches = await WantListMatch.findAll({
                where: { surplus_release_date: { [Op.lte]: now }, },
                include: [
                    {
                        model: WantListKeyword,
                        as: 'keyword',
                        attributes: ['keyword'],
                        required: true,
                    },
                ],
                transaction,
            });

            if (!expiredMatches.length) return 0;

            await WantListMatchHistory.bulkCreate(
                expiredMatches.map(match => ({
                    donee_account_id: match.donee_account_id,
                    keyword: match.keyword!.keyword,
                    ICN: match.ICN,
                    property_name: match.property_name,
                    surplus_release_date: match.surplus_release_date,
                    archived_at: new Date(),
                })), { transaction }
            );

            await WantListMatch.destroy({ where: { id: expiredMatches.map(match => match.id) }, transaction, });
            return expiredMatches.length;
        });
    }

    static async deactivateStaleKeywords(): Promise<number> {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const [updatedCount] = await WantListKeyword.update(
            { is_active: 0 },
            { where: { is_active: 1, updated_at: { [Op.lte]: oneMonthAgo } } });

        return updatedCount;
    }
}
