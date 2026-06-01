// reviewForm used to fire status-change notifications inline and hold the DB transaction open across
// the Puppeteer PDF re-sign, which caused Lock wait timeouts and emails that went out even when the
// transaction rolled back. These scenarios pin the fixed behaviour: notifications are collected and
// returned (not sent), and a double-submit of an already-approved form is rejected.

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

jest.mock('@/eligibility/models/ApplicationForm.entity', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), count: jest.fn() },
}));

jest.mock('@/notifications/services/notification-factory.service', () => ({
  __esModule: true,
  default: { createNotification: jest.fn() },
  NotificationType: { ELIGIBILITY_STATUS_CHANGED: 'eligibilityStatusChanged' },
}));

import { Transaction } from 'sequelize';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import { EligibilityApplicationFormStatuses, EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';

const mockedApplication = Application as unknown as { findByPk: jest.Mock };
const mockedApplicationForm = ApplicationForm as unknown as { findOne: jest.Mock; count: jest.Mock };
const mockedNotifications = NotificationFactory as unknown as { createNotification: jest.Mock };

const tx = { LOCK: Transaction.LOCK } as unknown as Transaction;

beforeEach(() => jest.clearAllMocks());

describe('EligibilityService.reviewForm', () => {
  it('rejects a double-submit that re-approves an already-approved form', async () => {
    mockedApplication.findByPk.mockResolvedValue({ id: 7, status: EligibilityApplicationStatuses.IN_REVIEW, update: jest.fn() });
    mockedApplicationForm.findOne.mockResolvedValue({ id: 1, status: EligibilityApplicationFormStatuses.APPROVED, update: jest.fn() });

    await expect(
      EligibilityService.reviewForm(7, 1, true, null, 123, tx),
    ).rejects.toThrow('Form has already been reviewed');

    expect(mockedNotifications.createNotification).not.toHaveBeenCalled();
  });

  // Sequelize's instance.update() mutates the instance in place; mirror that so status transitions
  // are visible to the service's oldStatus !== status notification gate.
  const mutatingUpdate = function (this: Record<string, unknown>, values: Record<string, unknown>) {
    Object.assign(this, values);
    return Promise.resolve(this);
  };

  it('locks the application row FOR UPDATE so concurrent reviews serialize', async () => {
    mockedApplication.findByPk.mockResolvedValue({ id: 7, status: EligibilityApplicationStatuses.IN_REVIEW, update: mutatingUpdate });
    mockedApplicationForm.findOne.mockResolvedValue({
      id: 1,
      status: EligibilityApplicationFormStatuses.NEW,
      is_required: false,
      update: mutatingUpdate,
    });

    await EligibilityService.reviewForm(7, 1, false, 'needs work', 123, tx);

    expect(mockedApplication.findByPk).toHaveBeenCalledWith(7, { transaction: tx, lock: Transaction.LOCK.UPDATE });
  });

  it('returns status-change notifications instead of firing them inline (so a rollback cannot leak emails)', async () => {
    mockedApplication.findByPk.mockResolvedValue({ id: 7, status: EligibilityApplicationStatuses.IN_REVIEW, update: mutatingUpdate });
    mockedApplicationForm.findOne.mockResolvedValue({
      id: 1,
      status: EligibilityApplicationFormStatuses.NEW,
      is_required: false,
      update: mutatingUpdate,
    });

    const result = await EligibilityService.reviewForm(7, 1, false, 'needs work', 123, tx);

    expect(mockedNotifications.createNotification).not.toHaveBeenCalled();
    expect(result.pendingNotifications).toHaveLength(1);
    expect(result.pendingNotifications[0].type).toBe(NotificationType.ELIGIBILITY_STATUS_CHANGED);
    expect(result.pendingNotifications[0].payload.newStatus).toBe('Returned');
  });
});
