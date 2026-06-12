import { Op, Transaction } from 'sequelize';
import { getLogger } from '@/utils/logger';
import DisposalCondition from '@/metadata/models/DisposalCondition';
import { PropertyDataService } from '@/ppms/services/propertyData';
import Property from '@/properties/models/Property';
import { PropertyService } from '@/properties/services/property';
import StateAmericanSurplusFees from '@/states/models/StateAmericanSurplusFees.entity';
import StateDisposalFees from '@/states/models/StateDisposalFees';
import { AppError } from '@/utils/response/appError';
import Request from '@/properties/models/Request';
import ejs from 'ejs';
import { PropertyDisposalName } from '@/enums/propertyDisposalCodes.enum';
import InvoiceConfig from '../models/InvoiceConfig.entity';
import { OrganizationAddressService, type OrganizationMailingCompatFields } from '@/organization/services/organizationAddress.service';
import { OrganizationUserService } from '@/organization/services/organizationUser';
const logger = getLogger('InvoiceService');

export class InvoiceService {
    static async createAssetInformation(request: Request, transaction?: Transaction) {
        const allocatedProperties = await Property.findAll({
            where: {
                request_id: request.id,
                property_allocated_date: { [Op.ne]: null },
            },
            transaction,
        });

        if (!allocatedProperties) throw new AppError(400, 'No allocated properties found for this request');

        // Fetch property details with additional data and calculate subtotal accordingly
        const propertyDetails = [];
        for (const property of allocatedProperties) {
            const propertyData = await PropertyDataService.getPropertyDetails(property.property_control_number);

            if (!propertyData) throw new AppError(400, `Could not fetch property data for invoice`);
            const uom = propertyData?.data?.unitOfIssue;

            // Original value in dollars
            const originalValueDollars = Number(property.property_original_value || 0);
            // Convert to pennies (integer)
            const originalValuePennies = originalValueDollars * 100;

            let subTotalPennies = 0;
            let americanSurplusSubTotalPennies = 0;
            let flatFeePennies: number | null = null;
            let stateFeePercentage = 0;
            let americanSurplusFeePercentage = 0;

            const request_created_at = request.createdAt.toISOString().slice(0, 10);

            // special fees for aircrafts
            if (propertyData?.data?.categoryCode === 2) {
                const flatFee = await PropertyService.getFlatFeeIfExist(property.property_control_number);
                if (flatFee && typeof flatFee === 'number') {
                    flatFeePennies = Math.floor(flatFee * 100);
                    subTotalPennies = flatFeePennies;
                    const flatAmericanSurplus = (await PropertyService.getFlatAmericanSurplusFee(property.property_control_number)) as number | null;
                    const flatAmericanSurplusPennies = flatAmericanSurplus ? Math.floor(flatAmericanSurplus * 100) : 0;
                    americanSurplusSubTotalPennies = flatAmericanSurplusPennies;
                }
            }

            if (flatFeePennies == null || flatFeePennies === 0) {
                const disposalConditionCode = property.property_disposal_condition as string;
                const disposalCondition = await DisposalCondition.findOne({ where: { code: disposalConditionCode } });
                if (!disposalCondition) throw new AppError(400, `Disposal Condition is missing`);

                const stateId = request.doneeAccount?.stateId;
                const stateDisposalFee = await StateDisposalFees.findOne({
                    where: {
                        disposalConditionId: disposalCondition?.id,
                        stateId,
                        effective_date: { [Op.lte]: request_created_at },
                    },
                    order: [['effective_date', 'DESC']],
                });

                const stateAmericanSurplusFee = await StateAmericanSurplusFees.findOne({
                    where: {
                        disposal_condition_id: disposalCondition?.id,
                        state_id: stateId,
                        effective_date: { [Op.lte]: request_created_at },
                    },
                    order: [['effective_date', 'DESC']],
                });

                // prior 15 sep American Surplus fees can be 0
                if (!stateDisposalFee || stateAmericanSurplusFee === null || stateAmericanSurplusFee === undefined) throw new AppError(400, `State Disposal Fee is missing`);

                stateFeePercentage = stateDisposalFee?.fee;
                americanSurplusFeePercentage = stateAmericanSurplusFee?.fee;

                // Donee Cost Minimization and State Margin Preference 
                subTotalPennies = originalValuePennies * (stateFeePercentage / 100);
                americanSurplusSubTotalPennies = originalValuePennies * (americanSurplusFeePercentage / 100);
            }

            // Use property_name exclusively for description; if missing, fall back to the ICN (assetId). Avoid using property_description.
            const name = (property.property_name || '').trim();
            const safeDescription = name || property.property_control_number;
            // Truncate the description to 40 characters.
            const truncatedDescription = safeDescription.length > 40 ? safeDescription.substring(0, 40) + '...' : safeDescription;

            let lineTotalPennies = Math.floor(property.property_allocated_quantity * subTotalPennies);
            let americanSurplusLineTotalPennies = Math.floor(property.property_allocated_quantity * americanSurplusSubTotalPennies);
            const lineTotalPenniesWithoutRounding = property.property_allocated_quantity * subTotalPennies;

            //Non-Negative Safeguard
            if (lineTotalPennies < 0 || americanSurplusLineTotalPennies < 0) throw new AppError(400, `Sum can not be lower than zero`, ` ICN: ${property.property_control_number}`);

            propertyDetails.push({
                assetId: property.property_control_number,
                description: this.convertTextToHtml(truncatedDescription),
                disposalCode: property.property_disposal_condition,
                disposalName: PropertyDisposalName[property.property_disposal_condition as keyof typeof PropertyDisposalName],
                quantity: property.property_allocated_quantity,
                uom,
                original_value: originalValueDollars,
                subTotal: subTotalPennies / 100,
                subTotal_pennies: subTotalPennies,
                americanSurplusSubTotal: americanSurplusSubTotalPennies / 100,
                americanSurplusSubTotal_pennies: americanSurplusSubTotalPennies,
                // line totals
                lineTotal: lineTotalPennies / 100,
                lineTotalPenniesWithoutRounding: lineTotalPenniesWithoutRounding,
                lineTotal_pennies: lineTotalPennies,
                americanSurplusLineTotal: americanSurplusLineTotalPennies / 100,
                americanSurplusLineTotal_pennies: americanSurplusLineTotalPennies,
                stateFeePercentage: stateFeePercentage ?? undefined,
                americanSurplusFeePercentage: americanSurplusFeePercentage ?? undefined,
                isFlatFee: flatFeePennies ? true : false,
            });
        }

        let total_pennies = propertyDetails.reduce((sum, item) => sum + (item.lineTotal_pennies || 0), 0);
        const americanSurplusTotal_pennies = propertyDetails.reduce((sum, item) => sum + (item.americanSurplusLineTotal_pennies || 0), 0);
        const total_pennies_without_rounding = propertyDetails.reduce((sum, item) => sum + (item.lineTotalPenniesWithoutRounding || 0), 0);

        const deliveryFee_pennies = 0;
        let charge_adjustment_pennies = 0;

        //guard for scamming delta must be lower than one dollar.
        if (total_pennies_without_rounding - total_pennies > 100) throw new AppError(400, `Invoice can not be generated please reach out to support.`, ` requestId: ${request.id} 1 dollars invoice issue`);

        // ----- MINUMUM CHARGE ADJUSTMENT REQUIRES APPROVAL -------------
        // if (total_pennies < 100 && total_pennies_without_rounding < 100) {
        //     charge_adjustment_pennies = 100 - total_pennies;
        //     total_pennies = 100;
        // }

        return {
            propertyDetails,
            total: total_pennies / 100,
            americanSurplusTotal: americanSurplusTotal_pennies / 100,
            deliveryFee: deliveryFee_pennies / 100,
            total_pennies,
            americanSurplusTotal_pennies,
            deliveryFee_pennies,
            // charge_adjustment_pennies,
            // charge_adjustment_total: charge_adjustment_pennies / 100
        };
    }

    /**
  * Generates an invoice number based on stateId and serie using the InvoiceConfig table.
  * @param stateId - The state ID for which to generate the invoice number.
  * @param serie - The invoice series.
  * @returns Promise<string> - The generated invoice number.
  */
    static async invoiceNoGenerator(stateId: number, serie: string, transaction?: Transaction): Promise<string> {
        const invoiceConfig = await InvoiceConfig.findOne({ where: { state_id: stateId, series: serie } });
        if (!invoiceConfig) throw new AppError(404, `Invoice configuration not found for stateId: ${stateId} and serie: ${serie}`);

        const currentNumber = invoiceConfig.current_number;
        const digit = invoiceConfig.total_digit;

        const nextNumber = currentNumber + 1;
        await invoiceConfig.update({ current_number: nextNumber }, { transaction });

        // returning serie and padding number as invoice no
        return `${serie}-${nextNumber.toString().padStart(digit, '0')}`;
    }

    /**
     * Generates a display name for the invoice.
     * @param date - The invoice date in YYYY-MM-DD format.
     * @param tcn - The TCN string from the request.
     * @param invoiceNo - The generated invoice number.
     * @returns The formatted invoice display name.
     */
    static invoiceDisplayNameGenerator(date: string, tcn: string | null | undefined, invoiceNo: string): string {
        const tcnParts = tcn?.split('-') || [];
        const tcnLastPart = tcnParts.length > 0 ? tcnParts[tcnParts.length - 1] : '';
        return `IN-${date}-${tcnLastPart}-${invoiceNo}`;
    }

    static getBankInformationForInvoice() {
        //discussion should we save them into database ? I dont think if that necessary thing since we are going to move with bank entegration
        return {
            remitCheckPayments: {
                name: 'American Surplus LLC',
                adress1: '123 Main St',
                adress2: 'Anytown, USA, 12345',
                telephone: '(123) 456-7890',
            },
            achPayments: {
                bank: 'Halid Gokalp Bank',
                adress1: '123 Main St',
                adress2: 'Anytown, USA, 12345',
                accountTitle: 'AMERICAN SURPLUS LLC',
                accountTitle2: 'DBA Halid Gokalp Bank',
                account: '1234567890',
                routingNo: '124567890',
            },
        };
    }

    static async getDoneeInformationForInvoice(request: Request, transaction?: Transaction) {
        const org = request.doneeAccount?.organization;
        if (org) await OrganizationAddressService.hydrateCompatMailingOnOrganization(org, transaction);

        const o = org as (typeof org & OrganizationMailingCompatFields) | undefined;
        const orgId = request.doneeAccount?.organizationId ?? org?.id;
        const doneeId = request.doneeAccount?.id;
        let telephone = '';
        if (orgId != null && doneeId != null) {
            const hydrated = await OrganizationUserService.getOrganizationById(String(orgId), transaction, { doneeAccountId: doneeId, });
            telephone = hydrated?.primary_contact_phone?.trim() ?? hydrated?.head_authorized_official_phone?.trim() ?? '';
        }
        return {
            accountNo: request.doneeAccount?.name,
            representative: request.doneeAccount?.organization?.name,
            telephone,
            address: o?.mailing_address_line1,
            city: o?.mailing_city,
            state: o?.mailing_state,
            zipCode: o?.mailing_zip,
        };
    }

    private static convertTextToHtml(text: string | null | undefined): string {
        if (!text) return '';

        try {
            // Use EJS to parse the content, treating it as a template
            const ejsContent = `<%- ${JSON.stringify(text)} %>`;
            const parsedContent = ejs.render(ejsContent, {});

            // Convert line breaks to HTML breaks
            return parsedContent;
        } catch (error) {
            // Fallback to simple line break conversion if EJS parsing fails
            return text;
        }
    }

}
