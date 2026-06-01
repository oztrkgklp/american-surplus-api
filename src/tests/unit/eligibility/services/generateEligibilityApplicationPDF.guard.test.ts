// Bug 2 (pdf-render-fixes): /generate-pdf must refuse to regenerate for signed-status applications,
// because the generate path hardcodes saspApprovingOfficial* to '' — running it on an APPROVED
// application would overwrite pdf_path with an unsigned copy and visually strip the SASP signature.

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
  default: { findByPk: jest.fn() },
}));

jest.mock('@/eligibility/services/eligibilityApplicationDocument.service', () => ({
  EligibilityApplicationDocumentService: { generateApplicationDocument: jest.fn() },
}));

import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Application from '@/eligibility/models/Application.entity';
import { EligibilityApplicationDocumentService } from '@/eligibility/services/eligibilityApplicationDocument.service';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import type User from '@/authn/models/User';

const mockedApplication = Application as unknown as { findByPk: jest.Mock };
const mockedDocService = EligibilityApplicationDocumentService as unknown as { generateApplicationDocument: jest.Mock };
const creator = { id: 'user-1' } as unknown as User;

beforeEach(() => jest.clearAllMocks());

describe('EligibilityService.generateEligibilityApplicationPDF — signed-status guard', () => {
  const blockedStatuses: EligibilityApplicationStatuses[] = [
    EligibilityApplicationStatuses.APPROVED,
    EligibilityApplicationStatuses.DENIED,
    EligibilityApplicationStatuses.CHANGE_REQUESTED,
    EligibilityApplicationStatuses.CHANGES_RETURNED,
    EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE,
  ];

  it.each(blockedStatuses)('refuses to regenerate for status "%s" (would wipe stored signature)', async (status) => {
    mockedApplication.findByPk.mockResolvedValue({ id: 1, status });

    await expect(EligibilityService.generateEligibilityApplicationPDF(1, creator)).rejects.toThrow(/Cannot regenerate PDF/);
    expect(mockedDocService.generateApplicationDocument).not.toHaveBeenCalled();
  });

  it.each([
    EligibilityApplicationStatuses.DRAFT,
    EligibilityApplicationStatuses.REJECTED,
    EligibilityApplicationStatuses.FORM_RENEWAL_REQUIRED,
  ])('proceeds for pre-sign status "%s"', async (status) => {
    mockedApplication.findByPk.mockResolvedValue({ id: 2, status });
    mockedDocService.generateApplicationDocument.mockResolvedValue({ documentPath: '/storage/app_2.pdf', displayName: 'app_2' });

    const result = await EligibilityService.generateEligibilityApplicationPDF(2, creator);

    expect(result.document).toBe('/storage/app_2.pdf');
    expect(mockedDocService.generateApplicationDocument).toHaveBeenCalledWith(2, creator);
  });

  it('throws 404 when the application does not exist', async () => {
    mockedApplication.findByPk.mockResolvedValue(null);

    await expect(EligibilityService.generateEligibilityApplicationPDF(999, creator)).rejects.toThrow('Application not found');
    expect(mockedDocService.generateApplicationDocument).not.toHaveBeenCalled();
  });
});
