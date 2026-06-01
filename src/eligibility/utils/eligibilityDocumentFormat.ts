/** Formatting helpers for eligibility application PDFs and related documents. */

export function formatEligibilityDocDate(ms?: number | Date | null): string {
  if (ms === undefined || ms === null) return 'N/A';
  const t = ms instanceof Date ? ms.getTime() : Number(ms);
  if (!Number.isFinite(t)) return 'N/A';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString();
}

export function formatEligibilitySubmittedDateMmDdYyyy(ms?: number | null): string {
  if (ms === undefined || ms === null) return 'N/A';
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return 'N/A';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function formatUsPhoneDisplay(phone?: string | null): string {
  if (phone === undefined || phone === null || String(phone).trim() === '') return 'N/A';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(phone);
}

/** EIN / TIN for eligibility PDF: exactly `##-#######` (9 digits). */
export function formatTinEinEligibilityPdf(tin?: string | null): string {
  if (tin === undefined || tin === null || String(tin).trim() === '') return 'N/A';
  const digits = String(tin).replace(/\D/g, '');
  if (digits.length !== 9) return String(tin).trim();
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** US phone / fax for org info block: `+1 (###) ###-####`. */
export function formatUsPhonePlusOneEligibilityPdf(phone?: string | null): string {
  if (phone === undefined || phone === null || String(phone).trim() === '') return 'N/A';
  const digits = String(phone).replace(/\D/g, '');
  let n = digits;
  // Accept E.164-like values and tolerate trailing digits by taking first US core number.
  if (n.length >= 11 && n.startsWith('1')) n = n.slice(1, 11);
  if (n.length === 10) {
    return `+1 (${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  return 'N/A';
}

/** Prefer Form 1 JSON when non-empty; otherwise use org-derived fallbacks. */
export function coalesceOrganizationalIdentityField(
  formData1: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const v = formData1?.[key];
  if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  const f = (fallback && fallback !== 'N/A' ? String(fallback) : '').trim();
  return f;
}

export type OrganizationalIdentityPhonePdfOpts = {
  headAuthorizedOfficialPhone: string;
  primaryContactPhoneFallback: string;
  organizationPhoneFallback: string;
  organizationFaxFallback: string;
};

export function formatOrganizationalIdentityPhonesForPdf(
  formDataMap: Record<number, unknown>,
  opts: OrganizationalIdentityPhonePdfOpts,
) {
  const fd1 = formDataMap[1] as Record<string, unknown> | undefined;
  return {
    headAuthorizedOfficialPhone: formatUsPhonePlusOneEligibilityPdf(
      coalesceOrganizationalIdentityField(
        fd1,
        'headAuthorizedOfficialPhone',
        opts.headAuthorizedOfficialPhone,
      ) || null,
    ),
    primaryContactPhone: formatUsPhonePlusOneEligibilityPdf(
      coalesceOrganizationalIdentityField(fd1, 'primaryContactPhone', opts.primaryContactPhoneFallback) || null,
    ),
    organizationPhone: formatUsPhonePlusOneEligibilityPdf(
      coalesceOrganizationalIdentityField(fd1, 'organizationPhone', opts.organizationPhoneFallback) || null,
    ),
    organizationFaxNumber: formatUsPhonePlusOneEligibilityPdf(
      coalesceOrganizationalIdentityField(fd1, 'organizationFaxNumber', opts.organizationFaxFallback) || null,
    ),
  };
}

export function mapAuthorizedRepresentativePhonesForPdf(reps: unknown): unknown[] {
  if (!Array.isArray(reps)) return [];
  return reps.map((rep) => {
    if (rep == null || typeof rep !== 'object') return rep;
    const r = rep as Record<string, unknown>;
    const raw = r.phoneNumber ?? r.phone;
    const formatted = formatUsPhonePlusOneEligibilityPdf(
      raw !== undefined && raw !== null && String(raw).trim() !== '' ? String(raw) : null,
    );
    return { ...r, phoneNumber: formatted };
  });
}

/** Payload shape for PDF root org table fields (from {@link OrganizationUserService.getOrganizationById}). */
export type OrganizationPdfTableSource = {
    name?: string | null;
    tin?: string | null;
    website?: string | null;
    organization_type?: string | null;
    primary_activity?: string | null;
    primary_contact_name?: string | null;
    primary_contact_phone?: string | null;
    primary_contact_email?: string | null;
    primary_contact_title?: string | null;
    mailing_address_line1?: string | null;
    mailing_address_line2?: string | null;
    mailing_city?: string | null;
    mailing_state?: string | null;
    mailing_zip?: string | null;
};

/** Root template fields derived from organization + resolved primary contact (not form JSON). */
export function organizationTableFieldsForEligibilityPdf(organization: OrganizationPdfTableSource) {
    const primaryName = String(organization.primary_contact_name ?? '').trim();
    const organizationContactNameDisplay = primaryName || 'N/A';

    return {
        organizationName: organization.name || 'N/A',
        organizationTinEin: formatTinEinEligibilityPdf(organization.tin),
        organizationPhone: formatUsPhonePlusOneEligibilityPdf(organization.primary_contact_phone ?? null),
        organizationEmail: String(organization.primary_contact_email ?? '').trim() || 'N/A',
        organizationFaxNumber: formatUsPhonePlusOneEligibilityPdf(null),
        organizationWebsiteAddress: organization.website?.trim() || 'N/A',
        organizationTypeDisplay: organization.organization_type || 'N/A',
        organizationPrimaryActivityDisplay: organization.primary_activity || 'N/A',
        organizationContactNameDisplay,
        organizationMailingLine1: organization.mailing_address_line1 ?? '',
        organizationMailingLine2: organization.mailing_address_line2 ?? '',
        organizationMailingCity: organization.mailing_city ?? '',
        organizationMailingState: organization.mailing_state ?? '',
        organizationMailingZip: organization.mailing_zip ?? '',
    };
}

export function normalizeStateAddressLine2(line?: string | null): string {
  const s = String(line ?? '').replace(/\bPROPETY\b/gi, 'PROPERTY');
  return s || 'N/A';
}
