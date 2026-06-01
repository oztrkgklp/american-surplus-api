import type { Request, Response } from 'express';

// ---- Module-level mocks (must come before importing the controller) ------

jest.mock('@/utils/response/responseHelper', () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
}));

jest.mock('@/utils/transactionalOperation', () => ({
  withTransaction: jest.fn(async (fn: (t: object) => unknown) => fn({})),
}));

jest.mock('@/eligibility/services/eligibility.service', () => ({
  EligibilityService: {
    denyApplication: jest.fn(),
    submitApplication: jest.fn(),
    approveApplication: jest.fn(),
    signEligibilityApplication: jest.fn(),
    getApplicationHistory: jest.fn(),
    getApplicationLogPdf: jest.fn(),
  },
}));

jest.mock('@/eligibility/models/ApplicationLogs.entity', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

jest.mock('@/sasp/models/SaspAuditLogs.entity', () => ({
  __esModule: true,
  default: { create: jest.fn() },
  Activity: { APPLICATION_APPROVED: 'APPLICATION_APPROVED' },
}));

jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: { createNotification: jest.fn() },
  NotificationType: {},
}));

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

// ---- Imports under test --------------------------------------------------

import {
  denyApplication,
  submitApplication,
  approveApplication,
  getApplicationHistory,
  downloadApplicationLogPdf,
} from '@/orchestration/controllers/organization';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import ApplicationLog from '@/eligibility/models/ApplicationLogs.entity';
import { sendSuccess, sendError } from '@/utils/response/responseHelper';
import { EligbilityActions } from '@/enums/eligibilityActions.enum';
import { ScopeType } from '@/enums/scope.enum';

const mockedService = EligibilityService as unknown as {
  denyApplication: jest.Mock;
  submitApplication: jest.Mock;
  approveApplication: jest.Mock;
  signEligibilityApplication: jest.Mock;
  getApplicationHistory: jest.Mock;
  getApplicationLogPdf: jest.Mock;
};
const mockedLog = ApplicationLog as unknown as { create: jest.Mock };

const makeRes = (): Response =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  }) as unknown as Response;

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    params: {},
    body: {},
    query: {},
    user: { id: 'user-1', scopes: [] },
    ...overrides,
  }) as unknown as Request;

const saspScopes = [{ type: ScopeType.SASP, isActive: true, stateId: 1 }];
const doneeScopes = [{ type: ScopeType.DONEE, isActive: true }];

beforeEach(() => jest.clearAllMocks());

describe('denyApplication controller', () => {
  it('errors out when deny_reason is missing from the body', async () => {
    const req = makeReq({ params: { applicationId: '5' }, body: {} });
    const res = makeRes();

    await denyApplication(req, res);

    expect(sendError).toHaveBeenCalledTimes(1);
    expect(mockedService.denyApplication).not.toHaveBeenCalled();
    expect(mockedLog.create).not.toHaveBeenCalled();
  });

  it('writes an APPLICATION_DENIED log with metadata.deny_reason after the service call', async () => {
    const req = makeReq({
      params: { applicationId: '42' },
      body: { deny_reason: 'Missing attestation page 4' },
      user: { id: 'sasp-1' },
    });
    const res = makeRes();
    mockedService.denyApplication.mockResolvedValue(undefined);

    await denyApplication(req, res);

    expect(mockedService.denyApplication).toHaveBeenCalledWith(42, 'Missing attestation page 4', {});
    expect(mockedLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        application_id: 42,
        user_id: 'sasp-1',
        action: EligbilityActions.APPLICATION_DENIED,
        metadata: { deny_reason: 'Missing attestation page 4' },
      }),
      expect.any(Object),
    );
    expect(sendSuccess).toHaveBeenCalled();
  });
});

describe('submitApplication controller — sign-before-log atomicity', () => {
  it('snapshots the post-sign pdf_path into the log, not the pre-sign value', async () => {
    const req = makeReq({ params: { applicationId: '10' }, user: { id: 'donee-1', name: 'Donee Joe' } });
    const res = makeRes();
    mockedService.submitApplication.mockResolvedValue({ id: 10, pdf_path: '/storage/eligibility_10_draft.pdf' });
    mockedService.signEligibilityApplication.mockResolvedValue({
      application: { id: 10, pdf_path: '/storage/eligibility_10_signed.pdf' },
    });

    await submitApplication(req, res);

    expect(mockedLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: EligbilityActions.APPLICATION_SUBMITTED,
        metadata: { pdf_path: '/storage/eligibility_10_signed.pdf' },
      }),
      expect.any(Object),
    );
  });

  it('calls submitApplication then signEligibilityApplication then log create, in that order', async () => {
    const req = makeReq({ params: { applicationId: '10' }, user: { id: 'donee-1' } });
    const res = makeRes();
    const calls: string[] = [];
    mockedService.submitApplication.mockImplementation(async () => { calls.push('submit'); return { id: 10, pdf_path: '/draft.pdf' }; });
    mockedService.signEligibilityApplication.mockImplementation(async () => { calls.push('sign'); return { application: { id: 10, pdf_path: '/signed.pdf' } }; });
    mockedLog.create.mockImplementation(async () => { calls.push('log'); });

    await submitApplication(req, res);

    expect(calls).toEqual(['submit', 'sign', 'log']);
  });

  it('passes req.user as signedBy so the donee identity is recorded on the PDF', async () => {
    const donee = { id: 'donee-1', name: 'Donee Joe' };
    const req = makeReq({ params: { applicationId: '10' }, user: donee });
    const res = makeRes();
    mockedService.submitApplication.mockResolvedValue({ id: 10, pdf_path: '/draft.pdf' });
    mockedService.signEligibilityApplication.mockResolvedValue({ application: { id: 10, pdf_path: '/signed.pdf' } });

    await submitApplication(req, res);

    expect(mockedService.signEligibilityApplication).toHaveBeenCalledWith(10, donee, expect.any(Object));
  });

  it('does not create a log when signing fails', async () => {
    const req = makeReq({ params: { applicationId: '10' }, user: { id: 'donee-1' } });
    const res = makeRes();
    mockedService.submitApplication.mockResolvedValue({ id: 10, pdf_path: '/draft.pdf' });
    mockedService.signEligibilityApplication.mockRejectedValue(new Error('puppeteer crashed'));

    await submitApplication(req, res);

    expect(mockedLog.create).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalled();
  });
});

describe('approveApplication controller — sign-before-log atomicity', () => {
  it('snapshots the SASP-signed pdf_path into the log, not the pre-approve donee-signed file', async () => {
    const req = makeReq({
      params: { applicationId: '11' },
      body: { name: 'Test Account' },
      user: { id: 'sasp-1', name: 'SASP Reviewer' },
    });
    const res = makeRes();
    mockedService.approveApplication.mockResolvedValue({ id: 11, pdf_path: '/storage/donee_signed_11.pdf', state_id: 1 });
    mockedService.signEligibilityApplication.mockResolvedValue({
      application: { id: 11, pdf_path: '/storage/sasp_signed_11.pdf', state_id: 1 },
    });

    await approveApplication(req, res);

    expect(mockedLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: EligbilityActions.APPLICATION_APPROVED,
        metadata: expect.objectContaining({ name: 'Test Account', pdf_path: '/storage/sasp_signed_11.pdf' }),
      }),
      expect.any(Object),
    );
  });

  it('passes the SASP user as signedBy so the rendered PDF reflects SASP signature', async () => {
    const sasp = { id: 'sasp-1', name: 'SASP Reviewer' };
    const req = makeReq({ params: { applicationId: '11' }, body: { name: 'Test Account' }, user: sasp });
    const res = makeRes();
    mockedService.approveApplication.mockResolvedValue({ id: 11, pdf_path: '/donee.pdf', state_id: 1 });
    mockedService.signEligibilityApplication.mockResolvedValue({ application: { id: 11, pdf_path: '/sasp.pdf', state_id: 1 } });

    await approveApplication(req, res);

    expect(mockedService.signEligibilityApplication).toHaveBeenCalledWith(11, sasp, expect.any(Object));
  });

  it('does not create a log when SASP signing fails after approval', async () => {
    const req = makeReq({ params: { applicationId: '11' }, body: { name: 'Test Account' }, user: { id: 'sasp-1' } });
    const res = makeRes();
    mockedService.approveApplication.mockResolvedValue({ id: 11, pdf_path: '/donee.pdf', state_id: 1 });
    mockedService.signEligibilityApplication.mockRejectedValue(new Error('puppeteer crashed'));

    await approveApplication(req, res);

    expect(mockedLog.create).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalled();
  });
});

describe('getApplicationHistory controller — SASP gate', () => {
  it('returns an error when the user has no active SASP scope (donee path)', async () => {
    const req = makeReq({ params: { applicationId: '7' }, user: { id: 'donee-1', scopes: doneeScopes } });
    const res = makeRes();

    await getApplicationHistory(req, res);

    expect(mockedService.getApplicationHistory).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledTimes(1);
  });

  it('delegates to EligibilityService.getApplicationHistory when the user has an active SASP scope', async () => {
    const req = makeReq({ params: { applicationId: '7' }, user: { id: 'sasp-1', scopes: saspScopes } });
    const res = makeRes();
    const payload = { application: { id: 7 }, logs: [{ id: 1 }] };
    mockedService.getApplicationHistory.mockResolvedValue(payload);

    await getApplicationHistory(req, res);

    expect(mockedService.getApplicationHistory).toHaveBeenCalledWith(7);
    expect(sendSuccess).toHaveBeenCalledWith(res, payload);
  });
});

describe('downloadApplicationLogPdf controller — SASP gate + streaming', () => {
  it('returns an error when the user has no active SASP scope', async () => {
    const req = makeReq({
      params: { applicationId: '7', logId: '12' },
      user: { id: 'donee-1', scopes: doneeScopes },
    });
    const res = makeRes();

    await downloadApplicationLogPdf(req, res);

    expect(mockedService.getApplicationLogPdf).not.toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledTimes(1);
  });

  it('streams the PDF buffer with content headers when the SASP gate passes', async () => {
    const req = makeReq({
      params: { applicationId: '7', logId: '12' },
      user: { id: 'sasp-1', scopes: saspScopes },
    });
    const res = makeRes();
    const buffer = Buffer.from('%PDF');
    mockedService.getApplicationLogPdf.mockResolvedValue({
      buffer,
      originalName: 'eligibility_7_2026',
      mimeType: 'application/pdf',
    });

    await downloadApplicationLogPdf(req, res);

    expect(mockedService.getApplicationLogPdf).toHaveBeenCalledWith(7, 12);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="eligibility_7_2026"');
    expect(res.send).toHaveBeenCalledWith(buffer);
  });
});
