import { Transaction } from 'sequelize';

// imported after mocks are established
let DocumentFactory: any;
let DocumentActionType: any;


// to create a deep  mock for any imported module
const jestFn = () => jest.fn();

// mock fs & path so we do not read the real filesystem
jest.mock('fs', () => ({
    readFileSync: jest.fn().mockReturnValue('fake_base64_data'),
}));
jest.mock('path', () => {
    const actualPath = jest.requireActual('path');
    return {
        ...actualPath,
        join: jest.fn((...parts: string[]) => parts.join('/')),
    };
});

// Mock puppeteer/ejs because renderDocument & generatePdf depend on them via underlying helpers
jest.mock('puppeteer', () => ({}));
jest.mock('ejs', () => ({ render: jest.fn(() => '<html></html>') }));

// Mock log4js and our logger util to avoid fs-native errors during tests
jest.mock('log4js', () => ({
    configure: jest.fn(),
    getLogger: () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }),
}));

jest.mock('@/utils/logger', () => ({
    getLogger: () => ({ log: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() }),
}));

// Prevent Sequelize from creating real timers / connections that keep Jest open
jest.mock('sequelize', () => {
    class SequelizeMock {}
    class Transaction {}
    const Op = { ne: Symbol('ne') };
    // Provide a fake DataTypes object that returns noop on function call
    const DataTypes = new Proxy({}, { get: () => () => ({}) });
    class Model {}
    return { Sequelize: SequelizeMock, Transaction, Op, DataTypes, Model };
});

// Mock database utility to avoid constructing real Sequelize instance
jest.mock('@/utils/database', () => ({
    __esModule: true,
    default: { sequelize: {}, Sequelize: class {} },
    sequelize: {},
}));

jest.mock('@/organization/services/organizationAddress.service', () => ({
    OrganizationAddressService: {
        hydrateCompatMailingOnOrganization: jest.fn().mockImplementation(async (org: { id: string } & Record<string, unknown>) => {
            Object.assign(org, {
                mailing_address_line1: '123 Main',
                mailing_city: 'Melbourne',
                mailing_state: 'FL',
                mailing_zip: '32901',
            });
        }),
    },
}));

jest.mock('@/organization/services/organizationUser', () => ({
    OrganizationUserService: {
        getOrganizationById: jest.fn().mockResolvedValue({
            primary_contact_phone: '555-1234',
            primary_contact_email: '',
            head_authorized_official_phone: '',
            head_authorized_official_email: '',
        }),
    },
}));


// Sequelize-model mocks
const createSequelizeMock = <T extends Record<string, any>>(defaults: T): T => ({ ...defaults } as T);

// InvoiceConfig mock – used by invoiceNoGenerator
const invoiceConfigUpdate = jest.fn();
const InvoiceConfigMock = createSequelizeMock({
    findOne: jest.fn(),
});

// Invoice model mock – used throughout workflows
const InvoiceCreateMock = jest.fn();
const InvoiceFindOneMock = jest.fn();
const InvoiceUpdateMock = jest.fn();
const InvoiceMock = createSequelizeMock({
    create: InvoiceCreateMock,
    findOne: InvoiceFindOneMock,
});

// InvoiceActivityLog mock
const InvoiceActivityLogCreateMock = jest.fn();
const InvoiceActivityLogMock = createSequelizeMock({
    create: InvoiceActivityLogCreateMock,
});

// Property model + PropertyDataService mocks for asset calculations
const PropertyFindAllMock = jest.fn();
const PropertyMock = createSequelizeMock({
    findAll: PropertyFindAllMock,
});

const PropertyDataServiceMock = {
    getPropertyDetails: jest.fn(),
};

// RequestAttachmentService mock
const RequestAttachmentServiceMock = {
    createAttachment: jest.fn(),
    updateAttachmentPath: jest.fn(),
    getAttachment: jest.fn(),
};

// UserScope / OrganizationUser / Role mocks for signInvoice role validation
const UserScopeFindOneMock = jest.fn();
const UserScopeMock = createSequelizeMock({
    findOne: UserScopeFindOneMock,
});
const OrganizationUserMock = {};
const RoleMock = {};

// use manual mocks when these modules are imported inside DocumentFactory
jest.mock('../models/InvoiceConfig.entity', () => ({ __esModule: true, default: InvoiceConfigMock }));
jest.mock('../models/Invoice.entity', () => ({ __esModule: true, default: InvoiceMock, InvoiceStatus: { SIGNED: 'SIGNED' } }));
jest.mock('../models/InvoiceActivityLogs.entity', () => ({ __esModule: true, default: InvoiceActivityLogMock, InvoiceActivity: { INVOICE_GENERATED: 'GENERATED', INVOICE_SIGNED: 'SIGNED' } }));

jest.mock('@/properties/models/Property', () => ({ __esModule: true, default: PropertyMock }));

jest.mock('@/ppms/services/propertyData', () => ({ PropertyDataService: PropertyDataServiceMock }));

jest.mock('@/properties/services/requestAttachment', () => ({ RequestAttachmentService: RequestAttachmentServiceMock }));

jest.mock('@/authz/models/UserScope', () => ({ __esModule: true, default: UserScopeMock }));
jest.mock('@/organization/models/OrganizationUser', () => ({ __esModule: true, default: OrganizationUserMock }));
jest.mock('@/authz/models/Role', () => ({ __esModule: true, default: RoleMock }));

// Stub models/services that attempt Sequelize during definition
jest.mock('@/organization/models/DoneeAccount', () => ({ __esModule: true, default: {} }));
jest.mock('@/properties/services/property', () => ({ PropertyService: {} }));

// Mocks with callable functions for asset calculation helpers
const DisposalConditionFindByPkMock = jest.fn();
const DisposalConditionFindOneMock = jest.fn();
jest.mock('@/metadata/models/DisposalCondition', () => ({ __esModule: true, default: { findByPk: DisposalConditionFindByPkMock, findOne: DisposalConditionFindOneMock } }));

const StateDisposalFeesFindMock = jest.fn();
jest.mock('@/states/models/StateDisposalFees', () => ({ __esModule: true, default: { findOne: StateDisposalFeesFindMock } }));

const StateAmericanSurplusFeesFindMock = jest.fn();
jest.mock('@/states/models/StateAmericanSurplusFees.entity', () => ({ __esModule: true, default: { findOne: StateAmericanSurplusFeesFindMock } }));

// Mock StoragePaths + saveUploadedFile util so they do not touch disk
jest.mock('@/utils/storage/paths', () => ({ StoragePaths: { private: { orgs: { org: () => ({ donees: { donee: () => ({ requests: { request: () => ({ path: '/fake/path' }) } }) } }) } } } }));
jest.mock('@/utils/storage/fileSystem', () => ({ saveUploadedFile: jest.fn().mockResolvedValue('/fake/path/invoice.pdf') }));

// Import the module under test AFTER mocks so they apply correctly
({ default: DocumentFactory, DocumentActionType } = require('./document-factory.service'));
const { InvoiceService } = require('../invoice.service');

// Mock internal helper functions renderDocument & generatePdf to isolate tests
jest.spyOn(DocumentFactory as any, 'renderDocument').mockResolvedValue('<html></html>');
jest.spyOn(DocumentFactory as any, 'generatePdf').mockResolvedValue(Buffer.from('pdf'));

// SAMPLEs
const sampleRequest = {
    id: 1,
    tcn: 'FL-ABC-123',
    doneeAccount: {
        id: 10,
        organizationId: 'ORG-1',
        stateId: 1,
        name: 'DONEE-001',
        organization: {
            id: 'ORG-1',
            name: 'Sample Org',
            mailing_address_line1: '123 Main',
            mailing_city: 'Melbourne',
            mailing_state: 'FL',
            mailing_zip: '32901',
        },
    },
};

const sampleUser = { id: 50, name: 'Jane Doe' } as any;

//before each test clear all mocks
beforeEach(() => {
    jest.clearAllMocks();
});


// TESTS
describe('DocumentFactory Helpers', () => {
    // VALIDATES: invoiceNoGenerator increments DB counter and returns padded invoice no
    test('invoiceNoGenerator increments and pads number', async () => {
        // Arrange
        InvoiceConfigMock.findOne.mockResolvedValue({
            current_number: 9,
            total_digit: 4,
            update: invoiceConfigUpdate,
        });

        // Act
        const result = await (DocumentFactory as any).invoiceNoGenerator(1, 'FL', undefined as any);

        // Assert
        expect(result).toBe('FL-0010'); // padded to 4 digits → 0010
        expect(invoiceConfigUpdate).toHaveBeenCalledWith({ current_number: 10 }, { transaction: undefined });
    });

    // VALIDATES: invoiceDisplayNameGenerator constructs correct display name string
    test('invoiceDisplayNameGenerator formats string correctly', () => {
        // Arrange
        const date = '2025-07-24';
        const tcn = 'FL-XYZ-555';
        const invoiceNo = 'FL-0001';

        // Act
        const result = (DocumentFactory as any).invoiceDisplayNameGenerator(date, tcn, invoiceNo);

        // Assert
        expect(result).toBe('IN-2025-07-24-555-FL-0001');
    });

    // VALIDATES: Hard-coded bank/ACH information helper returns expected values
    test('getBankInformationForInvoice returns constant bank payload', () => {
        // Act
        const result = (DocumentFactory as any).getBankInformationForInvoice();

        // Assert
        expect(result.remitCheckPayments.name).toMatch(/American Surplus LLC/);
        expect(result.achPayments.routingNo).toBe('021052053');
    });

    // VALIDATES: getDoneeInformationForInvoice maps required fields from request.doneeAccount
    test('getDoneeInformationForInvoice maps request fields', async () => {
        // Act
        const result = await InvoiceService.getDoneeInformationForInvoice(sampleRequest as any, undefined);

        // Assert
        expect(result).toEqual({
            accountNo: 'DONEE-001',
            representative: 'Sample Org',
            telephone: '555-1234',
            address: '123 Main',
            city: 'Melbourne',
            state: 'FL',
            zipCode: '32901',
        });
    });
});

describe('DocumentFactory.generateInvoice workflow', () => {
    // VALIDATES: generateInvoice creates invoice, attachment & activity log
    test('creates invoice, attachment & activity log', async () => {
        // Arrange
        InvoiceConfigMock.findOne.mockResolvedValue({ current_number: 1, total_digit: 4, update: invoiceConfigUpdate });

        // createAttachment returns dummy attachment
        const attachment = { id: 99, createdAt: '2025-07-24' };
        RequestAttachmentServiceMock.createAttachment.mockResolvedValue(attachment);
        RequestAttachmentServiceMock.updateAttachmentPath.mockResolvedValue(undefined);

        // Invoice.create returns mocked invoice instance
        const createdInvoice = { id: 200 } as any;
        InvoiceCreateMock.mockResolvedValue(createdInvoice);

        PropertyFindAllMock.mockResolvedValue([]); // no allocated properties for brevity

        // Act
        await (DocumentFactory as any).generateInvoice({ request: sampleRequest, createdBy: sampleUser, invoiceSerie: 'FL' });

        // Assert
        expect(InvoiceCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            state_id: 1,
            attachment_id: attachment.id,
            // Updated field names:
            total_amount: expect.anything(),
            american_surplus_amount: expect.anything(),
            sasp_net_amount: expect.anything(),
        }), { transaction: undefined });

        expect(RequestAttachmentServiceMock.updateAttachmentPath).toHaveBeenCalledWith(
            attachment.id,
            '/fake/path/invoice.pdf',
            sampleUser,
            undefined
        );

        expect(InvoiceActivityLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            invoice_id: createdInvoice.id,
            activity: 'GENERATED',
        }), { transaction: undefined });
    });
});

describe('DocumentFactory.signInvoice workflow', () => {
    // VALIDATES: signInvoice signs invoice and updates status
    test('signs invoice and updates status', async () => {
        // Arrange
        const invoiceInstance = {
            id: 300,
            invoice_no: 'FL-0001',
            invoice_data: {},
            update: InvoiceUpdateMock,
        };
        InvoiceFindOneMock.mockResolvedValue(invoiceInstance);

        // Role validation -> give user Organization_Admin role
        UserScopeFindOneMock.mockResolvedValue({ role: { role_name: 'Organization Admin' } });

        RequestAttachmentServiceMock.getAttachment.mockResolvedValue({ id: 55, name: 'INVOICE' });
        RequestAttachmentServiceMock.updateAttachmentPath.mockResolvedValue(undefined);

        // Act
        await (DocumentFactory as any).signInvoice({
            request: sampleRequest,
            requestAttachmentId: 55,
            signedBy: sampleUser,
            stateId: 1,
        });

        // Assert
        expect(InvoiceUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'SIGNED' }), { transaction: undefined });
        expect(InvoiceActivityLogCreateMock).toHaveBeenCalledWith(expect.objectContaining({
            invoice_id: 300,
            activity: 'SIGNED',
        }), { transaction: undefined });
    });
});

describe('DocumentFactory.getAssetInformationForInvoice', () => {
    // VALIDATES: getAssetInformationForInvoice calculates subtotal, line total and overall total with disposal fee
    test('calculates subtotal, line total and overall total with disposal fee', async () => {
        // Arrange
        const mockProperty = {
            property_control_number: 'ICN-1',
            property_original_value: 100,
            property_allocated_quantity: 2,
            property_description: 'Asset description',
            property_disposal_condition_id: 5,
        } as any;

        PropertyFindAllMock.mockResolvedValue([mockProperty]);
        PropertyDataServiceMock.getPropertyDetails.mockResolvedValue({ data: { unitOfIssue: 'EA' } });

        // disposal condition & fee mocks
        DisposalConditionFindByPkMock.mockResolvedValue({ id: 5 });
        DisposalConditionFindOneMock.mockResolvedValue({ id: 5 });
        StateDisposalFeesFindMock.mockResolvedValue({ fee: 10 }); // 10%
        StateAmericanSurplusFeesFindMock.mockResolvedValue({ fee: 5 }); //  // 5

        // Act
        const result = await (DocumentFactory as any).getAssetInformationForInvoice(sampleRequest);

        // Assert
        expect(result.propertyDetails).toHaveLength(1);
        const detail = result.propertyDetails[0];
        expect(detail.assetId).toBe('ICN-1'); // Updated from tcn to assetId
        expect(detail.subTotal).toBe(10); // 100 * 10%
        expect(detail.lineTotal).toBe(20); // qty 2 * 10
        expect(result.total).toBe(20);
        expect(result.deliveryFee).toBe(0);
    });
});

describe('Unhappy paths', () => {
    // ERROR PATH: invoiceNoGenerator should throw when config row is missing
    test('invoiceNoGenerator throws when InvoiceConfig not found', async () => {
        // Arrange
        InvoiceConfigMock.findOne.mockResolvedValue(null);

        // Act & Assert
        await expect(
            (DocumentFactory as any).invoiceNoGenerator(1, 'FL', undefined),
        ).rejects.toThrow('Invoice configuration not found');
    });

    // ERROR PATH: signInvoice should reject when signer is not Admin/Manager
    test('signInvoice rejects when user lacks required role', async () => {
        const invoiceInstance = { id: 99, invoice_no: 'FL-1', invoice_data: {}, update: jest.fn() };
        InvoiceFindOneMock.mockResolvedValue(invoiceInstance);

        // Arrange
        UserScopeFindOneMock.mockResolvedValue({ role: { role_name: 'Organization Member' } });
        RequestAttachmentServiceMock.getAttachment.mockResolvedValue({ id: 1, name: 'INV' });

        // Act & Assert
        await expect(
            (DocumentFactory as any).signInvoice({
                request: sampleRequest,
                requestAttachmentId: 1,
                signedBy: sampleUser,
                stateId: 1,
            }),
        ).rejects.toThrow('User is not authorized to sign the invoice');
    });

    // ERROR PATH: getAssetInformationForInvoice should throw when disposal data is missing
    test('getAssetInformationForInvoice throws when disposal condition missing', async () => {
        const mockProperty = {
            property_control_number: 'ICN-2',
            property_original_value: 50,
            property_allocated_quantity: 1,
            property_description: 'Asset',
            property_disposal_condition_id: 9,
        } as any;

        PropertyFindAllMock.mockResolvedValue([mockProperty]);
        PropertyDataServiceMock.getPropertyDetails.mockResolvedValue({ uom: 'EA' });
        DisposalConditionFindByPkMock.mockResolvedValue(null);
        DisposalConditionFindOneMock.mockResolvedValue(null);
        StateDisposalFeesFindMock.mockResolvedValue(null);

        // Act & Assert
        await expect(
            (DocumentFactory as any).getAssetInformationForInvoice(sampleRequest),
        ).rejects.toThrow('Disposal Condition is missing');
    });
});

afterAll(() => {
    jest.restoreAllMocks();

});
