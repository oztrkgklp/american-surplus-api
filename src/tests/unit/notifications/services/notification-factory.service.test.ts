const mockAddNotificationJob = jest.fn();
const mockUserScopeFindAll = jest.fn();
const mockOrganizationFindByPk = jest.fn();
const mockApplicationFindByPk = jest.fn();
const mockPropertyFindOne = jest.fn();
const mockGetRequestById = jest.fn();
const mockSaspUserFindOne = jest.fn();
const mockEmailQueueAdd = jest.fn();
const mockRenderEmail = jest.fn();
const mockUserFindByPk = jest.fn();
const mockDoneeAccountFindByPk = jest.fn();

jest.mock('@/utils/logger', () => ({ getLogger: () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }) }));

jest.mock('sequelize', () => {
    const Op = { in: Symbol('in'), or: Symbol('or'), ne: Symbol('ne') };
    const DataTypes = new Proxy({}, { get: () => () => ({}) });
    class Model {}
    return { Sequelize: class {}, Transaction: class {}, Op, DataTypes, Model };
});

jest.mock('@/utils/database', () => ({
    __esModule: true,
    default: { sequelize: {}, Sequelize: class {} },
    database: { sequelize: {} },
}));

jest.mock('@/authz/models/UserScope', () => ({ __esModule: true, default: { findAll: (...args: unknown[]) => mockUserScopeFindAll(...args) } }));
jest.mock('@/organization/models/Organization', () => ({ __esModule: true, default: { findByPk: (...args: unknown[]) => mockOrganizationFindByPk(...args) } }));
jest.mock('@/organization/models/DoneeAccount', () => ({ __esModule: true, default: { findByPk: (...args: unknown[]) => mockDoneeAccountFindByPk(...args) } }));
jest.mock('@/organization/models/Sba8aCertification.entity', () => ({ __esModule: true, default: {} }));
jest.mock('@/eligibility/models/Application.entity', () => ({ __esModule: true, default: { findByPk: (...args: unknown[]) => mockApplicationFindByPk(...args) } }));
jest.mock('@/eligibility/models/ApplicationForm.entity', () => ({ __esModule: true, default: {} }));
jest.mock('@/properties/models/Property', () => ({ __esModule: true, default: { findOne: (...args: unknown[]) => mockPropertyFindOne(...args) } }));
jest.mock('@/properties/models/Request', () => ({ __esModule: true, default: {} }));
jest.mock('@/properties/services/request', () => ({ RequestService: { getRequestById: (...args: unknown[]) => mockGetRequestById(...args) } }));
jest.mock('@/sasp/models/SaspUsers.entity', () => ({ __esModule: true, default: { findOne: (...args: unknown[]) => mockSaspUserFindOne(...args) } }));
jest.mock('@/compliance-utilization/models/Compliance.entity', () => ({ __esModule: true, default: {} }));
jest.mock('@/data-migration/models/LegacyPropertyData.model', () => ({ __esModule: true, default: {} }));
jest.mock('@/states/models/State', () => ({ __esModule: true, default: {} }));
jest.mock('@/authn/models/User', () => ({ __esModule: true, default: { findByPk: (...args: unknown[]) => mockUserFindByPk(...args) } }));

jest.mock('@/notifications/job/notification.job', () => ({ addNotificationJob: (...args: unknown[]) => mockAddNotificationJob(...args) }));
jest.mock('@/utils/mail/render', () => ({ renderEmail: (...args: unknown[]) => mockRenderEmail(...args) }));
jest.mock('@/utils/mail/emailQueue', () => ({ emailQueue: { add: (...args: unknown[]) => mockEmailQueueAdd(...args) } }));
jest.mock('@/enums/mailEnum', () => ({ TemplateEnum: {} }));
jest.mock('@/enums/eligibilityStatus.enum', () => ({ EligibilityApplicationStatuses: {} }));
jest.mock('@/enums/userPermissions.enum', () => ({ UserPermissionsEnum: { SASP_APPROVE_ORGANIZATIONS: 'sasp:approve_orgs', SASP_MANAGE_ALL_REQUESTS: 'sasp:manage_requests' } }));

import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';

const SASP_USER = { user_id: 'sasp-user-1', sasp_user_id: 11 };
const DONEE_USER = { user_id: 'donee-user-1', sasp_user_id: null };

const lastJobCall = () => mockAddNotificationJob.mock.calls[mockAddNotificationJob.mock.calls.length - 1];
const allJobPayloads = () => mockAddNotificationJob.mock.calls.map(call => call[1].payload);

beforeEach(() => {
    mockAddNotificationJob.mockReset();
    mockUserScopeFindAll.mockReset();
    mockOrganizationFindByPk.mockReset();
    mockApplicationFindByPk.mockReset();
    mockPropertyFindOne.mockReset();
    mockGetRequestById.mockReset();
    mockSaspUserFindOne.mockReset();
    mockEmailQueueAdd.mockReset();
    mockRenderEmail.mockReset();
    mockUserFindByPk.mockReset();
    mockDoneeAccountFindByPk.mockReset();

    mockRenderEmail.mockResolvedValue('<html></html>');
    mockEmailQueueAdd.mockResolvedValue(undefined);
    mockUserFindByPk.mockResolvedValue({ email: 'ozturkgokalp000@gmail.com', name: 'U' });
});

describe('NotificationFactory — payload carries a clickable url', () => {
    it('TCN_UPDATED → donee request URL (donee-only handler)', async () => {
        mockGetRequestById.mockResolvedValue({ id: 42, tcn: 'TCN-42', doneeAccount: { id: 1, organization: { id: 'org-A' } } });
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER]);

        await NotificationFactory.createNotification(NotificationType.TCN_UPDATED, { requestId: 42 });

        expect(mockAddNotificationJob).toHaveBeenCalledTimes(1);
        expect(lastJobCall()[1].payload.url).toBe('/org/org-A/request/42');
        expect(lastJobCall()[1].payload.message).toContain('#42');
    });

    it('COMMENT_ADDED → per-recipient URL: SASP gets SASP shape, donee gets donee shape', async () => {
        mockGetRequestById.mockResolvedValue({ id: 7, doneeAccount: { id: 1, stateId: 5, organization: { id: 'org-A' } } });
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER, SASP_USER]);

        await NotificationFactory.createNotification(NotificationType.COMMENT_ADDED, { requestId: 7, userName: 'Alice' });

        const urls = allJobPayloads().map(p => p.url);
        expect(urls).toEqual(expect.arrayContaining([
            '/org/org-A/request/7',
            '/org/sasp/5/request/7',
        ]));
    });

    it('PROPERTIES_ALLOCATED → donee request URL with section anchor', async () => {
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER]);
        mockDoneeAccountFindByPk.mockResolvedValue({ organizationId: 'org-A' });

        await NotificationFactory.createNotification(NotificationType.PROPERTIES_ALLOCATED, {
            request: { id: 99, donee_account: 1 } as any,
            allocatedPropertyList: [{ property_name: 'X', ICN: 'AB1', allocated_quantity: 1 }],
        });

        expect(lastJobCall()[1].payload.url).toBe('/org/org-A/request/99#properties');
    });
});

describe('NotificationFactory — invoice URLs auto-open the viewer', () => {
    it('INVOICE_GENERATED → /org/{org}/request/{id}?openInvoice=auto#attachments', async () => {
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER]);
        mockDoneeAccountFindByPk.mockResolvedValue({ organizationId: 'org-A' });

        await NotificationFactory.createNotification(NotificationType.INVOICE_GENERATED, {
            request: { id: 55, donee_account: 1, tcn: 'T' } as any,
            updatedBy: 'sasp-x',
        });

        expect(allJobPayloads().some(p => p.url === '/org/org-A/request/55?openInvoice=auto#attachments')).toBe(true);
    });

    it('INVOICE_CANCELED → same /request/{id} + ?openInvoice=auto#attachments', async () => {
        mockGetRequestById.mockResolvedValue({ id: 12, doneeAccount: { id: 1, organizationId: 'org-A' }, tcn: 'T' });
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER]);

        await NotificationFactory.createNotification(NotificationType.INVOICE_CANCELED, { requestId: 12 });

        expect(lastJobCall()[1].payload.url).toBe('/org/org-A/request/12?openInvoice=auto#attachments');
    });
});

describe('NotificationFactory — eligibility application URLs', () => {
    it('APPLICATION_SUBMITTED → SASP url for SASP recipients, donee url for donee recipients', async () => {
        mockApplicationFindByPk.mockResolvedValue({
            id: 8,
            organization: { id: 'org-A', name: 'Org' },
            state: { stateName: 'NY' },
        });
        // First findAll: SASP recipients. Second findAll inside handler: donee recipients.
        mockUserScopeFindAll
            .mockResolvedValueOnce([SASP_USER])
            .mockResolvedValueOnce([DONEE_USER]);

        await NotificationFactory.createNotification(NotificationType.APPLICATION_SUBMITTED, {
            application: { id: 8, state_id: 1, donee_account_id: 2 } as any,
        });

        const urls = allJobPayloads().map(p => p.url);
        expect(urls).toEqual(expect.arrayContaining([
            '/org/sasp/1/eligibility-applications/8',
            '/org/org-A/eligibility-applications/8',
        ]));
    });

    it('APPLICATION_SUBMITTED → falls back to application.created_by when donee recipients are empty', async () => {
        mockApplicationFindByPk
            .mockResolvedValueOnce({
                id: 8,
                organization: { id: 'org-A', name: 'Org' },
                state: { stateName: 'NY' },
            })
            .mockResolvedValueOnce({ created_by: 'creator-user-1' });
        mockUserScopeFindAll
            .mockResolvedValueOnce([SASP_USER])
            .mockResolvedValueOnce([]);

        await NotificationFactory.createNotification(NotificationType.APPLICATION_SUBMITTED, {
            application: { id: 8, state_id: 1, donee_account_id: 2 } as any,
        });

        expect(mockAddNotificationJob).toHaveBeenCalledWith(
            NotificationType.APPLICATION_SUBMITTED,
            expect.objectContaining({ userId: 'creator-user-1' }),
        );
    });

    it('ELIGIBILITY_STATUS_CHANGED → falls back to application.created_by when donee recipients are empty', async () => {
        mockApplicationFindByPk.mockResolvedValue({
            id: 9,
            created_by: 'creator-user-2',
            organization: { id: 'org-A', name: 'Org' },
            state: { stateName: 'NY' },
            applicationForms: [],
        });
        mockUserScopeFindAll
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([SASP_USER]);

        await NotificationFactory.createNotification(NotificationType.ELIGIBILITY_STATUS_CHANGED, {
            application: { id: 9, state_id: 1, donee_account_id: 2 } as any,
            oldStatus: 'Submitted',
            newStatus: 'Approved',
        });

        expect(mockAddNotificationJob).toHaveBeenCalledWith(
            NotificationType.ELIGIBILITY_STATUS_CHANGED,
            expect.objectContaining({ userId: 'creator-user-2' }),
        );
    });

    it('ELIGIBILITY_ATTACHMENT_UPLOADED → SASP application URL with ?form= query', async () => {
        mockUserScopeFindAll.mockResolvedValue([SASP_USER]);

        await NotificationFactory.createNotification(NotificationType.ELIGIBILITY_ATTACHMENT_UPLOADED, {
            application: { id: 100, state_id: 1, organization: { name: 'Org' }, state: { stateName: 'NY' } } as any,
            formId: 77,
            fileName: 'doc.pdf',
        });

        expect(lastJobCall()[1].payload.url).toBe('/org/sasp/1/eligibility-applications/100?form=77');
    });
});

describe('NotificationFactory — PROPERTY_REQUESTED_VIA_ICN routes SASP to the parent request', () => {
    // Regression: SASP has no Property Details page, so the notification must point at the
    // parent Request with the property highlighted.
    it('property has request_id → SASP request URL + highlightProperty + #properties', async () => {
        mockOrganizationFindByPk.mockResolvedValue({ name: 'Org' });
        mockUserScopeFindAll.mockResolvedValue([SASP_USER]);

        await NotificationFactory.createNotification(NotificationType.PROPERTY_REQUESTED_VIA_ICN, {
            property: { property_id: 654, request_id: 42, property_control_number: 'AB654' } as any,
            doneeAccount: { organizationId: 1, stateId: 5 } as any,
        });

        const payload = lastJobCall()[1].payload;
        expect(payload.message).toContain('AB654');
        expect(payload.url).toBe('/org/sasp/5/request/42?highlightProperty=654#properties');
    });

    it('legacy property (request_id=null) → no url (informational only)', async () => {
        mockOrganizationFindByPk.mockResolvedValue({ name: 'Org' });
        mockUserScopeFindAll.mockResolvedValue([SASP_USER]);

        await NotificationFactory.createNotification(NotificationType.PROPERTY_REQUESTED_VIA_ICN, {
            property: { property_id: 654, request_id: null, property_control_number: 'AB654' } as any,
            doneeAccount: { organizationId: 1, stateId: 5 } as any,
        });

        expect(lastJobCall()[1].payload.url).toBeNull();
    });
});

describe('NotificationFactory — want-list match', () => {
    it('WANT_LIST_MATCH_FOUND → donee want-list URL', async () => {
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER]);
        mockDoneeAccountFindByPk.mockResolvedValue({ organizationId: 'org-A' });

        await NotificationFactory.createNotification(NotificationType.WANT_LIST_MATCH_FOUND, {
            matchIds: [1001, 1002, 1003],
            doneeAccountId: 7,
            keyword: 'aircraft',
        });

        expect(mockAddNotificationJob).toHaveBeenCalledTimes(1);
        const payload = lastJobCall()[1].payload;
        expect(payload.url).toBe('/org/org-A/want-list?tab=matches');
        expect(payload.message).toContain('aircraft');
        expect(payload.message).toContain('3');
    });

    it('WANT_LIST_MATCH_FOUND with empty matchIds → no-op', async () => {
        await NotificationFactory.createNotification(NotificationType.WANT_LIST_MATCH_FOUND, {
            matchIds: [],
            doneeAccountId: 7,
            keyword: 'aircraft',
        });

        expect(mockAddNotificationJob).not.toHaveBeenCalled();
    });

    it('WANT_LIST_MATCH_FOUND uses singular form for one match', async () => {
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER]);
        mockDoneeAccountFindByPk.mockResolvedValue({ organizationId: 'org-A' });

        await NotificationFactory.createNotification(NotificationType.WANT_LIST_MATCH_FOUND, {
            matchIds: [42],
            doneeAccountId: 7,
            keyword: 'aircraft',
        });

        expect(lastJobCall()[1].payload.message).toContain('New want-list match');
    });
});

describe('NotificationFactory — purely informational notifications (no url)', () => {
    it('FEE_CHANGE_NOTIFICATION carries message only', async () => {
        mockUserScopeFindAll.mockResolvedValue([DONEE_USER]);

        await NotificationFactory.createNotification(NotificationType.FEE_CHANGE_NOTIFICATION, {
            stateId: 1,
            effectiveDate: '2026-06-01',
            fees: [{ disposalConditionCode: 'A', disposalConditionName: 'Cond A', fee: 5 }],
        });

        const payload = lastJobCall()[1].payload;
        expect(payload.url).toBeUndefined();
        expect(payload.message).toContain('Cond A');
    });

});

describe('NotificationFactory — property-scoped SASP notifications point at the parent request', () => {
    it('EXPIRED_SCREENING_DATE → SASP request URL with property highlight', async () => {
        mockUserScopeFindAll.mockResolvedValue([SASP_USER]);

        await NotificationFactory.createNotification(NotificationType.EXPIRED_SCREENING_DATE, {
            property: { property_id: 321, request_id: 700, property_control_number: 'AB321', request: { doneeAccount: { stateId: 1 } } } as any,
        });

        expect(lastJobCall()[1].payload.url).toBe('/org/sasp/1/request/700?highlightProperty=321#properties');
    });

    it('EXPIRED_SCREENING_DATE with no request_id (legacy data) → no url', async () => {
        mockUserScopeFindAll.mockResolvedValue([SASP_USER]);

        await NotificationFactory.createNotification(NotificationType.EXPIRED_SCREENING_DATE, {
            property: { property_id: 321, request_id: null, property_control_number: 'AB321', request: { doneeAccount: { stateId: 1 } } } as any,
        });

        expect(lastJobCall()[1].payload.url).toBeNull();
    });

    it('EXPIRED_SCREENING_DATE_TODAY and ..._THREE_DAYS variants use the same URL shape', async () => {
        mockUserScopeFindAll.mockResolvedValue([SASP_USER]);
        const property = { property_id: 321, request_id: 700, property_control_number: 'AB321', request: { doneeAccount: { stateId: 1 } } } as any;

        await NotificationFactory.createNotification(NotificationType.EXPIRED_SCREENING_DATE_TODAY, { property });
        await NotificationFactory.createNotification(NotificationType.EXPIRED_SCREENING_DATE_THREE_DAYS_FROM_NOW, { property });

        const urls = allJobPayloads().map(p => p.url);
        expect(urls).toEqual(['/org/sasp/1/request/700?highlightProperty=321#properties', '/org/sasp/1/request/700?highlightProperty=321#properties']);
    });
});
