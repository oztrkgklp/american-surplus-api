import {
    applicationUrl,
    invoiceUrl,
    loarUrl,
    propertyUrl,
    requestUrl,
    wantListUrl,
} from '@/notifications/utils/notificationUrls';

const SASP = { isSasp: true as const, stateId: 5 };
const DONEE = { isSasp: false as const, organizationId: 'org-A' };

describe('requestUrl', () => {
    it('SASP base path', () => {
        expect(requestUrl(SASP, 42)).toBe('/org/sasp/5/request/42');
    });

    it('Donee base path', () => {
        expect(requestUrl(DONEE, 42)).toBe('/org/org-A/request/42');
    });

    it('Donee with UUID-like organizationId is not URL-encoded — orgId is opaque', () => {
        expect(requestUrl({ isSasp: false, organizationId: '11111111-1111-1111-1111-111111111111' }, 7))
            .toBe('/org/11111111-1111-1111-1111-111111111111/request/7');
    });

    it('section without propertyId → only hash anchor', () => {
        expect(requestUrl(SASP, 42, { section: 'properties' })).toBe('/org/sasp/5/request/42#properties');
        expect(requestUrl(SASP, 42, { section: 'attachments' })).toBe('/org/sasp/5/request/42#attachments');
    });

    it('propertyId without section → only highlight query', () => {
        expect(requestUrl(SASP, 42, { propertyId: 99 })).toBe('/org/sasp/5/request/42?highlightProperty=99');
    });

    it('section + propertyId → highlight query then section hash, in that order', () => {
        expect(requestUrl(SASP, 42, { section: 'properties', propertyId: 99 }))
            .toBe('/org/sasp/5/request/42?highlightProperty=99#properties');
    });

    it('section + propertyId works the same for Donee role', () => {
        expect(requestUrl(DONEE, 42, { section: 'properties', propertyId: 99 }))
            .toBe('/org/org-A/request/42?highlightProperty=99#properties');
    });

    it('large numeric stateId / requestId / propertyId — no overflow / truncation', () => {
        expect(requestUrl({ isSasp: true, stateId: 999999 }, 8675309, { propertyId: 12345678 }))
            .toBe('/org/sasp/999999/request/8675309?highlightProperty=12345678');
    });
});

describe('invoiceUrl — always auto-opens the invoice viewer + jumps to attachments', () => {
    it('SASP', () => {
        expect(invoiceUrl(SASP, 100)).toBe('/org/sasp/5/request/100?openInvoice=auto#attachments');
    });

    it('Donee', () => {
        expect(invoiceUrl(DONEE, 100)).toBe('/org/org-A/request/100?openInvoice=auto#attachments');
    });
});

describe('loarUrl — always auto-opens the LOAR viewer + jumps to attachments', () => {
    it('SASP', () => {
        expect(loarUrl(SASP, 200)).toBe('/org/sasp/5/request/200?openLoar=auto#attachments');
    });

    it('Donee', () => {
        expect(loarUrl(DONEE, 200)).toBe('/org/org-A/request/200?openLoar=auto#attachments');
    });
});

describe('applicationUrl', () => {
    it('SASP base path', () => {
        expect(applicationUrl(SASP, 7)).toBe('/org/sasp/5/eligibility-applications/7');
    });

    it('Donee base path', () => {
        expect(applicationUrl(DONEE, 7)).toBe('/org/org-A/eligibility-applications/7');
    });

    it('formId option appends ?form=:formId', () => {
        expect(applicationUrl(SASP, 7, { formId: 11 })).toBe('/org/sasp/5/eligibility-applications/7?form=11');
        expect(applicationUrl(DONEE, 7, { formId: 11 })).toBe('/org/org-A/eligibility-applications/7?form=11');
    });

    it('formId=0 is treated as falsy → no query param (no destination for form 0)', () => {
        // Documents current behaviour: formId is only appended when truthy.
        expect(applicationUrl(SASP, 7, { formId: 0 })).toBe('/org/sasp/5/eligibility-applications/7');
    });
});

describe('propertyUrl — donee-only', () => {
    it('returns donee-side property details path', () => {
        expect(propertyUrl('org-A', 321)).toBe('/org/org-A/property/321');
    });

    it('UUID-like organizationId stays opaque', () => {
        expect(propertyUrl('11111111-1111-1111-1111-111111111111', 1))
            .toBe('/org/11111111-1111-1111-1111-111111111111/property/1');
    });
});

describe('wantListUrl — donee-only', () => {
    it('returns donee-side want-list path with ?tab=matches', () => {
        expect(wantListUrl('org-A')).toBe('/org/org-A/want-list?tab=matches');
    });
});

describe('URL contract — what each builder guarantees', () => {
    it('SASP URLs always start with /org/sasp/{stateId}/', () => {
        expect(requestUrl(SASP, 1)).toMatch(/^\/org\/sasp\/5\//);
        expect(invoiceUrl(SASP, 1)).toMatch(/^\/org\/sasp\/5\//);
        expect(loarUrl(SASP, 1)).toMatch(/^\/org\/sasp\/5\//);
        expect(applicationUrl(SASP, 1)).toMatch(/^\/org\/sasp\/5\//);
    });

    it('Donee URLs always start with /org/{organizationId}/ and never expose stateId', () => {
        for (const url of [requestUrl(DONEE, 1), invoiceUrl(DONEE, 1), loarUrl(DONEE, 1), applicationUrl(DONEE, 1), propertyUrl(DONEE.organizationId, 1), wantListUrl(DONEE.organizationId)]) {
            expect(url).toMatch(/^\/org\/org-A\//);
            expect(url).not.toMatch(/sasp/);
        }
    });

    it('invoice/loar always include the auto-open query and attachments anchor — never accidentally raw request URL', () => {
        for (const url of [invoiceUrl(SASP, 1), invoiceUrl(DONEE, 1)]) {
            expect(url).toContain('?openInvoice=auto');
            expect(url).toContain('#attachments');
        }
        for (const url of [loarUrl(SASP, 1), loarUrl(DONEE, 1)]) {
            expect(url).toContain('?openLoar=auto');
            expect(url).toContain('#attachments');
        }
    });
});
