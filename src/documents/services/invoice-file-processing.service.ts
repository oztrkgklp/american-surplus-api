import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import { getLogger } from "@/utils/logger";
import Invoice, { InvoiceStatus } from "@/documents/models/Invoice.entity";
import Organization from "@/organization/models/Organization";
import Request from "@/properties/models/Request";
import DoneeAccount from "@/organization/models/DoneeAccount";
import { StoragePaths } from "@/utils/storage/paths";
import State from "@/states/models/State";
import { RequestStatusEnum } from "@/enums/request-property-status.enum";
import { QBOInvoiceService } from "@/qbo/invoice/invoice.service";
import InvoiceActivityLog, { InvoiceActivity } from "../models/InvoiceActivityLogs.entity";
import { withTransaction } from "@/utils/transactionalOperation";
import { OrganizationAddressService, type OrganizationMailingCompatFields } from "@/organization/services/organizationAddress.service";
import { OrganizationUserService } from "@/organization/services/organizationUser";

const logger = getLogger("InvoiceFileProcessingService");

export class InvoiceFileProcessingService {

    // Export invoices to CSV
    static async exportInvoicesToCsv() {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const invoices = await Invoice.findAll({
            where: {
                updatedAt: {
                    [Op.gte]: yesterday,
                    [Op.lt]: now,
                },
            },
            include: [
                {
                    model: DoneeAccount,
                    as: "doneeAccount",
                    include: [{ model: Organization, as: "organization" }],
                },
                {
                    model: State,
                    as: 'state',
                },
                {
                    model: Request,
                    as: 'request'
                }
            ]
        });

        const headers = [
            "id",
            "invoice_no",
            "total_amount",
            "total_amount_pennies",
            "american_surplus_amount",
            "american_surplus_amount_pennies",
            "sasp_net_amount",
            "sasp_net_amount_pennies",
            "status",
            "stateName",
            "doneeAccount",
            "createdAt",
            "updatedAt",
            "tcn",
            "organization_id",
            "organization_name",
            "organization_contact_full_name",
            "organization_contact_email",
            "organization_contact_phone",
            "organization_address_line_1",
            "organization_address_line_2",
            "organization_city",
            "organization_state",
            "organization_zip",
            "signed_by_name",
            "signed_by_id",
            "asset_line_json"
        ];

        const getSignDetails = (inv: any) => {
            const container = (inv.invoice_data ?? {}) as any;
            const name = container.signedByName ?? '';
            const id = container.signedById ?? '';
            return { name, id };
        };

        // Helper to extract propertyDetails
        const getPropertyDetails = (inv: any) => {
            const container = (inv.invoice_data ?? {}) as any;
            const ai = container.assetInformation ?? [];
            const details = Array.isArray(ai?.propertyDetails) ? ai.propertyDetails : (Array.isArray(ai) ? ai : []);
            // Normalize keys you rely on; fallback to safe defaults
            return (details ?? []).map((d: any) => ({
                assetId: d.assetId,
                description: d.description,
                disposalCode: d.disposalCode,
                quantity: d.quantity,
                uom: d.uom,
                oac: d.original_value,
                subTotal: d.subTotal,
                subTotal_pennies: d.subTotal_pennies,
                americanSurplusSubTotal: d.americanSurplusSubTotal,
                americanSurplusSubTotal_pennies: d.americanSurplusSubTotal_pennies,
                lineTotal: d.lineTotal,
                lineTotal_pennies: d.lineTotal_pennies,
                lineTotalPenniesWithoutRounding: d.lineTotalPennies_without_rounding,
                americanSurplusLineTotal: d.americanSurplusLineTotal,
                americanSurplusLineTotal_pennies: d.americanSurplusLineTotal_pennies,
                stateFeePercentage: d.stateFeePercentage,
                americanSurplusFeePercentage: d.americanSurplusFeePercentage ?? 0,
                isFlatFee: d.isFlatFee,
            }));
        };


        const rows = await Promise.all(
            invoices.map(async (inv) => {
                const organization = inv.doneeAccount?.organization as (Organization & OrganizationMailingCompatFields) | undefined;
                if (organization) {
                    await OrganizationAddressService.hydrateCompatMailingOnOrganization(organization);
                }
                const request = inv.request;

                let contactFull = '';
                let contactEmail = '';
                let contactPhone = '';
                if (organization?.id && inv.doneeAccount?.id) {
                    const h = await OrganizationUserService.getOrganizationById(organization.id, undefined, {
                        doneeAccountId: inv.doneeAccount.id,
                    });
                    contactFull = h?.primary_contact_name?.trim() ?? '';
                    contactEmail = h?.primary_contact_email?.trim() ?? '';
                    contactPhone = h?.primary_contact_phone?.trim() ?? '';
                }

                const details = getPropertyDetails(inv);
                const assetLinesJson = JSON.stringify(details);
                const signDetails = getSignDetails(inv);

                return [
                    inv.id,
                    inv.invoice_no,
                    inv.total_amount,
                    inv.total_amount_pennies,
                    inv.american_surplus_amount,
                    inv.american_surplus_amount_pennies,
                    inv.sasp_net_amount,
                    inv.sasp_net_amount_pennies,
                    inv.status,
                    inv?.state?.stateName,
                    inv.doneeAccount ? inv.doneeAccount.name : "",
                    inv.createdAt ? inv.createdAt.toISOString() : "",
                    inv.updatedAt ? inv.updatedAt.toISOString() : "",
                    request?.tcn,
                    organization?.id,
                    organization?.name,
                    contactFull,
                    contactEmail,
                    contactPhone,
                    organization?.mailing_address_line1,
                    organization?.mailing_address_line2,
                    organization?.mailing_city,
                    organization?.mailing_state,
                    organization?.mailing_zip,
                    signDetails?.name,
                    signDetails?.id,
                    assetLinesJson
                ];
            })
        );

        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")),
        ].join("\n");

        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "_"); // today as snake case
        const fileName = `invoices_export_${todayStr}.csv`;
        const filePath = path.join(StoragePaths.propertyData.invoice.export.path, fileName);

        fs.writeFileSync(filePath, csvContent, "utf8");
        logger.info(`Invoice export completed: ${filePath} (${invoices.length} records)`);
        return filePath;
    }

    // Import QBO status and update invoices
    static async importQboStatusFromCsv() {
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "_");
        const importFileName = `invoices_import_${todayStr}.csv`;
        const filePath = path.join(StoragePaths.propertyData.invoice.import.path, importFileName);

        if (!fs.existsSync(filePath)) {
            logger.error(`Import file not found: ${filePath}`);
            return;
        }

        const content = fs.readFileSync(filePath, "utf8");
        const [headerLine, ...lines] = content.split("\n").filter(Boolean);
        const headers = headerLine.split(",").map(h => h.replace(/"/g, "").trim());
        const qboStatusIndex = headers.indexOf("qboStatus");
        const invoiceIdIndex = headers.indexOf("id");
        const errorIndex = headers.indexOf("error");

        if (qboStatusIndex === -1 || invoiceIdIndex === -1) {
            logger.error("CSV missing required columns: qboStatus or id");
            return;
        }

        let updatedCount = 0;

        // Helper to split CSV line into columns, handling quoted fields (including JSON)
        function parseCsvLine(line: string): string[] {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        // Escaped quote
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current);
            return result.map(c => c.trim());
        }

        for (const line of lines) {
            const cols = parseCsvLine(line).map(c => c.replace(/^"|"$/g, "")); // Remove wrapping quotes
            const invoiceId = cols[invoiceIdIndex];
            const qboStatus = cols[qboStatusIndex];
            const error = cols[errorIndex];

            if (!invoiceId) {
                logger.error("invoice id does not exist ");
                continue;
            }

            if (error) {
                logger.error(`'error occured reading csv invoiceId:${invoiceId}, error: ${error}`);
                continue;
            }

            if (!qboStatus) {
                logger.error(`qbo status is missing for invoiceId:${invoiceId}`);
                continue;
            }

            // Update invoice status
            await Invoice.update(
                { status: qboStatus as InvoiceStatus },
                { where: { id: invoiceId } }
            );
            updatedCount++;

            if (qboStatus === InvoiceStatus.PAID) {
                const invoice = await Invoice.findByPk(invoiceId, { include: [{ model: Request, as: 'request' }] });
                if (invoice?.request) {
                    await Request.update(
                        { status: RequestStatusEnum.INVOICE_SIGNED },
                        { where: { id: invoice.request.id } }
                    );
                }
            }

        }

        logger.info(`QBO status import completed: ${updatedCount} invoices updated`);
    }

    static async checkAndUpdatePaymentStatus() {
        const qboInvoiceService = new QBOInvoiceService();

        const invoices = await Invoice.findAll({
            where: {
                status: { [Op.in]: [InvoiceStatus.SIGNED, InvoiceStatus.PAYMENT_REQUESTED] },
            }
        });

        let updatedCount = 0;

        for (const invoice of invoices) {
            try {
                if (!invoice.qbo_ref_id) continue;
                const qboInvoice = await qboInvoiceService.getById(invoice.qbo_ref_id);

                if (qboInvoice.Balance === 0) {
                    await withTransaction(async (transaction) => {
                        await Invoice.update(
                            { status: InvoiceStatus.PAID },
                            { where: { id: invoice.id }, transaction },
                        );
                        await InvoiceActivityLog.create({
                            invoice_id: invoice.id,
                            activity: InvoiceActivity.INVOICE_PAID,
                            metadata: {
                                invoice_no: invoice.invoice_no,
                            },
                            activator: 'Invoice Check Cron Job',
                        }, { transaction });
                        // Update request status if needed
                        const invoiceWithRequest = await Invoice.findByPk(invoice.id, { include: [{ model: Request, as: 'request' }] });
                        if (invoiceWithRequest?.request) {
                            await Request.update(
                                { status: RequestStatusEnum.COMPLETED },
                                { where: { id: invoiceWithRequest.request.id }, transaction }
                            );
                        }

                        updatedCount++;
                        logger.info(`Updated invoice ${invoice.invoice_no} to PAID`);
                    })
                }
            } catch (error) {
                logger.error(`Failed to check payment status for invoice ${invoice.invoice_no}: ${error}`);
            }
        }
        logger.info(`Payment status check completed: ${updatedCount} invoices updated to PAID`);
    }

}

