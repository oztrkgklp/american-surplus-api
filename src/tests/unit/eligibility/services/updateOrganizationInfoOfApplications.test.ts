// updateOrganizationInfoOfApplications keeps stored Form 1/2 JSON in sync with org changes, but must
// only touch DRAFT applications — rewriting form_data on submitted/approved ones would mutate signed
// records. These scenarios pin the DRAFT-only query and the name → organizationName field mapping.

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

jest.mock('@/organization/services/organizationAddress.service', () => ({
  OrganizationAddressService: {
    listByOrganizationId: jest.fn().mockResolvedValue([]),
    toForm1AddressFields: jest.fn().mockReturnValue({}),
  },
}));

import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';

const mockedApplication = Application as unknown as { findAll: jest.Mock };
const mockedApplicationForm = ApplicationForm as unknown as { findOne: jest.Mock };

beforeEach(() => jest.clearAllMocks());

describe('EligibilityService.updateOrganizationInfoOfApplications', () => {
  it('only loads DRAFT applications for the organization', async () => {
    mockedApplication.findAll.mockResolvedValue([]);

    await EligibilityService.updateOrganizationInfoOfApplications('org-1', { name: 'New Org Name' }, false);

    expect(mockedApplication.findAll).toHaveBeenCalledTimes(1);
    const arg = mockedApplication.findAll.mock.calls[0][0];
    expect(arg.where).toMatchObject({ organization_id: 'org-1', status: EligibilityApplicationStatuses.DRAFT });
  });

  it('maps updates.name onto Form 1 organizationName and persists it', async () => {
    mockedApplication.findAll.mockResolvedValue([{ id: 42 }]);

    const form1Update = jest.fn();
    const form1 = { id: 1, form_id: 1, form_data: {}, update: form1Update };
    // form_id 2 lookup returns nothing; form_id 1 returns our Form 1 instance.
    mockedApplicationForm.findOne.mockImplementation(async ({ where }: { where: { form_id: number } }) =>
      where.form_id === 1 ? form1 : null,
    );

    await EligibilityService.updateOrganizationInfoOfApplications('org-1', { name: 'New Org Name' }, false);

    expect(form1Update).toHaveBeenCalledTimes(1);
    const [values] = form1Update.mock.calls[0];
    expect(values.form_data).toMatchObject({ organizationName: 'New Org Name' });
  });

  it('passes a NEW form_data object to update, not the stored reference (Sequelize skips no-ref-change JSON updates)', async () => {
    mockedApplication.findAll.mockResolvedValue([{ id: 42 }]);

    const originalFormData = { organizationName: 'Old', officeLocationAddress: { addressLine1: 'OLD' } };
    const form1Update = jest.fn();
    const form1 = { id: 1, form_id: 1, form_data: originalFormData, update: form1Update };
    mockedApplicationForm.findOne.mockImplementation(async ({ where }: { where: { form_id: number } }) =>
      where.form_id === 1 ? form1 : null,
    );

    await EligibilityService.updateOrganizationInfoOfApplications('org-1', { name: 'New Org Name' }, false);

    const [values] = form1Update.mock.calls[0];
    // Must be a fresh object; otherwise Sequelize sees new===current for the JSON column and skips the UPDATE.
    expect(values.form_data).not.toBe(originalFormData);
    expect(values.form_data).toMatchObject({ organizationName: 'New Org Name' });
  });
});
