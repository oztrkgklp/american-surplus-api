export type NotificationSection = 'attachments' | 'properties';

type SaspContext = { isSasp: true; stateId: number };
type DoneeContext = { isSasp: false; organizationId: string };
export type NotificationRoleContext = SaspContext | DoneeContext;

const requestBase = (ctx: NotificationRoleContext, requestId: number): string =>
    ctx.isSasp
        ? `/org/sasp/${ctx.stateId}/request/${requestId}`
        : `/org/${ctx.organizationId}/request/${requestId}`;

const applicationBase = (ctx: NotificationRoleContext, applicationId: number): string =>
    ctx.isSasp
        ? `/org/sasp/${ctx.stateId}/eligibility-applications/${applicationId}`
        : `/org/${ctx.organizationId}/eligibility-applications/${applicationId}`;

export const requestUrl = (
    ctx: NotificationRoleContext,
    requestId: number,
    opts: { section?: NotificationSection; propertyId?: number } = {},
): string => {
    const query = opts.propertyId ? `?highlightProperty=${opts.propertyId}` : '';
    const hash = opts.section ? `#${opts.section}` : '';
    return `${requestBase(ctx, requestId)}${query}${hash}`;
};

export const invoiceUrl = (ctx: NotificationRoleContext, requestId: number): string =>
    `${requestBase(ctx, requestId)}?openInvoice=auto#attachments`;

export const loarUrl = (ctx: NotificationRoleContext, requestId: number): string =>
    `${requestBase(ctx, requestId)}?openLoar=auto#attachments`;

export const applicationUrl = (
    ctx: NotificationRoleContext,
    applicationId: number,
    opts: { formId?: number } = {},
): string => {
    const base = applicationBase(ctx, applicationId);
    return opts.formId ? `${base}?form=${opts.formId}` : base;
};

// Donee-only — no SASP equivalent.
export const propertyUrl = (organizationId: string, propertyId: number): string =>
    `/org/${organizationId}/property/${propertyId}`;

export const wantListUrl = (organizationId: string): string =>
    `/org/${organizationId}/want-list?tab=matches`;
