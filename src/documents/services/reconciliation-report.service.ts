import fs from "fs";
import path from "path";
import { Op } from "sequelize";
import { getLogger } from "@/utils/logger";
import ReconciliationReport from "@/documents/models/ReconciliationReport.entity";
import Invoice, { InvoiceStatus } from "@/documents/models/Invoice.entity";
import State from "@/states/models/State";
import { StoragePaths } from "@/utils/storage/paths";
import DocumentFactory, { DocumentActionType } from "./document-factory.service";
import envvars from '@/config/envvars';
import { renderEmail } from '@/utils/mail/render';
import { emailQueue } from '@/utils/mail/emailQueue';
import DoneeAccount from "@/organization/models/DoneeAccount";
import Organization from "@/organization/models/Organization";
import Request from "@/properties/models/Request";
import { OrganizationUserService } from "@/organization/services/organizationUser";
import { TemplateEnum } from "@/enums/mailEnum";

const logger = getLogger("ReconciliationReportService");

export class ReconciliationReportService {
    static async generateMonthlyReport() {
        const now = new Date();
        // Calculate period: 16th of last month to 15th of this month
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        // period_end is 14th of current month
        const period_end = `${year}_${month < 10 ? "0" + month : month}_14`;
        const lastMonth = month === 1 ? 12 : month - 1;
        const lastYear = month === 1 ? year - 1 : year;
        // period_start is 15th of last month
        const period_start = `${lastYear}_${lastMonth < 10 ? "0" + lastMonth : lastMonth}_15`;

        // Start date: 15th of last month 00:00:00.000
        const startDate = new Date(`${lastYear}-${lastMonth < 10 ? "0" + lastMonth : lastMonth}-15T00:00:00.000Z`);
        // End date: 14th of this month 23:59:59.999 UTC
        const endDate = new Date(`${year}-${month < 10 ? "0" + month : month}-14T23:59:59.999Z`);

        const states = await State.findAll();
        for (const state of states) {
            const invoices = await Invoice.findAll({
                where: {
                    state_id: state.stateId,
                    status: InvoiceStatus.PAID,
                    updatedAt: {
                        [Op.gte]: startDate,
                        [Op.lte]: endDate,
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

            // Calculate all amounts in pennies
            function toPennies(amount: number): number {
                if (amount === null || amount === undefined || isNaN(amount)) return 0;
                return Math.floor(amount * 100);
            }

            const monthly_sasp_net_fees_pennies = invoices.reduce((sum, inv) => {
                const pennies = (inv as any).sasp_net_amount_pennies ?? toPennies(Number(inv.sasp_net_amount || 0));
                return sum + pennies;
            }, 0);
            const monthly_american_surplus_net_fees_pennies = invoices.reduce((sum, inv) => {
                const pennies = (inv as any).american_surplus_amount_pennies ?? toPennies(Number(inv.american_surplus_amount || 0));
                return sum + pennies;
            }, 0);
            const total_monthly_fees_pennies = invoices.reduce((sum, inv) => {
                const pennies = (inv as any).total_amount_pennies ?? toPennies(Number(inv.total_amount || 0));
                return sum + pennies;
            }, 0);

            // Generate Excel file (simple CSV for now)
            const reportFileName = `reconciliation_report_${state.stateCode}_${period_start}_to_${period_end}.csv`;
            const reportPath = path.join(StoragePaths.propertyData.invoice.reconciliation.path, reportFileName);

            // Use same headers as invoice export, amounts in dollars for rows
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
                "doneeAccount_number",
                "invoice_createdAt",
                "invoice_updatedAt",
                "tcn",
                "organization_id",
                "organization_name",
                "organization_contact_full_name",
                "organization_contact_email",
                "organization_contact_phone",
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
                return (details ?? []).map((d: any) => ({
                    assetId: d.assetId,
                    description: d.description,
                    disposalCode: d.disposalCode,
                    quantity: d.quantity,
                    uom: d.uom,
                    subTotal: d.subTotal,
                    subTotal_pennies: d.subTotal_pennies,
                    americanSurplusSubTotal: d.americanSurplusSubTotal,
                    americanSurplusSubTotal_pennies: d.americanSurplusSubTotal_pennies,
                    lineTotal: d.lineTotal,
                    lineTotal_pennies: d.lineTotal_pennies,
                    americanSurplusLineTotal: d.americanSurplusLineTotal,
                    americanSurplusLineTotal_pennies: d.americanSurplusLineTotal_pennies,
                    stateFeePercentage: d.stateFeePercentage,
                    americanSurplusFeePercentage: d.americanSurplusFeePercentage ?? 0,
                    isFlatFee: d.isFlatFee,
                }));
            };

            const rows = await Promise.all(
                invoices.map(async (inv) => {
                    const organization = inv.doneeAccount?.organization;
                    const request = inv.request;
                    const details = getPropertyDetails(inv);
                    const assetLinesJson = JSON.stringify(details);
                    const signDetails = getSignDetails(inv);

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

                    return [
                        inv.id,
                        inv.invoice_no,
                        inv.total_amount === 0 ? inv.total_amount_pennies / 100 : inv.total_amount,
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
                        signDetails?.name,
                        signDetails?.id,
                        assetLinesJson
                    ];
                })
            );

            let csvContent = [headers.join(","), ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

            // Append summary section at the bottom (in pennies)
            csvContent += "\n\nSummary Calculations";
            csvContent += `\nMonthly SASP Net Fees in pennies,${monthly_sasp_net_fees_pennies}`;
            csvContent += `\nMonthly American Surplus Net Fees in pennies,${monthly_american_surplus_net_fees_pennies}`;
            csvContent += `\nTotal Monthly Fees in pennies,${total_monthly_fees_pennies}`;

            fs.writeFileSync(reportPath, csvContent, "utf8");


            // Generate agreement PDF using DocumentFactory
            const agreementFileName = `reconciliation_agreement_${state.stateCode}_${period_start}_to_${period_end}.pdf`;
            const agreementPath = StoragePaths.propertyData.invoice.reconciliation.path;
            const agreementPayload = {
                reportPeriod: `${period_start} to ${period_end}`,
                stateName: state.stateName,
                outputPath: agreementPath,
                monthlySaspNetFees: monthly_sasp_net_fees_pennies,
                monthlyAmericanSurplusNetFees: monthly_american_surplus_net_fees_pennies,
                totalMonthlyFees: total_monthly_fees_pennies,
                agreementFileName
            };

            const agreementFilePath = await DocumentFactory.handler(DocumentActionType.GENERATE_RECONCILIATION_AGREEMENT, agreementPayload);
            await ReconciliationReport.create({
                state_id: state.stateId,
                period_start,
                period_end,
                monthly_sasp_net_fees_pennies,
                monthly_american_surplus_net_fees_pennies,
                total_monthly_fees_pennies,
                report_path: reportPath,
                agreement_path: agreementFilePath as string,
            });

            logger.info(`Reconciliation report created for state ${state.stateName}: ${reportPath}, ${agreementPath}`);

            const toEmail = envvars.reconcialition.send_report_email;
            const renderData = {
                templateName: TemplateEnum.Reconciliation_Report,
                data: {
                    reportPeriod: agreementPayload.reportPeriod,
                    stateName: agreementPayload.stateName,
                    monthlySaspNetFees: agreementPayload.monthlySaspNetFees,
                    monthlyAmericanSurplusNetFees: agreementPayload.monthlyAmericanSurplusNetFees,
                    totalMonthlyFees: agreementPayload.totalMonthlyFees,
                }
            };
            const mailContent = await renderEmail(renderData);
            const mailData = {
                to: toEmail,
                subject: `Monthly Reconciliation Report: ${state.stateName} (${agreementPayload.reportPeriod})`,
                html: mailContent,
                attachments: [
                    {
                        filename: reportFileName,
                        content: fs.readFileSync(path.join(StoragePaths.propertyData.invoice.reconciliation.path, reportFileName)),
                        contentType: "text/csv"
                    },
                    {
                        filename: agreementFileName,
                        content: fs.readFileSync(path.join(StoragePaths.propertyData.invoice.reconciliation.path, agreementFileName)),
                        contentType: "application/pdf"
                    }
                ]
            };
            await emailQueue.add("reconciliationReportNotification", mailData, { removeOnComplete: true, attempts: 3 });
        }
    }
}
