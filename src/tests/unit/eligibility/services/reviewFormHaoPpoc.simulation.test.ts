// Behavioral simulation of the edit-request approval HAO/PPOC sync. Unlike reviewFormPpocClobber
// (which mocks the sync services and only checks which branch runs), this runs the REAL
// syncHeadAuthorizedOfficialFromForm1ToUserProfile + primaryContactInfoChange against stateful
// in-memory User / OrganizationUser rows and asserts the FINAL persisted identity — i.e. what the
// form would prefill on reload. Only the surrounding lookups (org info, address, scope resolution)
// are stubbed; the identity writes are the real thing.

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

jest.mock('@/authn/models/User', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('@/organization/models/DoneeAccount', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('@/authz/models/UserScope', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('@/eligibility/models/Application.entity', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('@/eligibility/models/ApplicationForm.entity', () => ({ __esModule: true, default: { findOne: jest.fn(), count: jest.fn() } }));
jest.mock('@/eligibility/models/ApplicationLogs.entity', () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: { createNotification: jest.fn() },
  NotificationType: { ELIGIBILITY_STATUS_CHANGED: 'eligibilityStatusChanged' },
}));

import { Transaction } from 'sequelize';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { OrganizationService } from '@/organization/services/organization';
import { OrganizationAddressService } from '@/organization/services/organizationAddress.service';
import User from '@/authn/models/User';
import DoneeAccount from '@/organization/models/DoneeAccount';
import UserScope from '@/authz/models/UserScope';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';

const mockedUser = User as unknown as { findByPk: jest.Mock };
const mockedDonee = DoneeAccount as unknown as { findByPk: jest.Mock };
const mockedUserScope = UserScope as unknown as { findOne: jest.Mock };
const mockedApplication = Application as unknown as { findByPk: jest.Mock };
const mockedApplicationForm = ApplicationForm as unknown as { findOne: jest.Mock; count: jest.Mock };

const tx = { LOCK: Transaction.LOCK } as unknown as Transaction;
const ORG_ID = 'org-1';
const DONEE_ID = 848;

type Row = Record<string, unknown> & { update: (vals: Record<string, unknown>) => Promise<unknown> };
const makeRow = (fields: Record<string, unknown>): Row => ({
  ...fields,
  update(vals: Record<string, unknown>) {
    Object.assign(this, vals);
    return Promise.resolve(this);
  },
});

// HAO section carries the edits; PPOC section carries the (older) unchanged values. Email matches the
// account so the HAO User.name rename is allowed.
const FORM_DATA = {
  headAuthorizedOfficialName: 'Illia BunkovIVKs',
  headAuthorizedOfficialTitle: 'Test CHANGED',
  headAuthorizedOfficialPhone: '+109877577757007',
  headAuthorizedOfficialEmail: 'ozturkgokalp000@gmail.com',
  primaryContactName: 'Illia Bunkov',
  primaryContactTitle: 'Test',
  primaryContactPhone: '+109877577757',
};

let userRows: Record<string, Row>;
let orgUserRows: Record<string, Row>;

function wire(scopes: Record<string, unknown>) {
  userRows = {
    U: makeRow({ id: 'U', name: 'Illia Bunkov', email: 'ozturkgokalp000@gmail.com' }),
    V: makeRow({ id: 'V', name: 'Some Contact', email: 'ozturkgokalp000@gmail.com' }),
  };
  orgUserRows = {
    U: makeRow({ id: 966, title: 'Test', phoneNumber: '+109877577757' }),
    V: makeRow({ id: 967, title: 'Old PPOC Title', phoneNumber: '+1000000000' }),
  };

  mockedUser.findByPk.mockImplementation((id: string) => Promise.resolve(userRows[id] ?? null));
  mockedDonee.findByPk.mockResolvedValue(makeRow({ id: DONEE_ID, organizationId: ORG_ID }));
  mockedUserScope.findOne.mockResolvedValue({ id: 1, is_primary_contact: true });

  mockedApplication.findByPk.mockResolvedValue(
    makeRow({ id: 442, status: 'Change_Requested', organization_id: ORG_ID, donee_account_id: DONEE_ID }),
  );
  mockedApplicationForm.findOne.mockResolvedValue(
    makeRow({ id: 1, status: 'Edits_Requested', is_required: true, expiry_date: 123, form_data: FORM_DATA }),
  );
  mockedApplicationForm.count.mockResolvedValue(0);

  jest.spyOn(OrganizationUserService, 'userIsHeadAuthorizedOfficialForOrganization').mockResolvedValue(true);
  jest.spyOn(OrganizationUserService, 'getRecordByOrganizationAndUser')
    .mockImplementation((_org: string, userId: string) => Promise.resolve(orgUserRows[userId] as never));
  jest.spyOn(OrganizationUserService, 'invalidateUserScopeCaches').mockResolvedValue(undefined as never);
  jest.spyOn(OrganizationUserService, 'syncForm1PrimaryContactFromUserProfile').mockResolvedValue(undefined as never);
  jest.spyOn(OrganizationUserService, 'resolveHeadAndPrimaryFromUserScopes').mockResolvedValue(scopes as never);
  jest.spyOn(OrganizationService, 'updateOrganizationInfo').mockResolvedValue(undefined as never);
  jest.spyOn(OrganizationAddressService, 'getMailingFallbackFromDb').mockResolvedValue({} as never);
  jest.spyOn(OrganizationAddressService, 'syncFromForm1Payload').mockResolvedValue(undefined as never);
  jest.spyOn(EligibilityService, 'getLatestChangeRequestLog').mockResolvedValue(null);
  jest.spyOn(EligibilityService, 'getRequesterSideFromLog').mockReturnValue('donee');
}

const approveAsSasp = () =>
  EligibilityService.reviewForm(442, 1, true, null, 123, tx, undefined, 'reviewer', false, FORM_DATA, 'sasp');

afterEach(() => jest.restoreAllMocks());
beforeEach(() => jest.clearAllMocks());

describe('reviewForm HAO/PPOC behavioral simulation', () => {
  it('same person: editing HAO updates the live profile and is NOT reverted by the unchanged PPOC section', async () => {
    wire({ headAuthorizedOfficialUserId: 'U', primaryContactUserId: 'U', primaryContactHasDedicatedScope: true, primaryDoneeAccountId: DONEE_ID });

    await approveAsSasp();

    // The one identity row reflects the HAO edits. Since the form prefills both HAO and PPOC from this
    // same row, both sections show these values on reload.
    expect(userRows.U.name).toBe('Illia BunkovIVKs');
    expect(orgUserRows.U.title).toBe('Test CHANGED');
    expect(orgUserRows.U.phoneNumber).toBe('+109877577757007');
  });

  it('different people: each identity row is updated from its own section, no cross-contamination', async () => {
    wire({ headAuthorizedOfficialUserId: 'U', primaryContactUserId: 'V', primaryContactHasDedicatedScope: true, primaryDoneeAccountId: DONEE_ID });

    await approveAsSasp();

    expect(userRows.U.name).toBe('Illia BunkovIVKs');
    expect(orgUserRows.U.title).toBe('Test CHANGED');
    expect(orgUserRows.U.phoneNumber).toBe('+109877577757007');

    expect(userRows.V.name).toBe('Illia Bunkov');
    expect(orgUserRows.V.title).toBe('Test');
    expect(orgUserRows.V.phoneNumber).toBe('+109877577757');
  });

  it('mechanism canary: running both syncs on the same row (no guard) clobbers HAO with PPOC', async () => {
    // Documents WHY the guard exists. If applyForm1 ever stops skipping PPOC for a shared user, the
    // same-person test above flips to these clobbered values.
    wire({ headAuthorizedOfficialUserId: 'U', primaryContactUserId: 'U', primaryContactHasDedicatedScope: true, primaryDoneeAccountId: DONEE_ID });

    await OrganizationUserService.syncHeadAuthorizedOfficialFromForm1ToUserProfile('U', ORG_ID, FORM_DATA, tx);
    expect(orgUserRows.U.title).toBe('Test CHANGED'); // HAO applied first

    const { DoneeAccountService } = await import('@/organization/services/donee');
    await DoneeAccountService.primaryContactInfoChange(
      DONEE_ID, ORG_ID, 'U',
      { primary_contact_full_name: 'Illia Bunkov', primary_contact_title: 'Test', primary_contact_phone: '+109877577757' },
      tx,
    );

    expect(userRows.U.name).toBe('Illia Bunkov'); // clobbered back
    expect(orgUserRows.U.title).toBe('Test');      // clobbered back
  });
});
