import { Transaction } from 'sequelize';
import OrganizationAddress from '@/organization/models/OrganizationAddress';
import { OrganizationAddressType } from '@/enums/organizationAddressType.enum';
import { database } from '@/utils/database';
import Organization from '@/organization/models/Organization';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import Application from '@/eligibility/models/Application.entity';

export type Form1AddressJson = {
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
};

export type OrganizationAddressUpsertInput = {
    address_type: OrganizationAddressType | string;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
};

/** Address block shape for eligibility PDF templates (Form 1 organizational identity). */
export type EligibilityPdfAddressBlock = {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
};

/** Populated by {@link OrganizationAddressService.hydrateCompatMailingOnOrganization} for legacy consumers. */
export type OrganizationMailingCompatFields = {
    mailing_address_line1?: string;
    mailing_address_line2?: string;
    mailing_city?: string;
    mailing_state?: string;
    mailing_zip?: string;
};

function isAddressFilled(addr: unknown): addr is Form1AddressJson {
    if (addr == null || typeof addr !== 'object') return false;
    const a = addr as Record<string, unknown>;
    return (
        a.addressLine1 != null &&
        String(a.addressLine1).trim() !== '' &&
        a.city != null &&
        String(a.city).trim() !== '' &&
        a.state != null &&
        String(a.state).trim() !== '' &&
        a.zipCode != null &&
        String(a.zipCode).trim() !== ''
    );
}

function formJsonToUpsertInput(
    address_type: OrganizationAddressType,
    addr: Form1AddressJson
): OrganizationAddressUpsertInput {
    return {
        address_type,
        address_line1: String(addr.addressLine1).trim(),
        address_line2: addr.addressLine2 != null && String(addr.addressLine2).trim() !== '' ? String(addr.addressLine2).trim() : null,
        city: String(addr.city).trim(),
        state: String(addr.state).trim(),
        postal_code: String(addr.zipCode).trim(),
    };
}

function parseForm1Record(formData: object | string | null | undefined): Record<string, unknown> {
    if (formData == null) return {};
    if (typeof formData === 'string') {
        try {
            return JSON.parse(formData || '{}') as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return formData as Record<string, unknown>;
}

/** Used when legacy `organizations.mailing_*` is missing or empty and Form 1 has no HQ — still satisfies NOT NULL on `organization_addresses`. */
const EMPTY_MAILING_FALLBACK: {
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
} = {
    address_line1: '',
    address_line2: null,
    city: '',
    state: '',
    postal_code: '',
};

export class OrganizationAddressService {
    static async listByOrganizationId(organizationId: string, transaction?: Transaction): Promise<OrganizationAddress[]> {
        return OrganizationAddress.findAll({
            where: { organization_id: organizationId },
            transaction,
            order: [['address_type', 'ASC']],
        });
    }

    private static upsertRowToPdfBlock(row: OrganizationAddressUpsertInput): EligibilityPdfAddressBlock {
        return {
            addressLine1: row.address_line1,
            addressLine2: row.address_line2 ?? '',
            city: row.city,
            state: row.state,
            zipCode: row.postal_code,
        };
    }

    private static storedRowToPdfBlock(row: OrganizationAddress): EligibilityPdfAddressBlock {
        return {
            addressLine1: row.address_line1,
            addressLine2: row.address_line2 ?? '',
            city: row.city,
            state: row.state,
            zipCode: row.postal_code,
        };
    }

    private static emptyPdfAddressBlock(): EligibilityPdfAddressBlock {
        return { addressLine1: '', addressLine2: '', city: '', state: '', zipCode: '' };
    }

    /**
     * Resolved HQ / mailing / office lines for eligibility PDFs (same rules as Form 1 sync).
     */
    static async resolvedPdfOrganizationalAddresses(
        organizationId: string,
        form1Data: object | string | null | undefined,
        transaction?: Transaction,
    ): Promise<{
        headquartersAddress: EligibilityPdfAddressBlock;
        mailingAddress: EligibilityPdfAddressBlock;
        officeLocationAddress: EligibilityPdfAddressBlock;
    }> {
        const fallback = await this.getMailingFallbackFromDb(organizationId);
        const fromForm = this.resolveFromForm1Payload(form1Data, fallback);
        if (fromForm.length >= 3) {
            const byType = new Map(fromForm.map((r) => [r.address_type, r]));
            return {
                headquartersAddress: this.upsertRowToPdfBlock(
                    byType.get(OrganizationAddressType.HEADQUARTERS) as OrganizationAddressUpsertInput,
                ),
                mailingAddress: this.upsertRowToPdfBlock(
                    byType.get(OrganizationAddressType.MAILING) as OrganizationAddressUpsertInput,
                ),
                officeLocationAddress: this.upsertRowToPdfBlock(
                    byType.get(OrganizationAddressType.OFFICE_LOCATION) as OrganizationAddressUpsertInput,
                ),
            };
        }

        const dbRows = await this.listByOrganizationId(organizationId, transaction);
        if (dbRows.length > 0) {
            const byType = new Map(dbRows.map((r) => [r.address_type, r]));
            const hq = byType.get(OrganizationAddressType.HEADQUARTERS);
            const mail = byType.get(OrganizationAddressType.MAILING) ?? hq;
            const office = byType.get(OrganizationAddressType.OFFICE_LOCATION) ?? hq;
            return {
                headquartersAddress: hq ? this.storedRowToPdfBlock(hq) : this.emptyPdfAddressBlock(),
                mailingAddress: mail ? this.storedRowToPdfBlock(mail) : this.emptyPdfAddressBlock(),
                officeLocationAddress: office ? this.storedRowToPdfBlock(office) : this.emptyPdfAddressBlock(),
            };
        }

        if (fallback) {
            const block: EligibilityPdfAddressBlock = {
                addressLine1: fallback.address_line1,
                addressLine2: fallback.address_line2 ?? '',
                city: fallback.city,
                state: fallback.state,
                zipCode: fallback.postal_code,
            };
            return {
                headquartersAddress: block,
                mailingAddress: block,
                officeLocationAddress: block,
            };
        }

        const empty = this.emptyPdfAddressBlock();
        return {
            headquartersAddress: empty,
            mailingAddress: empty,
            officeLocationAddress: empty,
        };
    }

    /**
     * Resolve HQ / mailing / office from form 1 JSON (including "same as headquarters" flags).
     * Missing pieces fall back to `mailingFallback` when provided.
     */
    static resolveFromForm1Payload(
        formData: object | string | null | undefined,
        mailingFallback?: {
            address_line1: string;
            address_line2?: string | null;
            city: string;
            state: string;
            postal_code: string;
        }
    ): OrganizationAddressUpsertInput[] {
        const fd = parseForm1Record(formData);
        const hqRaw = fd.headquartersAddress;
        const useSameMailing = fd.useSameAsHeadquartersForMailing === true;
        const useSameOffice = fd.useSameAsHeadquartersForOffice === true;

        let hq: Form1AddressJson | null = isAddressFilled(hqRaw) ? (hqRaw as Form1AddressJson) : null;
        if (!hq && mailingFallback) {
            hq = {
                addressLine1: mailingFallback.address_line1,
                addressLine2: mailingFallback.address_line2 ?? '',
                city: mailingFallback.city,
                state: mailingFallback.state,
                zipCode: mailingFallback.postal_code,
            };
        }
        if (!hq) return [];

        const mailingSrc = useSameMailing ? hq : fd.mailingAddress;
        const officeSrc = useSameOffice ? hq : fd.officeLocationAddress;

        const mailing: Form1AddressJson = isAddressFilled(mailingSrc) ? (mailingSrc as Form1AddressJson) : hq;
        const office: Form1AddressJson = isAddressFilled(officeSrc) ? (officeSrc as Form1AddressJson) : hq;

        return [
            formJsonToUpsertInput(OrganizationAddressType.HEADQUARTERS, hq),
            formJsonToUpsertInput(OrganizationAddressType.MAILING, mailing),
            formJsonToUpsertInput(OrganizationAddressType.OFFICE_LOCATION, office),
        ];
    }

    static async upsertMany(organizationId: string, rows: OrganizationAddressUpsertInput[], transaction?: Transaction): Promise<void> {
        for (const row of rows) {
            const existing = await OrganizationAddress.findOne({
                where: { organization_id: organizationId, address_type: row.address_type },
                transaction,
            });
            const payload = {
                address_line1: row.address_line1,
                address_line2: row.address_line2 ?? null,
                city: row.city,
                state: row.state,
                postal_code: row.postal_code,
            };
            if (existing) {
                await existing.update(payload, { transaction });
            } else {
                await OrganizationAddress.create(
                    {
                        organization_id: organizationId,
                        address_type: row.address_type,
                        ...payload,
                    },
                    { transaction }
                );
            }
        }
    }

    static async syncFromForm1Payload(
        organizationId: string,
        formData: object | string | null | undefined,
        mailingFallback?: {
            address_line1: string;
            address_line2?: string | null;
            city: string;
            state: string;
            postal_code: string;
        },
        transaction?: Transaction,
        options?: { ensureAllAddressTypes?: boolean }
    ): Promise<void> {
        const ensureAllAddressTypes = options?.ensureAllAddressTypes === true;
        const effectiveFallback = ensureAllAddressTypes
            ? (mailingFallback ?? EMPTY_MAILING_FALLBACK)
            : mailingFallback;
        let rows = this.resolveFromForm1Payload(formData, effectiveFallback);
        if (rows.length === 0 && ensureAllAddressTypes) {
            rows = this.resolveFromForm1Payload({}, EMPTY_MAILING_FALLBACK);
        }
        if (rows.length === 0) return;
        await this.upsertMany(organizationId, rows, transaction);
    }

    /**
     * Merge form 1 address keys + checkbox flags from stored rows (resolved lines).
     */
    static toForm1AddressFields(addresses: OrganizationAddress[]): Record<string, unknown> {
        const byType = new Map(addresses.map((a) => [a.address_type, a]));
        const toJson = (a: OrganizationAddress | undefined) =>
            a
                ? {
                      addressLine1: a.address_line1,
                      addressLine2: a.address_line2 ?? '',
                      city: a.city,
                      state: a.state,
                      zipCode: a.postal_code,
                  }
                : {};

        const hq = byType.get(OrganizationAddressType.HEADQUARTERS);
        const mail = byType.get(OrganizationAddressType.MAILING);
        const off = byType.get(OrganizationAddressType.OFFICE_LOCATION);

        const hqJ = toJson(hq) as Form1AddressJson;
        const mailJ = toJson(mail) as Form1AddressJson;
        const offJ = toJson(off) as Form1AddressJson;

        const addrEq = (x: Form1AddressJson, y: Form1AddressJson) =>
            String(x.addressLine1 ?? '') === String(y.addressLine1 ?? '') &&
            String(x.addressLine2 ?? '') === String(y.addressLine2 ?? '') &&
            String(x.city ?? '') === String(y.city ?? '') &&
            String(x.state ?? '') === String(y.state ?? '') &&
            String(x.zipCode ?? '') === String(y.zipCode ?? '');

        const useSameMailing = isAddressFilled(hqJ) && isAddressFilled(mailJ) && addrEq(hqJ, mailJ);
        const useSameOffice = isAddressFilled(hqJ) && isAddressFilled(offJ) && addrEq(hqJ, offJ);

        return {
            headquartersAddress: hqJ,
            mailingAddress: useSameMailing ? {} : mailJ,
            officeLocationAddress: useSameOffice ? {} : offJ,
            useSameAsHeadquartersForMailing: useSameMailing,
            useSameAsHeadquartersForOffice: useSameOffice,
        };
    }

    /** Shape still used by PDF templates, QBO, and invoices (MAILING row, else headquarters). */
    static mailingFieldsFromAddressRows(rows: OrganizationAddress[]): {
        mailing_address_line1: string;
        mailing_address_line2: string;
        mailing_city: string;
        mailing_state: string;
        mailing_zip: string;
    } {
        const byType = new Map(rows.map((r) => [r.address_type, r]));
        const pick = byType.get(OrganizationAddressType.MAILING) ?? byType.get(OrganizationAddressType.HEADQUARTERS);
        if (!pick) {
            return {
                mailing_address_line1: '',
                mailing_address_line2: '',
                mailing_city: '',
                mailing_state: '',
                mailing_zip: '',
            };
        }
        return {
            mailing_address_line1: pick.address_line1,
            mailing_address_line2: pick.address_line2 ?? '',
            mailing_city: pick.city,
            mailing_state: pick.state,
            mailing_zip: pick.postal_code,
        };
    }

    /** Mutates Sequelize Organization (or plain org object) with legacy mailing_* keys for templates / invoice. */
    static async hydrateCompatMailingOnOrganization(
        org: Organization | null | undefined,
        transaction?: Transaction
    ): Promise<void> {
        if (!org?.id) return;
        const rows = await this.listByOrganizationId(org.id, transaction);
        const m = this.mailingFieldsFromAddressRows(rows);
        Object.assign(org as unknown as Record<string, unknown>, m);
    }

    /**
     * ETL: for every organization, upsert HEADQUARTERS / MAILING / OFFICE_LOCATION from latest form_id=1 JSON
     * (by application_forms.updatedAt). Uses legacy `organizations.mailing_*` when present; otherwise empty
     * placeholders so every org gets three rows. If the main path throws, retries with placeholders only.
     */
    static async migrateAllOrganizationsFromLatestForm1(): Promise<{
        organizationsProcessed: number;
        organizationsWithRows: number;
        errors: string[];
    }> {
        const orgs = await Organization.findAll({ attributes: ['id'] });
        const errors: string[] = [];
        let organizationsWithRows = 0;
        for (const org of orgs) {
            try {
                const latestForm1 = await ApplicationForm.findOne({
                    where: { form_id: 1 },
                    include: [
                        {
                            model: Application,
                            as: 'application',
                            where: { organization_id: org.id },
                            required: true,
                            attributes: [],
                        },
                    ],
                    order: [['updatedAt', 'DESC']],
                });
                const fallbackFromDb = await this.getMailingFallbackFromDb(org.id);
                await this.syncFromForm1Payload(
                    org.id,
                    latestForm1?.form_data ?? {},
                    fallbackFromDb,
                    undefined,
                    { ensureAllAddressTypes: true },
                );
                organizationsWithRows += 1;
            } catch (e) {
                try {
                    await this.syncFromForm1Payload(
                        org.id,
                        {},
                        undefined,
                        undefined,
                        { ensureAllAddressTypes: true },
                    );
                    organizationsWithRows += 1;
                } catch (e2) {
                    errors.push(
                        `${org.id}: ${e instanceof Error ? e.message : String(e)}; fallback: ${e2 instanceof Error ? e2.message : String(e2)}`,
                    );
                }
            }
        }
        return { organizationsProcessed: orgs.length, organizationsWithRows, errors };
    }

    /** Legacy DB columns (only present before migration 38 drops them). Returns undefined when the row is missing or all legacy mailing fields are blank. */
    static async getMailingFallbackFromDb(organizationId: string): Promise<
        | {
              address_line1: string;
              address_line2?: string | null;
              city: string;
              state: string;
              postal_code: string;
          }
        | undefined
    > {
        try {
            const [rows] = await database.sequelize.query(
                `SELECT mailing_address_line1 AS address_line1,
                        mailing_address_line2 AS address_line2,
                        mailing_city AS city,
                        mailing_state AS state,
                        mailing_zip AS postal_code
                 FROM organizations WHERE id = :organizationId LIMIT 1`,
                { replacements: { organizationId } }
            );
            const row = (rows as Record<string, unknown>[])[0];
            if (!row) return undefined;
            const result = {
                address_line1: String(row.address_line1 ?? '').trim(),
                address_line2: row.address_line2 != null ? String(row.address_line2).trim() : null,
                city: String(row.city ?? '').trim(),
                state: String(row.state ?? '').trim(),
                postal_code: String(row.postal_code ?? '').trim(),
            };
            const hasAny =
                result.address_line1 !== '' ||
                result.city !== '' ||
                result.state !== '' ||
                result.postal_code !== '' ||
                (result.address_line2 != null && result.address_line2 !== '');
            if (!hasAny) return undefined;
            return result;
        } catch {
            return undefined;
        }
    }
}
