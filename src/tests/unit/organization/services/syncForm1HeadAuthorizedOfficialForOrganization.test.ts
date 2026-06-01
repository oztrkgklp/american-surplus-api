// Bug 5 (propagation-completeness): after HAO rotation (changeHeadAuthorizedRepresentative),
// the new head's profile must be written into form 1 form_data of every application in the org,
// so PDFs (and form-1 UI) reflect the rotation without waiting for each application to be re-saved.

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

jest.mock('@/eligibility/models/Application.entity', () => ({
  __esModule: true,
  default: { findAll: jest.fn() },
}));

jest.mock('@/eligibility/models/ApplicationForm.entity', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import { OrganizationUserService } from '@/organization/services/organizationUser';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';

const mockedApplication = Application as unknown as { findAll: jest.Mock };
const mockedApplicationForm = ApplicationForm as unknown as { findOne: jest.Mock };

const organizationId = 'org-1';

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('syncForm1HeadAuthorizedOfficialForOrganization — rewrites form 1 across all org apps', () => {
  it('writes the resolved head profile into form 1 of every application in the org', async () => {
    jest.spyOn(OrganizationUserService, 'resolveHeadAndPrimaryFromUserScopes').mockResolvedValue({
      headAuthorizedOfficialUserId: 'new-hao',
      headAuthorizedOfficialName: 'New HAO',
      headAuthorizedOfficialEmail: 'ozturkgokalp000@gmail.com',
      headAuthorizedOfficialTitle: 'Director',
      headAuthorizedOfficialPhone: '999',
    } as never);

    const form1A = { form_data: { headAuthorizedOfficialName: 'Old', someOther: 'x' } as Record<string, unknown>, update: jest.fn() };
    const form1B = { form_data: '{}', update: jest.fn() };
    mockedApplication.findAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockedApplicationForm.findOne.mockImplementation(({ where }) => {
      if (where.application_id === 1) return Promise.resolve(form1A);
      if (where.application_id === 2) return Promise.resolve(form1B);
      return Promise.resolve(null);
    });

    await OrganizationUserService.syncForm1HeadAuthorizedOfficialForOrganization(organizationId);

    expect(form1A.update).toHaveBeenCalledWith(
      { form_data: expect.objectContaining({
        headAuthorizedOfficialName: 'New HAO',
        headAuthorizedOfficialEmail: 'ozturkgokalp000@gmail.com',
        headAuthorizedOfficialTitle: 'Director',
        headAuthorizedOfficialPhone: '999',
        someOther: 'x',
      })},
      expect.anything(),
    );
    expect(form1B.update).toHaveBeenCalledWith(
      { form_data: expect.objectContaining({
        headAuthorizedOfficialName: 'New HAO',
        headAuthorizedOfficialEmail: 'ozturkgokalp000@gmail.com',
        headAuthorizedOfficialTitle: 'Director',
        headAuthorizedOfficialPhone: '999',
      })},
      expect.anything(),
    );
  });

  it('exits silently when there is no resolved head (no scope rows)', async () => {
    jest.spyOn(OrganizationUserService, 'resolveHeadAndPrimaryFromUserScopes').mockResolvedValue({
      headAuthorizedOfficialUserId: undefined,
      headAuthorizedOfficialName: '',
      headAuthorizedOfficialEmail: '',
      headAuthorizedOfficialTitle: '',
      headAuthorizedOfficialPhone: '',
    } as never);

    await OrganizationUserService.syncForm1HeadAuthorizedOfficialForOrganization(organizationId);

    expect(mockedApplication.findAll).not.toHaveBeenCalled();
  });

  it('skips applications that have no form 1 row (no throw)', async () => {
    jest.spyOn(OrganizationUserService, 'resolveHeadAndPrimaryFromUserScopes').mockResolvedValue({
      headAuthorizedOfficialUserId: 'u',
      headAuthorizedOfficialName: 'N',
      headAuthorizedOfficialEmail: 'e',
      headAuthorizedOfficialTitle: 'T',
      headAuthorizedOfficialPhone: 'P',
    } as never);
    mockedApplication.findAll.mockResolvedValue([{ id: 1 }]);
    mockedApplicationForm.findOne.mockResolvedValue(null);

    await expect(OrganizationUserService.syncForm1HeadAuthorizedOfficialForOrganization(organizationId))
      .resolves.not.toThrow();
  });
});
