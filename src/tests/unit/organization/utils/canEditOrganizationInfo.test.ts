import {
  getCanEditOrganizationInfoForApplications,
} from '@/organization/utils/canEditOrganizationInfo';
import {
  EligibilityApplicationFormStatuses,
  EligibilityApplicationStatuses,
} from '@/enums/eligibilityStatus.enum';

describe('getCanEditOrganizationInfoForApplications', () => {
  it('allows edit when there are no applications', () => {
    expect(getCanEditOrganizationInfoForApplications([])).toBe(true);
  });

  it('allows edit for draft and renewal-required statuses', () => {
    expect(
      getCanEditOrganizationInfoForApplications([
        { status: EligibilityApplicationStatuses.DRAFT } as never,
        { status: EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED } as never,
      ]),
    ).toBe(true);
  });

  it('blocks edit when any application is submitted', () => {
    expect(
      getCanEditOrganizationInfoForApplications([
        { status: EligibilityApplicationStatuses.DRAFT } as never,
        { status: EligibilityApplicationStatuses.SUBMITTED } as never,
      ]),
    ).toBe(false);
  });

  it('allows form expired only when forms 1 and 2 are expired', () => {
    expect(
      getCanEditOrganizationInfoForApplications([
        {
          status: EligibilityApplicationStatuses.FORM_EXPIRED,
          applicationForms: [
            { form_id: 1, status: EligibilityApplicationFormStatuses.FORM_EXPIRED },
            { form_id: 2, status: EligibilityApplicationFormStatuses.FORM_EXPIRED },
          ],
        } as never,
      ]),
    ).toBe(true);
  });
});
