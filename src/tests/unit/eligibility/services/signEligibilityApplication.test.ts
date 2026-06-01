// signApplicationDocument writes pdf_path on its own Application instance, so the instance
// signEligibilityApplication returns must be reloaded — else callers snapshot the pre-sign path.

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
  EligibilityApplicationDocumentService: { signApplicationDocument: jest.fn() },
}));

import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Application from '@/eligibility/models/Application.entity';
import { EligibilityApplicationDocumentService } from '@/eligibility/services/eligibilityApplicationDocument.service';
import type User from '@/authn/models/User';

const mockedApplication = Application as unknown as { findByPk: jest.Mock };
const mockedDocService = EligibilityApplicationDocumentService as unknown as { signApplicationDocument: jest.Mock };

const signer = { id: 'user-1', name: 'Joe Donee' } as unknown as User;

beforeEach(() => jest.clearAllMocks());

describe('EligibilityService.signEligibilityApplication', () => {
  it('returns the application reflecting the pdf_path written during signing, not the pre-sign value', async () => {
    // reload() mimics the DB row after signApplicationDocument persisted the new file.
    const appInstance: Record<string, unknown> = { id: 7, status: 'submitted', pdf_path: '/storage/app_7_rejected.pdf' };
    appInstance.reload = jest.fn(async () => { appInstance.pdf_path = '/storage/app_7_signed.pdf'; return appInstance; });
    mockedApplication.findByPk.mockResolvedValue(appInstance);
    mockedDocService.signApplicationDocument.mockResolvedValue({ documentPath: '/storage/app_7_signed.pdf', displayName: 'Eligibility_Application_Signed_7' });

    const result = await EligibilityService.signEligibilityApplication(7, signer);

    expect(result.application.pdf_path).toBe('/storage/app_7_signed.pdf');
    expect(result.document).toBe('/storage/app_7_signed.pdf');
  });

  it('reloads inside the same transaction so the fresh row is visible before commit', async () => {
    const reload = jest.fn(async function (this: Record<string, unknown>) { this.pdf_path = '/signed.pdf'; });
    const appInstance: Record<string, unknown> = { id: 7, pdf_path: '/old.pdf', reload };
    mockedApplication.findByPk.mockResolvedValue(appInstance);
    mockedDocService.signApplicationDocument.mockResolvedValue({ documentPath: '/signed.pdf', displayName: 'x' });
    const tx = { id: 'tx-1' };

    await EligibilityService.signEligibilityApplication(7, signer, tx as never);

    expect(mockedApplication.findByPk).toHaveBeenCalledWith(7, { transaction: tx });
    expect(mockedDocService.signApplicationDocument).toHaveBeenCalledWith(7, signer, tx);
    expect(reload).toHaveBeenCalledWith({ transaction: tx });
  });

  it('forwards signing options when provided', async () => {
    const appInstance: Record<string, unknown> = {
      id: 7,
      pdf_path: '/old.pdf',
      reload: jest.fn(async function (this: Record<string, unknown>) { this.pdf_path = '/signed.pdf'; }),
    };
    mockedApplication.findByPk.mockResolvedValue(appInstance);
    mockedDocService.signApplicationDocument.mockResolvedValue({ documentPath: '/signed.pdf', displayName: 'x' });
    const tx = { id: 'tx-2' };
    const options = { preserveSaspSignature: true, refreshSignatureDates: true };

    await EligibilityService.signEligibilityApplication(7, signer, tx as never, options);

    expect(mockedDocService.signApplicationDocument).toHaveBeenCalledWith(7, signer, tx, options);
  });

  it('throws when the application does not exist', async () => {
    mockedApplication.findByPk.mockResolvedValue(null);

    await expect(EligibilityService.signEligibilityApplication(999, signer)).rejects.toThrow('Application not found');
    expect(mockedDocService.signApplicationDocument).not.toHaveBeenCalled();
  });
});
