import fs from "fs/promises";
import { PDFDocument, PDFForm } from "pdf-lib";
import sharp from "sharp";

import User from "@/authn/models/User";
import Property from "@/properties/models/Property";
import Request from "@/properties/models/Request";
import Organization from "@/organization/models/Organization";

import { PropertyContact, PropertyDetails, PropertyLocation } from "@/ppms/types/propertyDetails";

import { AppError } from "@/utils/response/appError";
import { StoragePaths } from "@/utils/storage/paths";
import { formatPhoneNumber } from "@/utils/phoneNumber";
import RequestAttachment from "@/properties/models/RequestAttachment";
import UserScope from "@/authz/models/UserScope";
import { OrganizationAddressService, type OrganizationMailingCompatFields } from "@/organization/services/organizationAddress.service";

/**
 * 
 * @param authenticatedUser - The authenticated user requesting the LOAR.
 * @param request - The request object containing the request data.
 * @param properties - An array of properties associated with the request.
 * @param propertyDetails - An array of property details associated with the properties.
 * @returns 
 */
export async function generatePdf(
    authenticatedUser: User,
    request: Request,
    properties: Property[],
    propertyDetails: PropertyDetails[],
    attachmentDate: Date,
    shippingdetails?: {
        shippingName: string
        loarAttachment: RequestAttachment
    }
): Promise<Buffer> {
    try {
        if (!request.tcn) {
            throw new AppError(400, "TCN is required to generate LOAR");
        }

        const shippingName = shippingdetails?.shippingName;
        const loarAttachment = shippingdetails?.loarAttachment;

        let signatureUser = authenticatedUser;
        let signatureDate = attachmentDate;
        if (loarAttachment?.created_by) {
            signatureUser = await User.findByPk(loarAttachment.created_by) as User;
            if (!signatureUser) throw new AppError(400, "Can not find signature user");
        }

        const loarTemplatePath = StoragePaths.private.system.loarTemplateFile.path;
        const loarPdfData = await fs.readFile(loarTemplatePath);

        const propertiesChunkSize = 10;
        const propertyChunks = chunkArray(properties, propertiesChunkSize);

        // Create a single output PDF document
        const outputPdfDoc = await PDFDocument.create();

        for (const chunk of propertyChunks) {
            const templateLoarDoc = await PDFDocument.load(loarPdfData);
            const pdfForm = templateLoarDoc.getForm();

            // Fill fields with data for this chunk
            // Pass shippingName to determine if date should be added
            await fillPdfFields(
                pdfForm,
                signatureUser,
                request,
                chunk,
                propertyDetails,
                shippingName ? signatureDate : undefined // Only pass date if shipping name exists
            );

            // Only embed signature if shipping name is provided
            if (shippingName) {
                const userName = signatureUser.name;
                const stateName = request?.doneeAccount?.state?.stateName;
                await embedSignature(templateLoarDoc, userName, signatureDate, stateName);
            }

            if (shippingName) {
                const shippingNameField = pdfForm.getTextField('PRINT NAME OF PERSON OR TRANSPORTATION COMPANY');
                shippingNameField.setText(shippingName);
            }

            // Flatten form to "burn in" the values
            pdfForm.flatten();

            // Copy the filled-out and flattened page(s) to the output document
            const [filledPage] = await outputPdfDoc.copyPages(templateLoarDoc, [0]);
            outputPdfDoc.addPage(filledPage);
        }

        const pdfBytes = await outputPdfDoc.save();
        return Buffer.from(pdfBytes);
    } catch (err: any) {
        throw new AppError(500, "Failed to generate LOAR PDF", err);
    }
}

/**
 * Updates the shipping information for an existing LOAR PDF.
 * @param loarFilePath - A Buffer containing the LOAR template PDF.
 * @param shippingName - The updated shipping name.
 * @returns A Buffer containing the updated LOAR PDF.
 */
export async function updateLoarShipping(user: User, request: Request, properties: Property[], propertyDetails: PropertyDetails[], shippingName: string, loarAttachment: RequestAttachment): Promise<Buffer> {
    try {
        // Use current time for signature when shipping name is added
        const currentTime = new Date();
        return generatePdf(user, request, properties, propertyDetails, currentTime, { shippingName, loarAttachment });
    } catch (err) {
        throw new AppError(500, "Failed to update LOAR shipping information");
    }
}

export async function flattenPdf(loarFilePath: string): Promise<Buffer> {
    // Load the existing LOAR template
    const loarPdfData = await fs.readFile(loarFilePath);
    const pdfDoc = await PDFDocument.load(loarPdfData);
    const form = pdfDoc.getForm();

    // Flatten the form to make the fields non-editable
    form.flatten();

    // Serialize the updated PDF and return it as a Buffer
    const updatedPdfBytes = await pdfDoc.save();
    return Buffer.from(updatedPdfBytes);
}

/**
 * Splits an array into chunks of a specified size.
 * @param array - The array to be split into chunks.
 * @param chunkSize - The size of each chunk.
 * @returns An array of arrays, where each inner array is a chunk of the original array.
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize));
    }
    return result;
}

/**
* Embed the signature into the PDF.
*/
async function embedSignature(pdfDoc: PDFDocument, userName: string, dateOverride?: Date, stateName?: string): Promise<void> {
    const form = pdfDoc.getForm();
    form.getTextField('SIGNATURE OF CUSTOMER').setText(userName);

    const signatureTimestampField = form.getTextField('SIGNATURE TIMESTAMP');
    const signatureTimestampText = `Digitally signed by ${userName}\n${stateName ? `${stateName} SASP` : ''}\nDate: ${formatSignatureTimestamp(dateOverride || new Date())}`;
    signatureTimestampField.setText(signatureTimestampText);
}

/**
 * Fill PDF form fields with the required data.
 */
async function fillPdfFields(
    form: PDFForm,
    authenticatedUser: User,
    request: Request,
    properties: Property[],
    propertyDetails: PropertyDetails[],
    dateOverride?: Date
): Promise<void> {
    if (!request || !properties || !propertyDetails) {
        throw new AppError(400, "Request and properties are required to fill the PDF");
    }

    const propertySample = properties[0];
    const samplePropertyDetails = propertyDetails.find((propertyDetail) => propertyDetail.data.itemControlNumber === propertySample.property_control_number);

    if (!samplePropertyDetails) throw new AppError(400, "Property details not found for the sample property");

    // Only set date if dateOverride is provided (i.e., when shipping name exists)
    if (dateOverride) {
        const date = dateOverride.toLocaleDateString('en-US', { timeZone: 'UTC' });
        form.getTextField('DATE').setText(date);
    }

    setToField(samplePropertyDetails, form);

    const doneeHeadAuthorizedRepScope = await UserScope.findOne({
        where: { donee_account_id: request.doneeAccount?.id, is_head_representative: true }
    });

    const user = await User.findByPk(doneeHeadAuthorizedRepScope?.user_id) as User;
    if (!user) throw new AppError(400, "Can not able to fetch head authorized officaial");
    if (request.doneeAccount?.organization) await OrganizationAddressService.hydrateCompatMailingOnOrganization(request.doneeAccount.organization);

    setFromField(request, user, form);

    form.getTextField('PRINT NAME').setText(authenticatedUser.name);
    const tcnField = form.getTextField('GSA #');
    tcnField.setFontSize(8);
    tcnField.setText(request.tcn || '');

    const pocEmail = samplePropertyDetails.data.propertyPOC.email?.toString();
    const pocFax = samplePropertyDetails.data.propertyPOC.fax?.toString();
    const emailOrFax = pocEmail || pocFax;
    form.getTextField('EMAIL OR FAX').setText(emailOrFax || '');

    const pocPhoneNumber = samplePropertyDetails.data.propertyPOC.phone?.toString();
    const formattedPocPhoneNumber = formatPhoneNumber(pocPhoneNumber, "US", false);
    form.getTextField('PHONE NUMBER').setText(formattedPocPhoneNumber || '');

    // Fill properties list
    const propertiesList = generatePropertiesList(properties, propertyDetails);
    form.getTextField('LIST ITEMS').setText(propertiesList);
}

function setToField(samplePropertyDetails: PropertyDetails, form: PDFForm) {
    const address = formatAddress(samplePropertyDetails.data.reportingAgencyAddress);
    const contactInfo = formatContactInfo(samplePropertyDetails.data.propertyPOC);
    const toTextField = form.getTextField('TO');
    toTextField.setFontSize(8);
    toTextField.setText(`${address}\n${contactInfo}`);
}

function setFromField(request: Request, user: User, form: PDFForm) {
    const state = request.doneeAccount?.state;
    const email = user.email.toUpperCase() || '';
    const phone = state?.phone || '';
    const formattedPhone = formatPhoneNumber(phone, "US", false);

    const org = request.doneeAccount?.organization as (Organization & OrganizationMailingCompatFields) | undefined;

    const fromTextField = form.getTextField('FROM');
    fromTextField.setFontSize(8);
    const addressLines = [
        org?.mailing_address_line1,
        org?.mailing_address_line2
    ].filter(Boolean).join('\n');

    fromTextField.setText(
        `FOR DONEE: ${request.doneeAccount?.name} ${org?.name ? `- ${org.name}` : ''}\n` +
        (addressLines ? `${addressLines}\n` : '') +
        `${org?.mailing_city}, ${org?.mailing_state} ${org?.mailing_zip}\n` +
        `POC: ${user.name}\n` +
        `PHONE: ${formattedPhone}\n` +
        `EMAIL: ${email}\n`
    );
}

/**
 * Format the address from the agency address object.
 */
function formatAddress(reportingAgencyAddress: PropertyLocation): string {
    const line1 = reportingAgencyAddress.line1 || '';
    const line2 = reportingAgencyAddress.line2 || '';
    const line3 = reportingAgencyAddress.line3 || '';
    const city = reportingAgencyAddress.city || '';
    const stateCode = reportingAgencyAddress.stateCode || '';
    const zip = reportingAgencyAddress.zip || '';
    const addressLineThree = line3 ? line3 + ',' : '';
    return `${line1},\n${line2},\n${addressLineThree}\n${city}, ${stateCode} ${zip},`;
}

/**
 * Format the contact info for the property POC.
 */
function formatContactInfo(propertyContact: PropertyContact): string {
    const faxNumber = propertyContact.fax?.toString();
    const formattedFaxNumber = formatPhoneNumber(faxNumber, "US", false);
    const faxString = formattedFaxNumber ? `Fax: ${formattedFaxNumber}` : '';

    const phoneNumber = propertyContact.phone?.toString();
    const formattedPhoneNumber = formatPhoneNumber(phoneNumber, "US", false);
    const phoneString = formattedPhoneNumber ? `Phone: ${formattedPhoneNumber}` : '';

    return `${phoneString}, ${faxString}`;
}

/**
 * Generate the properties list to be inserted in the PDF.
 */
function generatePropertiesList(properties: Property[], propertyDetails: PropertyDetails[]): string {
    let propertiesList = '';
    const orderedProperties = properties.sort((a, b) => a.property_control_number.localeCompare(b.property_control_number));

    const fscCodes = propertyDetails.reduce((acc, propertyDetail) => {
        const icn = propertyDetail.data.itemControlNumber;
        const fscCode = propertyDetail.data.fscCode || 'N/A';
        acc[icn] = fscCode;
        return acc;
    }, {} as Record<string, string>);

    for (const property of orderedProperties) {
        const propertyControlNumber = property.property_control_number;
        const propertyName = property.property_name;
        const disposalCondition = property.property_disposal_condition;
        const fscCode = fscCodes[propertyControlNumber] || 'N/A';

        propertiesList += `${propertyControlNumber} ${propertyName} FSC: ${fscCode}, ${disposalCondition} QTY ${property.property_allocated_quantity}\n`;
    }

    return propertiesList;
}

function formatSignatureTimestamp(date: Date): string {
    const pad = (num: number) => (num < 10 ? '0' + num : num);
    // Use UTC methods to ensure consistent UTC timestamps
    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hours = pad(date.getUTCHours());
    const minutes = pad(date.getUTCMinutes());
    const seconds = pad(date.getUTCSeconds());

    // Always use +0000 for UTC timezone
    const formattedTimestamp = `${year}.${month}.${day} ${hours}:${minutes}:${seconds} +0000`;
    return formattedTimestamp;
}