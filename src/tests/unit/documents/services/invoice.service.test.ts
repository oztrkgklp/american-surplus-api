/*
 Test matrix for InvoiceService.createAssetInformationFor()
 - Each case defines inputs and expected outputs/errors explicitly for easy maintenance.
*/

// NOTE: Keep mocks above imports so Jest hoists them correctly

// Minimal Sequelize mock to avoid real connections
jest.mock('sequelize', () => {
    class Transaction { }
    const Op = { ne: Symbol('ne'), lte: Symbol('lte') };
    // Return a shape compatible with imports in code under test
    return { Transaction, Op };
});

// Quiet the logger during tests
jest.mock('@/utils/logger', () => ({
    getLogger: () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn(), log: jest.fn() }),
}));

// EJS used by convertTextToHtml(); return the raw text that was embedded
jest.mock('ejs', () => ({
    render: jest.fn((tpl: string) => {
        // tpl looks like: `<%- "TEXT" %>` — extract content between the quotes
        const m = tpl.match(/<%-\s+\"([\s\S]*?)\"\s+%>/);
        return m ? m[1] : tpl;
    }),
}));

// External dependencies of the service
const PropertyFindAllMock = jest.fn();
jest.mock('@/properties/models/Property', () => ({ __esModule: true, default: { findAll: PropertyFindAllMock } }));

const PropertyDataServiceMock = { getPropertyDetails: jest.fn() };
jest.mock('@/ppms/services/propertyData', () => ({ PropertyDataService: PropertyDataServiceMock }));

const PropertyServiceMock = { getFlatFeeIfExist: jest.fn(), getFlatAmericanSurplusFee: jest.fn() };
jest.mock('@/properties/services/property', () => ({ PropertyService: PropertyServiceMock }));

const DisposalConditionFindOneMock = jest.fn();
jest.mock('@/metadata/models/DisposalCondition', () => ({ __esModule: true, default: { findOne: DisposalConditionFindOneMock } }));

const StateDisposalFeesFindOneMock = jest.fn();
jest.mock('@/states/models/StateDisposalFees', () => ({ __esModule: true, default: { findOne: StateDisposalFeesFindOneMock } }));

const StateAmericanSurplusFeesFindOneMock = jest.fn();
jest.mock('@/states/models/StateAmericanSurplusFees.entity', () => ({ __esModule: true, default: { findOne: StateAmericanSurplusFeesFindOneMock } }));

// Import after mocks
import { Transaction } from 'sequelize';
import { InvoiceService } from '@/documents/services/invoice.service';

// Helpers to build inputs
const mkRequest = (over: Partial<any> = {}) => ({
    id: 1,
    tcn: 'FL-ABC-123',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    doneeAccount: { id: 10, stateId: 1, name: 'DONEE-001' },
    ...over,
} as any);

const mkProperty = (over: Partial<any> = {}) => ({
    property_control_number: 'ICN-1',
    property_original_value: 100,
    property_allocated_quantity: 2,
    property_allocated_date: '2024-01-10',
    property_name: 'Sample Asset',
    property_disposal_condition: 'A',
    ...over,
});

// -------------------------
// Test Cases Matrix
// -------------------------

type DetailExpect = {
    lineTotal?: number;
    subTotal?: number;
    americanSurplusLineTotal?: number;
    americanSurplusSubTotal?: number;
    isFlatFee?: boolean;
    description?: string;
    uom?: string | undefined;
    stateFeePercentage?: number | undefined;
    americanSurplusFeePercentage?: number | undefined;
};

type TestCase = {
    name: string;
    allocatedProperties: any[]; // what Property.findAll returns
    propertyDataByICN?: Record<string, { data?: { unitOfIssue?: string; categoryCode?: number } } | null>;
    disposalConditionByCode?: Record<string, { id: number } | null>;
    fees?: { disposalFee?: { fee: number } | null; americanSurplusFee?: { fee: number } | null };
    flatByICN?: Record<string, number | null | undefined>; // PropertyService.getFlatFeeIfExist
    flatAmericanSurplusByICN?: Record<string, number | null | undefined>; // PropertyService.getFlatAmericanSurplusFee
    expect?: {
        total?: number;
        americanSurplusTotal?: number;
        propertyDetailsLength?: number;
        detailsByICN?: Record<string, DetailExpect>;
    };
    expectError?: string; // substring to match
};

const TEST_CASES: TestCase[] = [
    {
        name: 'Original value rounding: dollar=109.47 qty=1',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND', property_original_value: 109.47, property_allocated_quantity: 5 })],
        propertyDataByICN: { 'ICN-RND': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 0.5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 5.45,
            americanSurplusTotal: 2.7,
            detailsByICN: { 'ICN-RND': { subTotal: 1.09, lineTotal: 5.45, americanSurplusSubTotal: 0.54, americanSurplusLineTotal: 2.7 } }, // round(109.47*100)=10947 -> floor(10947*1)=10947 -> $109.47
        },
    },
    {
        name: 'Original value rounding: dollar=1.00 qty=1',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-001', property_original_value: 1.0, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-001': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 0.5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 0.01,
            americanSurplusTotal: 0,
            detailsByICN: { 'ICN-RND-001': { subTotal: 0.01, lineTotal: 0.01, americanSurplusSubTotal: 0, americanSurplusLineTotal: 0 } },
        },
    },
    {
        name: 'Original value rounding: dollar=1.99 qty=4 (American Surplus floors to 0)',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-199', property_original_value: 1.99, property_allocated_quantity: 4 })],
        propertyDataByICN: { 'ICN-RND-199': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 0.5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 0.04,
            americanSurplusTotal: 0,
            detailsByICN: { 'ICN-RND-199': { subTotal: 0.01, lineTotal: 0.04, americanSurplusSubTotal: 0, americanSurplusLineTotal: 0 } },
        },
    },
    {
        name: 'Original value rounding: dollar=110.00 qty=2',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-110', property_original_value: 110.0, property_allocated_quantity: 2 })],
        propertyDataByICN: { 'ICN-RND-110': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 0.5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 2.2,
            americanSurplusTotal: 1.1,
            detailsByICN: { 'ICN-RND-110': { subTotal: 1.1, lineTotal: 2.2, americanSurplusSubTotal: 0.55, americanSurplusLineTotal: 1.1 } },
        },
    },
    {
        name: 'Original value rounding: dollar=100.99 qty=3',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-10099', property_original_value: 100.99, property_allocated_quantity: 3 })],
        propertyDataByICN: { 'ICN-RND-10099': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 0.5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 3.0,
            americanSurplusTotal: 1.5,
            detailsByICN: { 'ICN-RND-10099': { subTotal: 1.0, lineTotal: 3.0, americanSurplusSubTotal: 0.5, americanSurplusLineTotal: 1.5 } },
        },
    },
    {
        name: 'Original value rounding: large dollar=999999.99 qty=1',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-BIG', property_original_value: 999999.99, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-BIG': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 0.5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 9999.99,
            americanSurplusTotal: 4999.99,
            detailsByICN: { 'ICN-RND-BIG': { subTotal: 9999.99, lineTotal: 9999.99, americanSurplusSubTotal: 4999.99, americanSurplusLineTotal: 4999.99 } },
        },
    },
    {
        name: 'Original value rounding: very small dollar=0.01 qty=1 -> error',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-0001', property_original_value: 0.01, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-0001': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 0.5 } },
        expectError: 'Sum can not be lower than zero',
    },
    {
        name: 'Original value rounding: amount=123.55 @ 1%',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-12355', property_original_value: 123.55, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-12355': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 1 }, americanSurplusFee: { fee: 1 } },
        expect: {
            propertyDetailsLength: 1,
            total: 1.23,
            americanSurplusTotal: 1.23,
            detailsByICN: { 'ICN-RND-12355': { subTotal: 1.23, lineTotal: 1.23, americanSurplusSubTotal: 1.23, americanSurplusLineTotal: 1.23, uom: 'EA' } },
        },
    },
    {
        name: 'Original value rounding: amount=99.99 @ 3.5%',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-9999', property_original_value: 99.99, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-9999': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 3.5 }, americanSurplusFee: { fee: 1.5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 3.49,
            americanSurplusTotal: 1.49,
            detailsByICN: { 'ICN-RND-9999': { subTotal: 3.49, lineTotal: 3.49, americanSurplusSubTotal: 1.49, americanSurplusLineTotal: 1.49, uom: 'EA' } },
        },
    },
    {
        name: 'Original value rounding: amount=456.78 @ 2.2%',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-45678', property_original_value: 456.78, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-45678': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 2.2 }, americanSurplusFee: { fee: 2.2 } },
        expect: {
            propertyDetailsLength: 1,
            total: 10.04,
            americanSurplusTotal: 10.04,
            detailsByICN: { 'ICN-RND-45678': { subTotal: 10.04, lineTotal: 10.04, americanSurplusSubTotal: 10.04, americanSurplusLineTotal: 10.04, uom: 'EA' } },
        },
    },
    {
        name: 'Original value rounding: amount=1000.01 @ 0.75%',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-100001', property_original_value: 1000.01, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-100001': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 0.75 }, americanSurplusFee: { fee: 0.75 } },
        expect: {
            propertyDetailsLength: 1,
            total: 7.5,
            americanSurplusTotal: 7.5,
            detailsByICN: { 'ICN-RND-100001': { subTotal: 7.5, lineTotal: 7.5, americanSurplusSubTotal: 7.5, americanSurplusLineTotal: 7.5, uom: 'EA' } },
        },
    },
    {
        name: 'Original value rounding: amount=87.65 @ 5%',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-RND-8765', property_original_value: 87.65, property_allocated_quantity: 1 })],
        propertyDataByICN: { 'ICN-RND-8765': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 77 } },
        fees: { disposalFee: { fee: 5 }, americanSurplusFee: { fee: 5 } },
        expect: {
            propertyDetailsLength: 1,
            total: 4.38,
            americanSurplusTotal: 4.38,
            detailsByICN: { 'ICN-RND-8765': { subTotal: 4.38, lineTotal: 4.38, americanSurplusSubTotal: 4.38, americanSurplusLineTotal: 4.38, uom: 'EA' } },
        },
    },
    {
        name: 'Percentage path, multiple properties and totals',
        allocatedProperties: [
            mkProperty({ property_control_number: 'ICN-1', property_original_value: 200, property_allocated_quantity: 3, property_name: 'Widget A', property_disposal_condition: 'A' }),
            mkProperty({ property_control_number: 'ICN-2', property_original_value: 50.05, property_allocated_quantity: 2, property_name: 'Widget B', property_disposal_condition: 'B' }),
        ],
        propertyDataByICN: {
            'ICN-1': { data: { unitOfIssue: 'EA', categoryCode: 1 } },
            'ICN-2': { data: { unitOfIssue: 'LB', categoryCode: 1 } },
        },
        disposalConditionByCode: { A: { id: 10 }, B: { id: 11 } },
        fees: { disposalFee: { fee: 5 }, americanSurplusFee: { fee: 2 } },
        expect: {
            propertyDetailsLength: 2,
            total: 35,
            americanSurplusTotal: 14,
            detailsByICN: {
                'ICN-1': { subTotal: 10, lineTotal: 30, americanSurplusSubTotal: 4, americanSurplusLineTotal: 12, uom: 'EA', stateFeePercentage: 5, americanSurplusFeePercentage: 2 },
                'ICN-2': { subTotal: 2.5, lineTotal: 5, americanSurplusSubTotal: 1, americanSurplusLineTotal: 2, uom: 'LB', stateFeePercentage: 5, americanSurplusFeePercentage: 2 },
            },
        },
    },
    {
        name: 'Aircraft flat fee applied when categoryCode=2',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-AIR', property_original_value: 123.45, property_allocated_quantity: 3, property_name: 'Aircraft Engine', property_disposal_condition: 'A' })],
        propertyDataByICN: { 'ICN-AIR': { data: { unitOfIssue: 'EA', categoryCode: 2 } } },
        flatByICN: { 'ICN-AIR': 15.25 },
        flatAmericanSurplusByICN: { 'ICN-AIR': 5.5 },
        expect: {
            propertyDetailsLength: 1,
            total: 45.75,
            americanSurplusTotal: 16.5,
            detailsByICN: { 'ICN-AIR': { subTotal: 15.25, lineTotal: 45.75, americanSurplusSubTotal: 5.5, americanSurplusLineTotal: 16.5, isFlatFee: true, uom: 'EA', stateFeePercentage: 0, americanSurplusFeePercentage: 0 } },
        },
    },
    {
        name: 'Aircraft category but 0 flat fee falls back to percentage',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-AIR0', property_original_value: 100, property_allocated_quantity: 1, property_name: 'Plane Part', property_disposal_condition: 'A' })],
        propertyDataByICN: { 'ICN-AIR0': { data: { unitOfIssue: 'EA', categoryCode: 2 } } },
        disposalConditionByCode: { A: { id: 99 } },
        fees: { disposalFee: { fee: 10 }, americanSurplusFee: { fee: 5 } },
        flatByICN: { 'ICN-AIR0': 0 },
        expect: {
            propertyDetailsLength: 1,
            total: 10,
            americanSurplusTotal: 5,
            detailsByICN: { 'ICN-AIR0': { subTotal: 10, lineTotal: 10, americanSurplusSubTotal: 5, americanSurplusLineTotal: 5, isFlatFee: false, uom: 'EA', stateFeePercentage: 10, americanSurplusFeePercentage: 5 } },
        },
    },
    {
        name: 'Missing property data throws error',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-NODATA' })],
        propertyDataByICN: { 'ICN-NODATA': null },
        expectError: 'Could not fetch property data for invoice',
    },
    {
        name: 'Missing disposal condition throws error',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-NODC', property_original_value: 50, property_allocated_quantity: 1, property_disposal_condition: 'A' })],
        propertyDataByICN: { 'ICN-NODC': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: null },
        expectError: 'Disposal Condition is missing',
    },
    {
        name: 'Missing state disposal fee triggers error',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-NOSDF', property_original_value: 100, property_allocated_quantity: 1, property_disposal_condition: 'A' })],
        propertyDataByICN: { 'ICN-NOSDF': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 1 } },
        fees: { disposalFee: null as any, americanSurplusFee: { fee: 5 } },
        expectError: 'State Disposal Fee is missing',
    },
    {
        name: 'Missing state American Surplus fee triggers error',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-NOAmericanSurplus', property_original_value: 100, property_allocated_quantity: 1, property_disposal_condition: 'A' })],
        propertyDataByICN: { 'ICN-NOAmericanSurplus': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 1 } },
        fees: { disposalFee: { fee: 10 }, americanSurplusFee: undefined as any },
        expectError: 'State Disposal Fee is missing',
    },
    {
        name: 'Zero original value fails non-negative safeguard',
        allocatedProperties: [mkProperty({ property_control_number: 'ICN-ZERO', property_original_value: 0, property_allocated_quantity: 2, property_disposal_condition: 'A' })],
        propertyDataByICN: { 'ICN-ZERO': { data: { unitOfIssue: 'EA', categoryCode: 1 } } },
        disposalConditionByCode: { A: { id: 1 } },
        fees: { disposalFee: { fee: 10 }, americanSurplusFee: { fee: 5 } },
        expectError: 'Sum can not be lower than zero',
    },
    {
        name: 'Description truncation to 40 chars and fallback when name empty',
        allocatedProperties: [
            mkProperty({ property_control_number: 'ICN-LONG', property_original_value: 100, property_allocated_quantity: 1, property_name: 'X'.repeat(50), property_disposal_condition: 'A' }),
            mkProperty({ property_control_number: 'ICN-FALLBACK', property_original_value: 10, property_allocated_quantity: 1, property_name: '   ', property_disposal_condition: 'A' }),
        ],
        propertyDataByICN: {
            'ICN-LONG': { data: { unitOfIssue: 'EA', categoryCode: 1 } },
            'ICN-FALLBACK': { data: { categoryCode: 1 } },
        },
        disposalConditionByCode: { A: { id: 1 } },
        fees: { disposalFee: { fee: 10 }, americanSurplusFee: { fee: 5 } },
        expect: {
            propertyDetailsLength: 2,
            total: 11,
            americanSurplusTotal: 5.5,
            detailsByICN: {
                'ICN-LONG': { description: 'X'.repeat(40) + '...', subTotal: 10, lineTotal: 10, americanSurplusSubTotal: 5, americanSurplusLineTotal: 5, uom: 'EA' },
                'ICN-FALLBACK': { description: 'ICN-FALLBACK', subTotal: 1, lineTotal: 1, americanSurplusSubTotal: 0.5, americanSurplusLineTotal: 0.5, uom: undefined },
            },
        },
    },
    {
        name: 'Undefined allocated properties -> error',
        allocatedProperties: (undefined as any),
        expectError: 'No allocated properties found for this request',
    },
];

// -------------------------
// Test Implementation
// -------------------------

describe('InvoiceService.createAssetInformationFor', () => {
    const tx = {} as Transaction;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test.each(TEST_CASES.map(tc => [tc.name, tc]))('%s', async (_name, tc: TestCase) => {
        // Arrange mocks per case
        PropertyFindAllMock.mockResolvedValue(tc.allocatedProperties);

        // Property data resolver per ICN
        PropertyDataServiceMock.getPropertyDetails.mockImplementation(async (icn: string) => {
            if (!tc.propertyDataByICN) return { data: { unitOfIssue: 'EA' } };
            return tc.propertyDataByICN[icn as string];
        });

        // Disposal condition lookup by code from each property
        DisposalConditionFindOneMock.mockImplementation(async ({ where }: any) => {
            const code = where?.code;
            if (!tc.disposalConditionByCode) return { id: 1 };
            return tc.disposalConditionByCode[code];
        });

        // State fee lookups
        StateDisposalFeesFindOneMock.mockImplementation(async () => (tc.fees && 'disposalFee' in tc.fees ? tc.fees.disposalFee : { fee: 10 }));
        StateAmericanSurplusFeesFindOneMock.mockImplementation(async () => (tc.fees && 'americanSurplusFee' in tc.fees ? tc.fees.americanSurplusFee : { fee: 5 }));

        // Flat fees by ICN for aircraft path
        PropertyServiceMock.getFlatFeeIfExist.mockImplementation(async (icn: string) => tc.flatByICN ? tc.flatByICN[icn] : null);
        PropertyServiceMock.getFlatAmericanSurplusFee.mockImplementation(async (icn: string) => tc.flatAmericanSurplusByICN ? tc.flatAmericanSurplusByICN[icn] : null);

        const request = mkRequest();

        // Act + Assert per expectation
        if (tc.expectError) {
            await expect(InvoiceService.createAssetInformation(request, tx)).rejects.toThrow(tc.expectError);
            return;
        }

        const result = await InvoiceService.createAssetInformation(request, tx);

        // Basic totals and length
        if (tc.expect?.propertyDetailsLength !== undefined) {
            expect(result.propertyDetails).toHaveLength(tc.expect.propertyDetailsLength);
        }
        if (tc.expect?.total !== undefined) {
            console.log("Result total:", result.total, "||", "Excepted total", tc.expect.total, "||", tc.name);
            expect(result.total).toBeCloseTo(tc.expect.total, 2);
        }
        if (tc.expect?.americanSurplusTotal !== undefined) {
            expect(result.americanSurplusTotal).toBeCloseTo(tc.expect.americanSurplusTotal, 2);
        }

        // Per-ICN detail assertions
        if (tc.expect?.detailsByICN) {
            const detailsByICN: Record<string, any> = {};
            for (const d of result.propertyDetails) detailsByICN[d.assetId] = d;

            for (const [icn, de] of Object.entries(tc.expect.detailsByICN)) {
                const got = detailsByICN[icn];
                expect(got).toBeTruthy();
                if (de.subTotal !== undefined) expect(got.subTotal).toBeCloseTo(de.subTotal, 2);
                if (de.lineTotal !== undefined) expect(got.lineTotal).toBeCloseTo(de.lineTotal, 2);
                if (de.americanSurplusSubTotal !== undefined) expect(got.americanSurplusSubTotal).toBeCloseTo(de.americanSurplusSubTotal, 2);
                if (de.americanSurplusLineTotal !== undefined) expect(got.americanSurplusLineTotal).toBeCloseTo(de.americanSurplusLineTotal, 2);
                if (de.isFlatFee !== undefined) expect(got.isFlatFee).toBe(de.isFlatFee);
                if (de.description !== undefined) expect(got.description).toBe(de.description);
                if (de.uom !== undefined) expect(got.uom).toBe(de.uom);
                if (de.stateFeePercentage !== undefined) expect(got.stateFeePercentage).toBe(de.stateFeePercentage);
                if (de.americanSurplusFeePercentage !== undefined) expect(got.americanSurplusFeePercentage).toBe(de.americanSurplusFeePercentage);
            }
        }
    });
});
