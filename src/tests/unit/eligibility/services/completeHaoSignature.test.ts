// completeHaoSignature reaches SUBMITTED via the separate-HAO path, and the controller logs it as
// an APPLICATION_SUBMITTED History event. The status must flip before signing and the sign must run
// in the caller's transaction — otherwise the archived PDF renders the pre-submit status and the
// log snapshots a stale pdf_path.

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

jest.mock('@/organization/services/organizationUser', () => ({
  OrganizationUserService: { userIsHeadAuthorizedOfficialForOrganization: jest.fn() },
}));

jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: { createNotification: jest.fn() },
  NotificationType: { ELIGIBILITY_STATUS_CHANGED: 'ELIGIBILITY_STATUS_CHANGED' },
}));

import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Application from '@/eligibility/models/Application.entity';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import type User from '@/authn/models/User';

const mockedApplication = Application as unknown as { findByPk: jest.Mock };
const mockedOrgUser = OrganizationUserService as unknown as { userIsHeadAuthorizedOfficialForOrganization: jest.Mock };

const signer = { id: 'hao-1', name: 'Head Official', is_email_verified: true } as unknown as User;
const ORG = 'org-1';

const makeWaitingApp = (calls?: string[]) => {
  const app: Record<string, unknown> = {
    id: 5,
    organization_id: ORG,
    status: EligibilityApplicationStatuses.WAITING_FOR_HAO_SIGNATURE,
    pdf_path: '/storage/app_5_waiting.pdf',
  };
  app.update = jest.fn(async (patch: Record<string, unknown>) => {
    Object.assign(app, patch);
    calls?.push('update');
    return app;
  });
  return app;
};

const signedApp = { id: 5, status: EligibilityApplicationStatuses.SUBMITTED, pdf_path: '/storage/app_5_signed.pdf' };

beforeEach(() => {
  jest.clearAllMocks();
  mockedOrgUser.userIsHeadAuthorizedOfficialForOrganization.mockResolvedValue(true);
});

describe('EligibilityService.completeHaoSignature', () => {
  it('flips the status to SUBMITTED before signing', async () => {
    const calls: string[] = [];
    mockedApplication.findByPk.mockResolvedValue(makeWaitingApp(calls));
    const signSpy = jest.spyOn(EligibilityService, 'signEligibilityApplication')
      .mockImplementation(async () => { calls.push('sign'); return { application: signedApp as never }; });

    await EligibilityService.completeHaoSignature(5, ORG, signer);

    expect(calls).toEqual(['update', 'sign']);
    signSpy.mockRestore();
  });

  it('signs inside the caller transaction and returns the signed application', async () => {
    mockedApplication.findByPk.mockResolvedValue(makeWaitingApp());
    const signSpy = jest.spyOn(EligibilityService, 'signEligibilityApplication')
      .mockResolvedValue({ application: signedApp as never });
    const tx = { id: 'tx-1' };

    const result = await EligibilityService.completeHaoSignature(5, ORG, signer, tx as never);

    expect(signSpy).toHaveBeenCalledWith(5, signer, tx);
    expect(result).toBe(signedApp);
    expect(result.pdf_path).toBe('/storage/app_5_signed.pdf');
    signSpy.mockRestore();
  });

  it('throws when the application is not waiting for HAO signature', async () => {
    const app = makeWaitingApp();
    app.status = EligibilityApplicationStatuses.DRAFT;
    mockedApplication.findByPk.mockResolvedValue(app);
    const signSpy = jest.spyOn(EligibilityService, 'signEligibilityApplication');

    await expect(EligibilityService.completeHaoSignature(5, ORG, signer)).rejects.toThrow();
    expect(signSpy).not.toHaveBeenCalled();
    expect(app.update).not.toHaveBeenCalled();
    signSpy.mockRestore();
  });

  it('throws when the signer is not the Head Authorized Official', async () => {
    mockedApplication.findByPk.mockResolvedValue(makeWaitingApp());
    mockedOrgUser.userIsHeadAuthorizedOfficialForOrganization.mockResolvedValue(false);
    const signSpy = jest.spyOn(EligibilityService, 'signEligibilityApplication');

    await expect(EligibilityService.completeHaoSignature(5, ORG, signer)).rejects.toThrow();
    expect(signSpy).not.toHaveBeenCalled();
    signSpy.mockRestore();
  });
});
