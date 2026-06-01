import type { Request, Response } from 'express';

// reviewForm used to write sasp_audit_logs on a separate autocommit connection while the transaction
// held the reviewer's users row locked (HAO sync), self-deadlocking on the FK (50s lock wait). It also
// signed the PDF inside the transaction. These tests pin: audit log uses the transaction, sign runs
// after commit (no transaction), and status-change notifications fire only post-commit.

jest.mock('@/utils/response/responseHelper', () => ({
  sendSuccess: jest.fn(),
  sendError: jest.fn(),
}));

const TX = { id: 'tx-sentinel' };
jest.mock('@/utils/transactionalOperation', () => ({
  withTransaction: jest.fn(async (fn: (t: object) => unknown) => fn(TX)),
}));

jest.mock('@/eligibility/services/eligibility.service', () => ({
  EligibilityService: {
    reviewForm: jest.fn(),
    signEligibilityApplication: jest.fn(),
  },
}));

jest.mock('@/eligibility/models/ApplicationLogs.entity', () => ({
  __esModule: true,
  default: { create: jest.fn() },
}));

jest.mock('@/sasp/models/SaspAuditLogs.entity', () => ({
  __esModule: true,
  default: { create: jest.fn() },
  Activity: { FORM_APPROVED: 'FORM_APPROVED', FORM_REJECTED: 'FORM_REJECTED' },
}));

jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: { createNotification: jest.fn() },
  NotificationType: { ELIGIBILITY_STATUS_CHANGED: 'eligibilityStatusChanged' },
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

import { reviewForm } from '@/orchestration/controllers/organization';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import SaspAuditLog from '@/sasp/models/SaspAuditLogs.entity';
import NotificationFactory from '@/notifications/services/notification-factory.service';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import { ScopeType } from '@/enums/scope.enum';

const mockedService = EligibilityService as unknown as { reviewForm: jest.Mock; signEligibilityApplication: jest.Mock };
const mockedAudit = SaspAuditLog as unknown as { create: jest.Mock };
const mockedNotifications = NotificationFactory as unknown as { createNotification: jest.Mock };

const buildRes = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }) as unknown as Response;

const saspReq = (overrides: Partial<Request> = {}): Request => ({
  params: { applicationId: '442', formId: '1' },
  body: { isApproved: true, expiryDate: 123 },
  user: { id: 'reviewer-1', scopes: [{ type: ScopeType.SASP, isActive: true }] },
  ...overrides,
} as unknown as Request);

beforeEach(() => jest.clearAllMocks());

describe('reviewForm controller', () => {
  it('writes the SASP audit log inside the transaction (so the FK does not self-deadlock)', async () => {
    mockedService.reviewForm.mockResolvedValue({
      applicationForm: { id: 1, status: EligibilityApplicationStatuses.APPROVED },
      application: { status: EligibilityApplicationStatuses.APPROVED, state_id: 1 },
      wasEditRequestFlow: false,
      pendingNotifications: [],
    });

    await reviewForm(saspReq(), buildRes());

    expect(mockedAudit.create).toHaveBeenCalledTimes(1);
    expect(mockedAudit.create).toHaveBeenCalledWith(expect.any(Object), { transaction: TX });
  });

  it('re-signs the PDF after commit (outside the transaction) for an approved edit-request', async () => {
    mockedService.reviewForm.mockResolvedValue({
      applicationForm: { id: 1, status: EligibilityApplicationStatuses.APPROVED },
      application: { status: EligibilityApplicationStatuses.APPROVED, state_id: 1 },
      wasEditRequestFlow: true,
      pendingNotifications: [],
    });
    mockedService.signEligibilityApplication.mockResolvedValue({ application: { pdf_path: '/signed.pdf' } });

    await reviewForm(saspReq(), buildRes());

    // 3rd arg is the transaction: undefined means it runs on its own connection, post-commit.
    expect(mockedService.signEligibilityApplication).toHaveBeenCalledWith(442, expect.any(Object), undefined, expect.any(Object));
  });

  it('fires status-change notifications only after the transaction commits', async () => {
    const payload = { application: {}, oldStatus: 'In Review', newStatus: 'Returned' };
    mockedService.reviewForm.mockResolvedValue({
      applicationForm: { id: 1, status: EligibilityApplicationStatuses.REJECTED },
      application: { status: EligibilityApplicationStatuses.REJECTED, state_id: 1 },
      wasEditRequestFlow: false,
      pendingNotifications: [{ type: 'eligibilityStatusChanged', payload }],
    });

    await reviewForm(saspReq({ body: { isApproved: false, reason: 'no' } } as Partial<Request>), buildRes());

    expect(mockedNotifications.createNotification).toHaveBeenCalledTimes(1);
    expect(mockedNotifications.createNotification).toHaveBeenCalledWith('eligibilityStatusChanged', payload);
  });
});
