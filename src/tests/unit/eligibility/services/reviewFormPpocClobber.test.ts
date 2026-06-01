// On edit-request approval, HAO sync and PPOC sync both write the same users/organization_users row.
// When one person is both HAO and Primary Contact, the PPOC sync (often carrying unchanged fields)
// used to run after HAO sync and overwrite the HAO edits. These tests pin: same user -> PPOC sync is
// skipped (HAO wins); different users -> PPOC sync still runs.

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    duplicate: jest.fn().mockReturnThis(),
    on: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn(),
  })),
);

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
}));

jest.mock('@/eligibility/models/Application.entity', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('@/eligibility/models/ApplicationForm.entity', () => ({ __esModule: true, default: { findOne: jest.fn(), count: jest.fn() } }));
jest.mock('@/eligibility/models/ApplicationLogs.entity', () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn() } }));

jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: { createNotification: jest.fn() },
  NotificationType: { ELIGIBILITY_STATUS_CHANGED: 'eligibilityStatusChanged' },
}));

jest.mock('@/organization/services/organization', () => ({
  OrganizationService: { updateOrganizationInfo: jest.fn(), sync3040MappingsForOrganization: jest.fn() },
}));
jest.mock('@/organization/services/organizationAddress.service', () => ({
  OrganizationAddressService: { getMailingFallbackFromDb: jest.fn(), syncFromForm1Payload: jest.fn() },
}));
jest.mock('@/organization/services/organizationUser', () => ({
  OrganizationUserService: { resolveHeadAndPrimaryFromUserScopes: jest.fn(), syncHeadAuthorizedOfficialFromForm1ToUserProfile: jest.fn() },
}));
jest.mock('@/organization/services/donee', () => ({
  DoneeAccountService: { primaryContactInfoChange: jest.fn() },
}));

import { Transaction } from 'sequelize';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { DoneeAccountService } from '@/organization/services/donee';
import { EligibilityApplicationFormStatuses, EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';

const mockedApplication = Application as unknown as { findByPk: jest.Mock };
const mockedApplicationForm = ApplicationForm as unknown as { findOne: jest.Mock; count: jest.Mock };
const mockedOrgUser = OrganizationUserService as unknown as { resolveHeadAndPrimaryFromUserScopes: jest.Mock; syncHeadAuthorizedOfficialFromForm1ToUserProfile: jest.Mock };
const mockedDonee = DoneeAccountService as unknown as { primaryContactInfoChange: jest.Mock };

const tx = { LOCK: Transaction.LOCK } as unknown as Transaction;

const FORM_DATA = {
  headAuthorizedOfficialName: 'Illia BunkovIVKs',
  headAuthorizedOfficialTitle: 'Test CHANGED',
  primaryContactName: 'Illia Bunkov',
  primaryContactTitle: 'Test',
  primaryContactPhone: '+109877577757',
};

const mutatingUpdate = function (this: Record<string, unknown>, values: Record<string, unknown>) {
  Object.assign(this, values);
  return Promise.resolve(this);
};

const setup = (scopes: Record<string, unknown>) => {
  mockedApplication.findByPk.mockResolvedValue({
    id: 442,
    status: EligibilityApplicationStatuses.CHANGE_REQUESTED,
    organization_id: 'org-1',
    donee_account_id: 848,
    update: mutatingUpdate,
  });
  mockedApplicationForm.findOne.mockResolvedValue({
    id: 1,
    status: EligibilityApplicationFormStatuses.EDITS_REQUESTED,
    is_required: true,
    expiry_date: 123,
    form_data: FORM_DATA,
    update: mutatingUpdate,
  });
  mockedApplicationForm.count.mockResolvedValue(0);
  mockedOrgUser.resolveHeadAndPrimaryFromUserScopes.mockResolvedValue(scopes);
  // Reviewer is SASP; the requester must be the opposite party for the approval to be allowed.
  jest.spyOn(EligibilityService, 'getLatestChangeRequestLog').mockResolvedValue(null);
  jest.spyOn(EligibilityService, 'getRequesterSideFromLog').mockReturnValue('donee');
};

beforeEach(() => jest.clearAllMocks());

describe('reviewForm edit-request approval — HAO/PPOC same-user clobber', () => {
  it('skips PPOC sync when the Primary Contact is the same user as the HAO', async () => {
    setup({ headAuthorizedOfficialUserId: 'U', primaryContactUserId: 'U', primaryContactHasDedicatedScope: true, primaryDoneeAccountId: 848 });

    await EligibilityService.reviewForm(442, 1, true, null, 123, tx, undefined, 'reviewer', false, FORM_DATA, 'sasp');

    expect(mockedOrgUser.syncHeadAuthorizedOfficialFromForm1ToUserProfile).toHaveBeenCalledTimes(1);
    expect(mockedDonee.primaryContactInfoChange).not.toHaveBeenCalled();
  });

  it('still runs PPOC sync when the Primary Contact is a different user', async () => {
    setup({ headAuthorizedOfficialUserId: 'U', primaryContactUserId: 'V', primaryContactHasDedicatedScope: true, primaryDoneeAccountId: 848 });

    await EligibilityService.reviewForm(442, 1, true, null, 123, tx, undefined, 'reviewer', false, FORM_DATA, 'sasp');

    expect(mockedOrgUser.syncHeadAuthorizedOfficialFromForm1ToUserProfile).toHaveBeenCalledTimes(1);
    expect(mockedDonee.primaryContactInfoChange).toHaveBeenCalledTimes(1);
  });
});
