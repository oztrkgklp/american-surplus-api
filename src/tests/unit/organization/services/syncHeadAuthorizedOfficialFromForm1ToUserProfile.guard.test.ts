// Bug 6 (propagation-completeness): the email-mismatch guard used to silently abort EVERYTHING
// (name + title + phone). Now it only blocks User.name (the risky account-rename case); the
// OrganizationUser.title/phoneNumber updates are org-scoped and proceed regardless.

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

jest.mock('@/authn/models/User', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

import { OrganizationUserService } from '@/organization/services/organizationUser';
import User from '@/authn/models/User';

const mockedUser = User as unknown as { findByPk: jest.Mock };

const userId = 'u1';
const organizationId = 'org-1';

function setupResolvedHead() {
  jest.spyOn(OrganizationUserService, 'userIsHeadAuthorizedOfficialForOrganization').mockResolvedValue(true);
  const userInstance = {
    id: userId,
    name: 'OldName',
    email: 'ozturkgokalp000@gmail.com',
    update: jest.fn(),
  };
  mockedUser.findByPk.mockResolvedValue(userInstance);
  const orgUserInstance = {
    title: 'Old Title',
    phoneNumber: '111',
    update: jest.fn(),
  };
  jest.spyOn(OrganizationUserService, 'getRecordByOrganizationAndUser').mockResolvedValue(orgUserInstance as never);
  jest.spyOn(OrganizationUserService, 'invalidateUserScopeCaches').mockResolvedValue(undefined as never);
  return { userInstance, orgUserInstance };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('syncHeadAuthorizedOfficialFromForm1ToUserProfile — narrowed email-mismatch guard', () => {
  it('matches email → updates both User.name and OrganizationUser.title/phone', async () => {
    const { userInstance, orgUserInstance } = setupResolvedHead();

    await OrganizationUserService.syncHeadAuthorizedOfficialFromForm1ToUserProfile(userId, organizationId, {
      headAuthorizedOfficialEmail: 'ozturkgokalp000@gmail.com',
      headAuthorizedOfficialName: 'NewName',
      headAuthorizedOfficialTitle: 'NewTitle',
      headAuthorizedOfficialPhone: '555',
    });

    expect(userInstance.update).toHaveBeenCalledWith({ name: 'NewName' }, expect.anything());
    expect(orgUserInstance.update).toHaveBeenCalledWith({ title: 'NewTitle', phoneNumber: '555' }, expect.anything());
  });

  it('email mismatch → skips User.name BUT still syncs OrganizationUser.title/phone', async () => {
    const { userInstance, orgUserInstance } = setupResolvedHead();

    await OrganizationUserService.syncHeadAuthorizedOfficialFromForm1ToUserProfile(userId, organizationId, {
      headAuthorizedOfficialEmail: 'ozturkgokalp000@gmail.com',
      headAuthorizedOfficialName: 'NewName',
      headAuthorizedOfficialTitle: 'NewTitle',
      headAuthorizedOfficialPhone: '555',
    });

    expect(userInstance.update).not.toHaveBeenCalled();
    expect(orgUserInstance.update).toHaveBeenCalledWith({ title: 'NewTitle', phoneNumber: '555' }, expect.anything());
  });

  it('empty form email → no mismatch, name updates normally', async () => {
    const { userInstance } = setupResolvedHead();

    await OrganizationUserService.syncHeadAuthorizedOfficialFromForm1ToUserProfile(userId, organizationId, {
      headAuthorizedOfficialEmail: '',
      headAuthorizedOfficialName: 'NewName',
    });

    expect(userInstance.update).toHaveBeenCalledWith({ name: 'NewName' }, expect.anything());
  });

  it('user is not the org head → returns without touching anyone', async () => {
    jest.spyOn(OrganizationUserService, 'userIsHeadAuthorizedOfficialForOrganization').mockResolvedValue(false);

    await OrganizationUserService.syncHeadAuthorizedOfficialFromForm1ToUserProfile(userId, organizationId, {
      headAuthorizedOfficialName: 'X',
    });

    expect(mockedUser.findByPk).not.toHaveBeenCalled();
  });
});
