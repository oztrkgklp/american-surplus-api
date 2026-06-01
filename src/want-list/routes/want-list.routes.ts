import { Router } from 'express';
import { authenticate } from '@/orchestration/middleware/authenticate';
import { authorizeActiveDoneeAccount } from '@/orchestration/middleware/Donee/authorizeActiveDoneeAccount.donee';
import { UserPermissionsEnum } from '@/enums/userPermissions.enum';
import {
    addKeyword,
    deleteKeyword,
    getKeywordMatchHistory,
    getKeywordMatches,
    getKeywords,
    toggleKeywordActivation,
    updateKeyword,
} from '@/want-list/controllers/want-list.controller';

const router = Router();

router.get(
    '/donee-accounts/:doneeAccountId/get-keywords',
    authenticate,
    authorizeActiveDoneeAccount([UserPermissionsEnum.MANAGE_REQUESTS]),
    getKeywords
);

router.post(
    '/donee-accounts/:doneeAccountId/add-keyword',
    authenticate,
    authorizeActiveDoneeAccount([UserPermissionsEnum.MANAGE_REQUESTS]),
    addKeyword
);

router.put(
    '/donee-accounts/:doneeAccountId/update-keyword/:wantListKeywordId',
    authenticate,
    authorizeActiveDoneeAccount([UserPermissionsEnum.MANAGE_REQUESTS]),
    updateKeyword
);

router.patch(
    '/donee-accounts/:doneeAccountId/toggle-keyword-activation/:wantListKeywordId',
    authenticate,
    authorizeActiveDoneeAccount([UserPermissionsEnum.MANAGE_REQUESTS]),
    toggleKeywordActivation
);

router.delete(
    '/donee-accounts/:doneeAccountId/delete-keyword/:wantListKeywordId',
    authenticate,
    authorizeActiveDoneeAccount([UserPermissionsEnum.MANAGE_REQUESTS]),
    deleteKeyword
);

router.get(
    '/donee-accounts/:doneeAccountId/get-keyword-matches',
    authenticate,
    authorizeActiveDoneeAccount([UserPermissionsEnum.MANAGE_REQUESTS]),
    getKeywordMatches
);

router.get(
    '/donee-accounts/:doneeAccountId/get-keyword-match-history',
    authenticate,
    authorizeActiveDoneeAccount([UserPermissionsEnum.MANAGE_REQUESTS]),
    getKeywordMatchHistory
);

export default router;
