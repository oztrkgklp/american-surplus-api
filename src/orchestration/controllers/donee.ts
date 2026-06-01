import { Request, Response } from 'express';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { DoneeAccountService } from '@/organization/services/donee';
import { parseId } from '@/utils/validators';

/**
 * Handles fetching all organization donee accounts.
 */
export const getDoneeAccounts = async (req: Request, res: Response): Promise<void> => {
    try {
        const organizationId = req.params.organizationId; // Extract `orgId` from the request
        const doneeAccounts = await DoneeAccountService.getDoneeAccounts(organizationId); // Fetch donee accounts scoped to the organization
        sendSuccess(res, doneeAccounts);
    } catch (error) {
        sendError(req, res, error);
    }
};
