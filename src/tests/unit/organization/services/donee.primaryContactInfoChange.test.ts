import { DoneeAccountService } from '@/organization/services/donee';

const mockDoneeFindByPk = jest.fn();
const mockScopeFindOne = jest.fn();
const mockGetOrgUser = jest.fn();
const mockUserFindByPk = jest.fn();

jest.mock('@/organization/models/DoneeAccount', () => ({
    __esModule: true,
    default: { findByPk: (...args: unknown[]) => mockDoneeFindByPk(...args) },
}));

jest.mock('@/authz/models/UserScope', () => ({
    __esModule: true,
    default: { findOne: (...args: unknown[]) => mockScopeFindOne(...args) },
}));

jest.mock('@/organization/services/organizationUser', () => ({
    OrganizationUserService: {
        getRecordByOrganizationAndUser: (...args: unknown[]) => mockGetOrgUser(...args),
        syncForm1PrimaryContactFromUserProfile: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('@/authn/models/User', () => ({
    __esModule: true,
    default: { findByPk: (...args: unknown[]) => mockUserFindByPk(...args) },
}));

describe('DoneeAccountService.primaryContactInfoChange', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDoneeFindByPk.mockResolvedValue({ organizationId: 'org-1' });
        mockScopeFindOne.mockResolvedValue({ id: 99 });
    });

    it('updates user name and organization user fields without changing user email or organizations row', async () => {
        const userUpdate = jest.fn().mockResolvedValue(undefined);
        const ouUpdate = jest.fn().mockResolvedValue(undefined);
        mockUserFindByPk.mockResolvedValue({ update: userUpdate });
        mockGetOrgUser.mockResolvedValue({ update: ouUpdate });

        await DoneeAccountService.primaryContactInfoChange(42, 'org-1', 'user-uuid', {
            primary_contact_full_name: 'Jane Q Public',
            primary_contact_title: 'Director',
            primary_contact_phone: '+15551234567',
        });

        expect(mockScopeFindOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    donee_account_id: 42,
                    user_id: 'user-uuid',
                    is_primary_contact: true,
                }),
            }),
        );
        expect(userUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Jane Q Public' }),
            expect.anything(),
        );
        expect(ouUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Director',
                phoneNumber: '+15551234567',
            }),
            expect.anything(),
        );
    });
});
