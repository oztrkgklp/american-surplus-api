import ejs from 'ejs';
import puppeteer from 'puppeteer';
import { IDocumentPayloadMap } from "../interfaces/DocumentPayload.interface";
import { getLogger } from '@/utils/logger';
const logger = getLogger('DocumentFactory');
import Request from '@/properties/models/Request';
import Property from "@/properties/models/Property";
import { Transaction, Op } from "sequelize";
import { AppError } from "@/utils/response/appError";
import { IDocumentRenderOptions } from "../interfaces/DocumentOptions.interface";
import path from "path";
import { DocumentTemplateEnum } from '../enums/DocumentTemplate.enum';
import { StoragePaths } from '@/utils/storage/paths';
import { saveUploadedFile } from '@/utils/storage/fileSystem';
import User from '@/authn/models/User';
import { RequestAttachmentService } from '@/properties/services/requestAttachment';
import { RequestAttachmentTypeEnum } from '@/properties/enums/requestAttachmentTypes';
import fs from 'fs';
import { PropertyDataService } from '@/ppms/services/propertyData';
import { PropertyService } from '@/properties/services/property';
import {
  firstSf97EligibleAllocatedProperty,
  isSf97EligibleProperty,
  requestHasSf97EligibleProperty,
  type Sf97EligibleAllocatedProperty,
} from '@/utils/sf97-eligible-fsc';
import State from '@/states/models/State';
import InvoiceConfig from '../models/InvoiceConfig.entity';
import Invoice, { InvoiceStatus } from '@/documents/models/Invoice.entity';
import UserScope from '@/authz/models/UserScope';
import InvoiceActivityLog, { InvoiceActivity } from '@/documents/models/InvoiceActivityLogs.entity';
import { DoneeAccountService } from '@/organization/services/donee';
import { PredefinedRoles } from '@/enums/predefinedRoles.enum';
import OrganizationUser from '@/organization/models/OrganizationUser';
import { OrganizationUserService } from '@/organization/services/organizationUser';
import Role from '@/authz/models/Role';
import Application from '@/eligibility/models/Application.entity';
import ApplicationForm from '@/eligibility/models/ApplicationForm.entity';
import Form from '@/eligibility/models/Form.entity';
import DoneeAccount from '@/organization/models/DoneeAccount';
import ApplicationAttachment from '@/eligibility/models/ApplicationAttachment.entity';
import { EligibilityService } from '@/eligibility/services/eligibility.service';
import { EligibilityApplicationStatuses } from '@/enums/eligibilityStatus.enum';
import {
  coalesceOrganizationalIdentityField,
  formatEligibilityDocDate,
  formatEligibilitySubmittedDateMmDdYyyy,
  formatOrganizationalIdentityPhonesForPdf,
  formatTinEinEligibilityPdf,
  formatUsPhoneDisplay,
  mapAuthorizedRepresentativePhonesForPdf,
  normalizeStateAddressLine2,
  organizationTableFieldsForEligibilityPdf,
  type OrganizationPdfTableSource,
} from '@/eligibility/utils/eligibilityDocumentFormat';
import LogisticsPacket, { LogisticsPacketStatus } from '../models/LogisticsPacket.entity';
import Sf97Packet, { Sf97PacketStatus } from '../models/Sf97Packet.entity';
import RequestAttachment from '@/properties/models/RequestAttachment';
import { ScopeType } from '@/enums/scope.enum';
import NotificationFactory, { NotificationType } from '@/notifications/services/notification-factory.service';
import { InvoiceService } from './invoice.service';
import { RequestStatusEnum } from '@/enums/request-property-status.enum';
import { QBOInvoiceService } from '@/qbo/invoice/invoice.service';
import envvars from '@/config/envvars';
import Scope from '@/authz/models/Scope';
import { IUserCorperate } from '@/authz/interfaces/IUserScope';
import { OrganizationAddressType } from '@/enums/organizationAddressType.enum';
import { OrganizationAddressService } from '@/organization/services/organizationAddress.service';
import SaspUser from '@/sasp/models/SaspUsers.entity';

export enum DocumentActionType {
  GENERATE_INVOICE = 'GenerateInvoice',
  SIGN_INVOICE = 'SignInvoice',
  GENERATE_ELIGIBILITY_APPLICATION = 'GenerateEligibilityApplication',
  SIGN_ELIGIBILITY_APPLICATION = 'SignEligibilityApplication',
  GENERATE_LOGISTICS_PACKET = 'GenerateLogisticsPacket',
  SIGN_LOGISTICS_PACKET = 'SignLogisticsPacket',
  GENERATE_SF97 = 'GenerateSf97',
  SIGN_SF97 = 'SignSf97',
  GENERATE_LOAR = 'GENERATE_LOAR',
  UPDATE_LOAR_SHIPPING = 'UPDATE_LOAR_SHIPPING',
  GENERATE_RECONCILIATION_AGREEMENT = 'GENERATE_RECONCILIATION_AGREEMENT',
  GENERATE_3040_REPORTING = 'GENERATE_3040_REPORTING'
}

export default class DocumentFactory {
  /** Narrow `getOrganizationById` JSON to PDF table fields (no inline type imports). */
  private static asOrganizationPdfTableSource(organization: object,): OrganizationPdfTableSource {
    return organization as OrganizationPdfTableSource;
  }

  /**
   * Handles document related operations
   * @param action The type of action.
   * @param payload The data required to perform the action.
   */
  static async handler<T extends DocumentActionType>(action: T, payload: IDocumentPayloadMap[T], transaction?: Transaction) {
    switch (action) {
      case DocumentActionType.GENERATE_INVOICE:
        return this.generateInvoice(payload as IDocumentPayloadMap[DocumentActionType.GENERATE_INVOICE], transaction);
      case DocumentActionType.SIGN_INVOICE:
        return this.signInvoice(payload as IDocumentPayloadMap[DocumentActionType.SIGN_INVOICE], transaction);
      case DocumentActionType.GENERATE_ELIGIBILITY_APPLICATION:
        return this.generateEligibilityApplication(payload as IDocumentPayloadMap[DocumentActionType.GENERATE_ELIGIBILITY_APPLICATION], transaction);
      case DocumentActionType.SIGN_ELIGIBILITY_APPLICATION:
        return this.signEligibilityApplication(payload as IDocumentPayloadMap[DocumentActionType.SIGN_ELIGIBILITY_APPLICATION], transaction);
      case DocumentActionType.GENERATE_LOGISTICS_PACKET:
        return this.generateLogisticsPacket(payload as IDocumentPayloadMap[DocumentActionType.GENERATE_LOGISTICS_PACKET], transaction);
      case DocumentActionType.SIGN_LOGISTICS_PACKET:
        return this.signLogisticsPacket(payload as IDocumentPayloadMap[DocumentActionType.SIGN_LOGISTICS_PACKET], transaction);
      case DocumentActionType.GENERATE_SF97:
        return this.generateSf97Document(payload as IDocumentPayloadMap[DocumentActionType.GENERATE_SF97], transaction);
      case DocumentActionType.SIGN_SF97:
        return this.signSf97Document(payload as IDocumentPayloadMap[DocumentActionType.SIGN_SF97], transaction);
      case DocumentActionType.GENERATE_LOAR:
        return this.generateLOAR(payload as IDocumentPayloadMap[DocumentActionType.GENERATE_LOAR], transaction);
      case DocumentActionType.UPDATE_LOAR_SHIPPING:
        return this.updateLOARShipping(payload as IDocumentPayloadMap[DocumentActionType.UPDATE_LOAR_SHIPPING], transaction);
      case DocumentActionType.GENERATE_RECONCILIATION_AGREEMENT:
        return this.generateReconciliationAgreement(payload as IDocumentPayloadMap[DocumentActionType.GENERATE_RECONCILIATION_AGREEMENT], transaction);
      case DocumentActionType.GENERATE_3040_REPORTING:
        return this.generate3040Reporting(payload as IDocumentPayloadMap[DocumentActionType.GENERATE_3040_REPORTING], transaction);
      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }

  private static async generateInvoice(payload: { request: Request; createdBy: User; invoiceSerie?: string }, transaction?: Transaction) {
    logger.log('request', payload.request);
    const { request, invoiceSerie } = payload;
    if (!request.tcn) throw new AppError(400, 'Request TCN is required to generate invoice');
    if (!invoiceSerie) throw new AppError(400, 'Invoice serie is required');

    const allowedStatuses = [RequestStatusEnum.INVOICE_REQUIRED, RequestStatusEnum.INVOICE_SIGNATURE_REQUIRED, RequestStatusEnum.INVOICE_SIGNED] as string[];
    if (!allowedStatuses.includes(request.status)) throw new AppError(400, 'Pickup process in not completed, invoice can be created after pickup process');

    const requestId = request.id;
    const yyyy_mm_dd = new Date().toISOString().slice(0, 10);
    const invoiceNo = await InvoiceService.invoiceNoGenerator(request.doneeAccount?.stateId as number, invoiceSerie, transaction);
    const displayName = InvoiceService.invoiceDisplayNameGenerator(yyyy_mm_dd, request.tcn, invoiceNo);

    // Guard 1: LOAR/SF123 must be exist before generating an invoice
    const loarAttachmentCheck = await RequestAttachmentService.getAttachment({ request_id: requestId, attachment_type: RequestAttachmentTypeEnum.LOAR });
    if (!loarAttachmentCheck) throw new AppError(400, 'LOAR and SF-123 must be exist before generating invoice');

    // Guard 2: there must be no existing PAID invoice for the same series
    const priorPaid = await Invoice.findOne({ where: { invoice_no: { [Op.like]: `${invoiceSerie}-%` }, status: InvoiceStatus.PAID, request_id: requestId } });
    if (priorPaid) throw new AppError(400, `Cannot create invoice: paid invoice exists`);

    const attachment = await RequestAttachmentService.createAttachment(
      requestId,
      payload.createdBy,
      'emptyPath',
      RequestAttachmentTypeEnum.Invoice,
      displayName,
      transaction
    );

    const doneeInformation = await InvoiceService.getDoneeInformationForInvoice(request, transaction);
    const assetInformation = await InvoiceService.createAssetInformation(request, transaction);
    const bankInformation = InvoiceService.getBankInformationForInvoice();

    // Calculate due date as Net 30 from attachment created date
    const invoiceDate = attachment.createdAt as Date;
    const dueDate = new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const invoicePayload = {
      invoiceDate: attachment.createdAt,
      dueDate: dueDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
      invoiceNo,
      doneeInformation,
      assetInformation,
      bankInformation,
      TCN: payload.request.tcn
    };

    // Use penny totals computed by getAssetInformationForInvoice (preferred) to avoid floating point errors
    const total_amount_pennies = assetInformation.total_pennies
    const american_surplus_amount_pennies = assetInformation.americanSurplusTotal_pennies;
    const sasp_net_amount_pennies = total_amount_pennies - american_surplus_amount_pennies;

    // Also provide dollar representations for backward compatibility
    const total_amount = assetInformation.total;
    const american_surplus_amount = assetInformation.americanSurplusTotal;
    const sasp_net_amount = total_amount - american_surplus_amount;

    //if its less than a penny status must be paid.
    const isLessThanPenny = total_amount_pennies < 1

    const createdInvoice = await Invoice.create({
      state_id: request.doneeAccount?.stateId as number,
      donee_account_id: request.doneeAccount?.id as number,
      request_id: request.id,
      attachment_id: attachment.id,
      invoice_no: invoiceNo,
      invoice_data: invoicePayload,
      status: isLessThanPenny ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
      total_amount,
      american_surplus_amount,
      sasp_net_amount,
      total_amount_pennies,
      american_surplus_amount_pennies,
      sasp_net_amount_pennies,
      due_date: dueDate,
    }, { transaction }
    );

    //american-surplus logo
    const AmericanSurplusLogoPath = path.join(__dirname, `../assets/american-surplus-logo.svg`);
    const AmericanSurplusLogoBase64 = fs.readFileSync(AmericanSurplusLogoPath, { encoding: 'base64' });
    const AmericanSurplusLogo = `data:image/svg+xml;base64,${AmericanSurplusLogoBase64}`;

    // DMS SASP logo
    const logoName = this.getLogoByStateId(request.doneeAccount?.stateId as number);
    const DMSLogoPath = path.join(__dirname, `../assets/${logoName}`);
    const DMSLogoBase64 = fs.readFileSync(DMSLogoPath, { encoding: 'base64' });
    const DMSLogo = `data:image/png;base64,${DMSLogoBase64}`;

    const renderData: IDocumentRenderOptions = {
      documentTemplate: DocumentTemplateEnum.FL_INVOICE,
      payload: {
        ...invoicePayload,
        AmericanSurplusLogo,
        DMSLogo,
      },
    };

    const renderedInvoice = await this.renderDocument(renderData);
    const pdf = await this.generatePdf(renderedInvoice);

    const storageDir = StoragePaths.private.orgs
      .org(request.doneeAccount?.organization?.id as string)
      .donees.donee((request.doneeAccount?.id as number).toString())
      .requests.request(requestId.toString()).path;

    const invoiceFileName = `${displayName}.pdf`;
    const invoicePath = await saveUploadedFile(pdf, storageDir, invoiceFileName);


    // Guard 3: cancel any old unpaid invoices in the same series before creating the new one
    const oldUnpaid = await Invoice.findAll({
      where: {
        invoice_no: { [Op.like]: `${invoiceSerie}-%` },
        status: { [Op.notIn]: [InvoiceStatus.PAID, InvoiceStatus.CANCELED], },
        request_id: requestId,
      },
    });

    for (const inv of oldUnpaid) {
      try {
        // Cancel invoice on QBO side first if qbo_ref_id exists
        if (inv.qbo_ref_id && envvars.app.environment !== 'local_development') {
          try {
            const qboInvoiceService = new QBOInvoiceService();
            const invoice = await qboInvoiceService.getById(inv.qbo_ref_id);

            if (!invoice) {
              logger.error('Failed to fetch invoice from QBO side', { invoiceId: inv.id, qboRefId: inv.qbo_ref_id });
              throw new AppError(400, `Failed to fetch invoice from QBO side for invoice ${inv.invoice_no}`);
            }

            const syncToken = invoice.SyncToken;
            if (!syncToken) {
              logger.error('Missing sync token from QBO invoice', { invoiceId: inv.id, qboRefId: inv.qbo_ref_id });
              throw new AppError(400, `Missing sync token for invoice ${inv.invoice_no}`);
            }

            const isPaidInQbo = typeof invoice.Balance === 'number' ? invoice.Balance <= 0 : false;
            if (isPaidInQbo) {
              logger.error('Cannot cancel invoice on QBO side because it is paid', { invoiceId: inv.id, qboRefId: inv.qbo_ref_id });
              throw new AppError(400, `Invoice ${inv.invoice_no} is paid in QuickBooks and cannot be canceled.`);
            }

            // Cancel (void) invoice on QBO side
            const cancelResponse = await qboInvoiceService.cancel(inv.qbo_ref_id, syncToken);
            if (!cancelResponse || !cancelResponse.Invoice || !cancelResponse.Invoice.Id) {
              logger.error('Failed to cancel invoice on QBO side', { invoiceId: inv.id, qboRefId: inv.qbo_ref_id, response: cancelResponse });
              throw new AppError(400, `Failed to cancel invoice on QBO side for invoice ${inv.invoice_no}`);
            }
          } catch (qboError) {
            logger.error('Failed to cancel invoice on QBO side', { invoiceId: inv.id, qboRefId: inv.qbo_ref_id, error: qboError });
            throw new AppError(400, `Failed to cancel invoice on QBO side for invoice ${inv.invoice_no}`);
          }
        }

        // If QBO cancellation successful, proceed with American Surplus side cancellation
        await Invoice.update({ status: InvoiceStatus.CANCELED }, { where: { id: inv.id }, transaction });
        await InvoiceActivityLog.create({ invoice_id: inv.id, activity: InvoiceActivity.INVOICE_CANCELED, metadata: { invoice_no: inv.invoice_no, cancellation_reason: "Superseded" }, activator: payload.createdBy.id }, { transaction });
        await NotificationFactory.createNotification(NotificationType.INVOICE_CANCELED, { requestId: inv.request_id })
      } catch (e) {
        logger.error('Failed to cancel prior unpaid invoice', { invoiceId: inv.id, error: e });
        throw new AppError(400, `Failed to cancel prior unpaid invoice', invoiceId: ${inv.id})`);
      }
    }

    //qbo invoice genration
    if (envvars.app.environment !== 'local_development') {
      try {
        const qboInvoiceService = new QBOInvoiceService();
        const invoiceData = QBOInvoiceService.generateInvoiceData(request, invoiceNo, invoiceDate, dueDate, assetInformation);
        const qboInvoice = await qboInvoiceService.create(invoiceData);
        await createdInvoice.update({ qbo_ref_id: qboInvoice.Id }, { transaction });
      } catch (error) {
        logger.error('Failed to create QBO invoice', { invoiceId: createdInvoice.id, error });
        throw new AppError(404, 'Error, unable to create error', 'Unable to create QBO invoice');
      }
    }

    await RequestAttachmentService.updateAttachmentPath(attachment.id, invoicePath, payload.createdBy, transaction);
    await InvoiceActivityLog.create({
      invoice_id: createdInvoice.id,
      activity: InvoiceActivity.INVOICE_GENERATED,
      metadata: { invoice_no: invoiceNo },
      activator: payload.createdBy.id,
    }, { transaction });
  }

  private static async signInvoice(payload: { request: Request; requestAttachmentId: number; signedBy: User; stateId: number }, transaction?: Transaction) {
    const invoice = await Invoice.findOne({ where: { attachment_id: payload.requestAttachmentId } });
    if (!invoice) throw new AppError(404, 'Invoice not found');

    const signedByDoneeAccountOrganization = payload.request.doneeAccount?.organization;
    const signedOrganizationId = signedByDoneeAccountOrganization?.id;

    const signedByUserScope = await UserScope.findOne({
      where: { user_id: payload.signedBy.id },
      include: [
        { model: OrganizationUser, as: 'organizationUser', where: { organizationId: signedOrganizationId } },
        { model: Role, as: 'role' }
      ],
    });

    const signedByOrganizationRole = signedByUserScope?.role;
    if (!signedByOrganizationRole) throw new AppError(403, 'User does not have a valid role in the organization');
    if (signedByOrganizationRole.role_name != PredefinedRoles.Organization_Admin && signedByOrganizationRole.role_name != PredefinedRoles.Organization_Manager) throw new AppError(403, 'User is not authorized to sign the invoice');

    //state logo
    const logoName = this.getLogoByStateId(payload.stateId as number);
    const logoPath = path.join(__dirname, `../assets/${logoName}`);
    const logoBase64 = fs.readFileSync(logoPath, { encoding: 'base64' });
    const DMSLogo = `data:image/png;base64,${logoBase64}`;

    //american-surplus logo
    const AmericanSurplusLogoPath = path.join(__dirname, `../assets/american-surplus-logo.svg`);
    const AmericanSurplusLogoBase64 = fs.readFileSync(AmericanSurplusLogoPath, { encoding: 'base64' });
    const AmericanSurplusLogo = `data:image/svg+xml;base64,${AmericanSurplusLogoBase64}`;
    // Prepare data for EJS template
    const invoiceData = invoice.invoice_data as object;
    const renderData: IDocumentRenderOptions = {
      documentTemplate: DocumentTemplateEnum.FL_INVOICE,
      payload: {
        ...invoiceData,
        dueDate: invoice.due_date,
        signedByName: payload.signedBy.name,
        signDate: new Date().toISOString().slice(0, 10),
        AmericanSurplusLogo,
        DMSLogo,
      },
    };

    // Render and generate PDF
    const renderedInvoice = await this.renderDocument(renderData);
    const pdf = await this.generatePdf(renderedInvoice);

    // Update the file in storage
    const attachment = await RequestAttachmentService.getAttachment({ id: payload.requestAttachmentId });
    if (!attachment) throw new AppError(404, 'Attachment not found');

    const storageDir = StoragePaths.private.orgs
      .org(payload.request.doneeAccount?.organization?.id as string)
      .donees.donee((payload.request.doneeAccount?.id as number).toString())
      .requests.request(payload.request.id.toString()).path;

    const invoiceFileName = `${attachment.name}.pdf`;
    const invoicePath = await saveUploadedFile(pdf, storageDir, invoiceFileName);

    await RequestAttachmentService.updateAttachmentPath(attachment.id, invoicePath, payload.signedBy, transaction);
    await invoice.update({
      status: InvoiceStatus.SIGNED,
      invoice_data: {
        ...invoiceData,
        signedByName: payload.signedBy.name,
        signedById: payload.signedBy.id,
        signDate: new Date().toISOString().slice(0, 10),
      },
    }, { transaction }
    );

    InvoiceActivityLog.create({
      invoice_id: invoice.id,
      activity: InvoiceActivity.INVOICE_SIGNED,
      metadata: { invoice_no: invoice.invoice_no },
      activator: payload.signedBy.id,
    }, { transaction }
    );
  }

  private static async generateEligibilityApplication(payload: { application: Application; createdBy: User }, transaction?: Transaction) {
    logger.log('Generating eligibility application document', payload.application.id);
    const application = payload.application;
    const applicationId = application.id;

    const organization = await OrganizationUserService.getOrganizationById(
      application.organization_id,
      transaction,
      application.donee_account_id != null ? { doneeAccountId: application.donee_account_id } : undefined,
    );
    if (!organization) {
      throw new AppError(404, 'Organization not found for application');
    }

    // Get state information
    const state = await State.findByPk(application.state_id, { transaction });
    if (!state) {
      throw new AppError(404, 'State not found for application');
    }

    // Get application forms with their data
    const applicationForms = await ApplicationForm.findAll({
      where: { application_id: applicationId },
      include: [
        { model: Form, as: 'form', attributes: ['id', 'name'], required: false },
        'attachments',
      ],
      transaction,
    });

    const doneeAccount = await DoneeAccount.findByPk(application.donee_account_id, { transaction });

    const headerMeta = await EligibilityService.getEligibilityApplicationDocumentHeaderMeta(application, transaction);

    const headAuthorizedOfficialName = organization.head_authorized_official_name || '';
    const headAuthorizedOfficialEmail = organization.head_authorized_official_email || '';
    let headAuthorizedOfficialTitle = organization.head_authorized_official_title || '';
    let headAuthorizedOfficialPhone = organization.head_authorized_official_phone || '';

    if (!headAuthorizedOfficialTitle.trim()) {
      headAuthorizedOfficialTitle = 'N/A';
    }
    if (!headAuthorizedOfficialPhone.trim()) {
      headAuthorizedOfficialPhone = 'N/A';
    }

    const pdfOrg = DocumentFactory.asOrganizationPdfTableSource(organization);
    const primaryContactName = String(pdfOrg.primary_contact_name ?? '').trim();
    const primaryContactEmail = String(pdfOrg.primary_contact_email ?? '').trim();
    const primaryContactTitle = String(pdfOrg.primary_contact_title ?? '').trim();
    const primaryContactPhoneRaw = String(pdfOrg.primary_contact_phone ?? '').trim();

    // Parse form data for each form
    const formDataMap: any = {};
    const allDocuments: any[] = [];

    for (const form of applicationForms) {
      if (form.form_data) {
        const formData = typeof form.form_data === 'string' ? JSON.parse(form.form_data) : form.form_data;
        formDataMap[form.form_id] = formData;
      }

      // Collect all attachments
      const attachments = await ApplicationAttachment.findAll({
        where: {
          application_form_id: form.id,
        },
        transaction,
      });

      if (attachments) {
        for (const attachment of attachments) {
          const metadata = attachment.metadata as { originalName: string; description: string; status: string };
          allDocuments.push({
            fileName: metadata?.originalName || 'Unknown',
            description: metadata?.description || metadata?.originalName || 'Unknown',
            submittedDate: attachment.createdAt,
            status: metadata?.status || 'Unknown',
            date: attachment.createdAt,
          });
        }
      }
    }

    // Helper function to safely get nested object properties
    const safeGet = (obj: any, path: string, defaultValue: any = 'N/A') => {
      try {
        return path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue;
      } catch {
        return defaultValue;
      }
    };

    const orgIdentityPhones = formatOrganizationalIdentityPhonesForPdf(formDataMap, {
      headAuthorizedOfficialPhone,
      primaryContactPhoneFallback: primaryContactPhoneRaw,
      organizationPhoneFallback: primaryContactPhoneRaw,
      organizationFaxFallback: '',
    });

    const orgIdentityAddresses = await OrganizationAddressService.resolvedPdfOrganizationalAddresses(
      application.organization_id,
      formDataMap[1],
      transaction,
    );

    // Map form data to template variables with safe defaults
    const templateData = {
      applicationId: application.id,
      ...organizationTableFieldsForEligibilityPdf(pdfOrg),
      submittedDate: formatEligibilitySubmittedDateMmDdYyyy(application.submitted_date),
      generatedDate: new Date().toLocaleDateString(),

      showRenewalApplicationLabel: headerMeta.showRenewalApplicationLabel,
      applicationStatusLabel: headerMeta.applicationStatusLabel,

      doneeAccountNumber: (doneeAccount?.name && String(doneeAccount.name).trim()) || 'N/A',
      applicationExpiryDate: formatEligibilityDocDate(application.expiry_date),

      // State information
      stateName: state.stateName || 'N/A',
      stateCode: state.stateCode || 'N/A',
      stateAddressLine1: state.addressLine1 || 'N/A',
      stateAddressLine2: normalizeStateAddressLine2(state.addressLine2),
      stateCity: state.city || 'N/A',
      statePhone: formatUsPhoneDisplay(state.phone),

      // Signature information
      headAuthRepresentativeName: headAuthorizedOfficialName || 'N/A',
      signedDate: undefined,
      saspDeterminationEligibleChecked: application.status === EligibilityApplicationStatuses.APPROVED,
      saspDeterminationIneligibleChecked: application.status === EligibilityApplicationStatuses.DENIED,
      saspApprovingOfficialName: '',
      saspApprovingOfficialTitle: '',
      saspApprovingOfficialSignedDate: '',
      saspApprovingOfficialDigitalLine: '',

      // Form data with safe defaults
      organizationalIdentityLegalProfile: {
        headAuthorizedOfficialName: headAuthorizedOfficialName || 'N/A',
        headAuthorizedOfficialTitle: headAuthorizedOfficialTitle || 'N/A',
        headAuthorizedOfficialPhone: orgIdentityPhones.headAuthorizedOfficialPhone,
        headAuthorizedOfficialEmail: headAuthorizedOfficialEmail || 'N/A',
        primaryContactName: primaryContactName || 'N/A',
        primaryContactTitle: primaryContactTitle || 'N/A',
        primaryContactPhone: orgIdentityPhones.primaryContactPhone,
        primaryContactEmail: primaryContactEmail || 'N/A',
        organizationName: organization.name,
        organizationPhone: orgIdentityPhones.organizationPhone,
        organizationFaxNumber: orgIdentityPhones.organizationFaxNumber,
        organizationEmail:
          coalesceOrganizationalIdentityField(
            formDataMap[1] as Record<string, unknown> | undefined,
            'organizationEmail',
            primaryContactEmail,
          ) || 'N/A',
        organizationWebsiteAddress: organization.website || 'N/A',
        organizationTinEin: formatTinEinEligibilityPdf(
          coalesceOrganizationalIdentityField(
            formDataMap[1] as Record<string, unknown> | undefined,
            'organizationTinEin',
            organization.tin || '',
          ) || null,
        ),
        ...orgIdentityAddresses,
        organizationType: organization.organization_type,
        organizationSubType: organization.organization_sub_type,
        publicPurpose: organization.public_purpose,
        primaryActivity: organization.primary_activity,
      },
      publicPurposePrimaryProgramActivity: {
        // pdf-render: mirror section 1's live-org source so both sections show consistent values
        // even when only form 1 was part of the latest edit-request approval (form 2's form_data
        // can lag behind organizations.* columns updated by applyForm1OrganizationUpdatesFromRequestedEdits).
        organizationType: organization.organization_type,
        organizationSubType: organization.organization_sub_type,
        publicPurpose: organization.public_purpose,
        primaryActivity: organization.primary_activity,
        primaryActivityNotListed: safeGet(formDataMap[2], 'primaryActivityNotListed', false),
        customPrimaryActivity: safeGet(formDataMap[2], 'customPrimaryActivity'),
        programNarrative: safeGet(formDataMap[2], 'programNarrative'),
      },
      capacityOversightProgramFunding: {
        fullTimeEmployees: safeGet(formDataMap[3], 'fullTimeEmployees', 0),
        partTimeEmployees: safeGet(formDataMap[3], 'partTimeEmployees', 0),
        reliesOnVolunteers: safeGet(formDataMap[3], 'reliesOnVolunteers', false),
        numberOfVolunteers: safeGet(formDataMap[3], 'numberOfVolunteers', 0),
        facilityOwnership: safeGet(formDataMap[3], 'facilityOwnership'),
        numberOfFacilities: safeGet(formDataMap[3], 'numberOfFacilities', 0),
        primaryFundingSources: safeGet(formDataMap[3], 'primaryFundingSources'),
        hasInventorySystem: safeGet(formDataMap[3], 'hasInventorySystem', false),
        canTransportStoreUtilize: safeGet(formDataMap[3], 'canTransportStoreUtilize', false),
        hasGoverningBody: safeGet(formDataMap[3], 'hasGoverningBody', false),
        olderAmericansAct: safeGet(formDataMap[3], 'olderAmericansAct', false),
        socialSecurityAct: safeGet(formDataMap[3], 'socialSecurityAct', false),
        economicOpportunityAct: safeGet(formDataMap[3], 'economicOpportunityAct', false),
        communityServicesBlockGrant: safeGet(formDataMap[3], 'communityServicesBlockGrant', false),
        publicPurposeSpendingAffirmation: safeGet(formDataMap[3], 'publicPurposeSpendingAffirmation', false),
      },
      designatedSignersAttestations: {
        authorizedRepresentatives: mapAuthorizedRepresentativePhonesForPdf(
          safeGet(formDataMap[4], 'authorizedRepresentatives', []),
        ),
        propertyNeedsList: safeGet(formDataMap[4], 'propertyNeedsList'),
        isMuseum: safeGet(formDataMap[4], 'isMuseum', false),
        museumOfficialName: safeGet(formDataMap[4], 'museumOfficialName'),
        museumOfficialSignature: safeGet(formDataMap[4], 'museumOfficialSignature'),
        certificationAgreementStatement: safeGet(formDataMap[4], 'certificationAgreementStatement', false),
        singleAuditAct: safeGet(formDataMap[4], 'singleAuditAct', false),
        sampleRestrictionPeriods: safeGet(formDataMap[4], 'sampleRestrictionPeriods', false),
        nondiscriminationAssuranceAgreement: safeGet(formDataMap[4], 'nondiscriminationAssuranceAgreement', false),
        certificationDebarmentSuspension: safeGet(formDataMap[4], 'certificationDebarmentSuspension', false),
      },
      welcomePlatformTraining: undefined,
      // welcomePlatformTraining: {
      //   // Add any fields from form 5 if they exist
      //   ...formDataMap?.[5],
      // },

      // Documents
      requiredDocuments: allDocuments,
    };

    const renderData: IDocumentRenderOptions = {
      documentTemplate: DocumentTemplateEnum.ELIGIBILITY_APPLICATION,
      payload: templateData,
    };

    const renderedDocument = await this.renderDocument(renderData);
    const pdf = await this.generatePdf(renderedDocument);

    // Second-precision suffix so multiple regenerations of the same application accumulate as
    // separate files; History timeline references them via application_logs.metadata.pdf_path.
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const displayName = `Eligibility_Application_${applicationId}_${ts}.pdf`;

    // Save to storage
    const storageDir = StoragePaths.private.orgs.org(organization.id).applications.application(applicationId.toString()).path;

    const documentPath = await saveUploadedFile(pdf, storageDir, displayName);

    await application.update({ pdf_path: documentPath }, { transaction });

    logger.log('Eligibility application document generated successfully', { applicationId, documentPath });

    return {
      documentPath,
      displayName,
      applicationId,
    };
  }

  /**
   * Signs eligibility application document
   * @param payload The payload containing application and user data
   * @param transaction Optional database transaction
   */
  private static async signEligibilityApplication(
    payload: { application: Application; signedBy: User; options?: { preserveSaspSignature?: boolean; refreshSignatureDates?: boolean } },
    transaction?: Transaction,
  ) {
    logger.log('Signing eligibility application document', payload.application.id);
    const application = payload.application;
    const applicationId = application.id;

    await application.reload({ transaction });

    const organization = await OrganizationUserService.getOrganizationById(
      application.organization_id,
      transaction,
      application.donee_account_id != null ? { doneeAccountId: application.donee_account_id } : undefined,
    );
    if (!organization) {
      throw new AppError(404, 'Organization not found for application');
    }

    // Get state information
    const state = await State.findByPk(application.state_id, { transaction });
    if (!state) {
      throw new AppError(404, 'State not found for application');
    }

    // Get application forms with their data
    const applicationForms = await ApplicationForm.findAll({
      where: { application_id: applicationId },
      include: [
        { model: Form, as: 'form', attributes: ['id', 'name'], required: false },
        'attachments',
      ],
      transaction,
    });

    const doneeAccount = await DoneeAccount.findByPk(application.donee_account_id, { transaction });

    const headerMeta = await EligibilityService.getEligibilityApplicationDocumentHeaderMeta(application, transaction);

    const headAuthorizedOfficialName = organization.head_authorized_official_name || '';
    const headAuthorizedOfficialEmail = organization.head_authorized_official_email || '';
    let headAuthorizedOfficialTitle = organization.head_authorized_official_title || '';
    let headAuthorizedOfficialPhone = organization.head_authorized_official_phone || '';

    if (!String(headAuthorizedOfficialTitle).trim()) headAuthorizedOfficialTitle = 'N/A';
    if (!String(headAuthorizedOfficialPhone).trim()) headAuthorizedOfficialPhone = 'N/A';


    const pdfOrg = DocumentFactory.asOrganizationPdfTableSource(organization);
    const primaryContactName = String(pdfOrg.primary_contact_name ?? '').trim();
    const primaryContactEmail = String(pdfOrg.primary_contact_email ?? '').trim();
    const primaryContactTitle = String(pdfOrg.primary_contact_title ?? '').trim();
    const primaryContactPhoneRaw = String(pdfOrg.primary_contact_phone ?? '').trim();

    // Parse form data for each form
    const formDataMap: any = {};
    const allDocuments: any[] = [];

    for (const form of applicationForms) {
      if (form.form_data) {
        const formData = typeof form.form_data === 'string' ? JSON.parse(form.form_data) : form.form_data;
        formDataMap[form.form_id] = formData;
      }

      // Collect all attachments
      const attachments = await ApplicationAttachment.findAll({
        where: { application_form_id: form.id, },
        transaction,
      });

      if (attachments) {
        for (const attachment of attachments) {
          const metadata = attachment.metadata as { originalName: string; description: string; status: string };
          allDocuments.push({
            fileName: metadata?.originalName || 'Unknown',
            description: metadata?.description || metadata?.originalName || 'Unknown',
            submittedDate: attachment.createdAt,
            status: metadata?.status || 'Unknown',
            date: attachment.createdAt,
          });
        }
      }
    }

    // Helper function to safely get nested object properties
    const safeGet = (obj: any, path: string, defaultValue: any = 'N/A') => {
      try {
        return path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue;
      } catch {
        return defaultValue;
      }
    };

    const orgIdentityPhones = formatOrganizationalIdentityPhonesForPdf(formDataMap, {
      headAuthorizedOfficialPhone: headAuthorizedOfficialPhone || '',
      primaryContactPhoneFallback: primaryContactPhoneRaw,
      organizationPhoneFallback: primaryContactPhoneRaw,
      organizationFaxFallback: '',
    });

    const orgIdentityAddresses = await OrganizationAddressService.resolvedPdfOrganizationalAddresses(
      application.organization_id,
      formDataMap[1],
      transaction,
    );

    const isSaspSigner = EligibilityService.isUserActiveSaspForApplication(payload.signedBy, application);
    const preserveSaspSignature = Boolean(payload.options?.preserveSaspSignature);
    const refreshSignatureDates = Boolean(payload.options?.refreshSignatureDates);
    const doneeSignedAtMs = refreshSignatureDates
      ? Date.now()
      : (application.submitted_date || Date.now());
    let signedDateForSig = refreshSignatureDates
      ? formatEligibilityDocDate(doneeSignedAtMs)
      : formatEligibilitySubmittedDateMmDdYyyy(application.submitted_date ?? null);

    let saspOfficialName = '';
    let saspOfficialTitle = '';
    let saspOfficialSignedDate = '';
    let saspDigitalLine = '';

    if (isSaspSigner || preserveSaspSignature) {
      if (isSaspSigner) {
        signedDateForSig = formatEligibilityDocDate(application.signed_date);
      }

      const approvalAudit = await EligibilityService.findApplicationApprovalAuditLog(application, transaction);
      const activatorUser = approvalAudit?.user;
      const approverName = activatorUser?.name || payload.signedBy.name;
      const meta = (approvalAudit?.metadata || {}) as Record<string, unknown>;
      const signedAtMs = refreshSignatureDates
        ? Date.now()
        : (
          (approvalAudit?.createdAt && approvalAudit.createdAt.getTime()) ||
          application.approved_date ||
          Date.now()
        );

      saspOfficialName = approverName;
      const titleFromSaspUser = approvalAudit?.saspUser?.title && String(approvalAudit.saspUser.title).trim();
      const saspScope = (payload.signedBy.scopes as (Scope & IUserCorperate)[]).find((scope) => scope.type === ScopeType.SASP && scope.isActive === true);
      const titleFromSaspScope = (saspScope as any)?.title && String((saspScope as any).title).trim();
      const signedByUserScope = (payload.signedBy.scopes as (Scope & IUserCorperate)[]).find((scope) => scope.type === ScopeType.SASP && scope.isActive === true);
      // SDN-1410: donee reviewer has no SASP scope — don't query with an undefined stateId.
      const saspUser = signedByUserScope?.stateId != null
        ? await SaspUser.findOne({ where: { stateId: signedByUserScope.stateId, userId: payload.signedBy.id }, transaction })
        : null;
      const signedByUserTitle = saspUser?.title?.trim() || '';
      const titleFromMeta =
        typeof meta.officialTitle === 'string' && meta.officialTitle.trim() ? meta.officialTitle.trim() : '';
      saspOfficialTitle =
        titleFromSaspUser || titleFromSaspScope || titleFromMeta || signedByUserTitle || '';
      saspOfficialSignedDate = formatEligibilityDocDate(signedAtMs);
      if (saspOfficialName && saspOfficialSignedDate && saspOfficialSignedDate !== 'N/A') {
        saspDigitalLine = `Digitally signed by ${saspOfficialName} on ${saspOfficialSignedDate}`;
      }
    }

    // Map form data to template variables with safe defaults
    const templateData = {
      applicationId: application.id,
      ...organizationTableFieldsForEligibilityPdf(pdfOrg),
      submittedDate: formatEligibilitySubmittedDateMmDdYyyy(application.submitted_date ?? null),
      generatedDate: new Date().toLocaleDateString(),

      showRenewalApplicationLabel: headerMeta.showRenewalApplicationLabel,
      applicationStatusLabel: headerMeta.applicationStatusLabel,

      doneeAccountNumber: (doneeAccount?.name && String(doneeAccount.name).trim()) || 'N/A',
      applicationExpiryDate: formatEligibilityDocDate(application.expiry_date),

      // State information
      stateName: state.stateName || 'N/A',
      stateCode: state.stateCode || 'N/A',
      stateAddressLine1: state.addressLine1 || 'N/A',
      stateAddressLine2: normalizeStateAddressLine2(state.addressLine2),
      stateCity: state.city || 'N/A',
      statePhone: formatUsPhoneDisplay(state.phone),

      // Signature information
      headAuthRepresentativeName: headAuthorizedOfficialName || 'N/A',
      signedDate: signedDateForSig,
      saspDeterminationEligibleChecked: application.status === EligibilityApplicationStatuses.APPROVED,
      saspDeterminationIneligibleChecked: application.status === EligibilityApplicationStatuses.DENIED,
      saspApprovingOfficialName: saspOfficialName,
      saspApprovingOfficialTitle: saspOfficialTitle,
      saspApprovingOfficialSignedDate: saspOfficialSignedDate,
      saspApprovingOfficialDigitalLine: saspDigitalLine,

      // Form data with safe defaults
      organizationalIdentityLegalProfile: {
        headAuthorizedOfficialName: headAuthorizedOfficialName || 'N/A',
        headAuthorizedOfficialTitle: headAuthorizedOfficialTitle || 'N/A',
        headAuthorizedOfficialPhone: orgIdentityPhones.headAuthorizedOfficialPhone,
        headAuthorizedOfficialEmail: headAuthorizedOfficialEmail || 'N/A',
        primaryContactName: primaryContactName || 'N/A',
        primaryContactTitle: primaryContactTitle || 'N/A',
        primaryContactPhone: orgIdentityPhones.primaryContactPhone,
        primaryContactEmail: primaryContactEmail || 'N/A',
        organizationName: organization.name,
        organizationPhone: orgIdentityPhones.organizationPhone,
        organizationFaxNumber: orgIdentityPhones.organizationFaxNumber,
        organizationEmail:
          coalesceOrganizationalIdentityField(
            formDataMap[1] as Record<string, unknown> | undefined,
            'organizationEmail',
            primaryContactEmail,
          ) || 'N/A',
        organizationWebsiteAddress: organization.website || 'N/A',
        organizationTinEin: formatTinEinEligibilityPdf(
          coalesceOrganizationalIdentityField(
            formDataMap[1] as Record<string, unknown> | undefined,
            'organizationTinEin',
            organization.tin || '',
          ) || null,
        ),
        ...orgIdentityAddresses,
        organizationType: organization.organization_type,
        organizationSubType: organization.organization_sub_type,
        publicPurpose: organization.public_purpose,
        primaryActivity: organization.primary_activity,
      },
      publicPurposePrimaryProgramActivity: {
        // pdf-render: mirror section 1's live-org source so both sections show consistent values
        // even when only form 1 was part of the latest edit-request approval (form 2's form_data
        // can lag behind organizations.* columns updated by applyForm1OrganizationUpdatesFromRequestedEdits).
        organizationType: organization.organization_type,
        organizationSubType: organization.organization_sub_type,
        publicPurpose: organization.public_purpose,
        primaryActivity: organization.primary_activity,
        primaryActivityNotListed: safeGet(formDataMap[2], 'primaryActivityNotListed', false),
        customPrimaryActivity: safeGet(formDataMap[2], 'customPrimaryActivity'),
        programNarrative: safeGet(formDataMap[2], 'programNarrative'),
      },
      capacityOversightProgramFunding: {
        fullTimeEmployees: safeGet(formDataMap[3], 'fullTimeEmployees', 0),
        partTimeEmployees: safeGet(formDataMap[3], 'partTimeEmployees', 0),
        reliesOnVolunteers: safeGet(formDataMap[3], 'reliesOnVolunteers', false),
        numberOfVolunteers: safeGet(formDataMap[3], 'numberOfVolunteers', 0),
        facilityOwnership: safeGet(formDataMap[3], 'facilityOwnership'),
        numberOfFacilities: safeGet(formDataMap[3], 'numberOfFacilities', 0),
        primaryFundingSources: safeGet(formDataMap[3], 'primaryFundingSources'),
        hasInventorySystem: safeGet(formDataMap[3], 'hasInventorySystem', false),
        canTransportStoreUtilize: safeGet(formDataMap[3], 'canTransportStoreUtilize', false),
        hasGoverningBody: safeGet(formDataMap[3], 'hasGoverningBody', false),
        olderAmericansAct: safeGet(formDataMap[3], 'olderAmericansAct', false),
        socialSecurityAct: safeGet(formDataMap[3], 'socialSecurityAct', false),
        economicOpportunityAct: safeGet(formDataMap[3], 'economicOpportunityAct', false),
        communityServicesBlockGrant: safeGet(formDataMap[3], 'communityServicesBlockGrant', false),
        publicPurposeSpendingAffirmation: safeGet(formDataMap[3], 'publicPurposeSpendingAffirmation', false),
      },
      designatedSignersAttestations: {
        authorizedRepresentatives: mapAuthorizedRepresentativePhonesForPdf(
          safeGet(formDataMap[4], 'authorizedRepresentatives', []),
        ),
        propertyNeedsList: safeGet(formDataMap[4], 'propertyNeedsList'),
        isMuseum: safeGet(formDataMap[4], 'isMuseum', false),
        museumOfficialName: safeGet(formDataMap[4], 'museumOfficialName'),
        museumOfficialSignature: safeGet(formDataMap[4], 'museumOfficialSignature'),
        certificationAgreementStatement: safeGet(formDataMap[4], 'certificationAgreementStatement', false),
        singleAuditAct: safeGet(formDataMap[4], 'singleAuditAct', false),
        sampleRestrictionPeriods: safeGet(formDataMap[4], 'sampleRestrictionPeriods', false),
        nondiscriminationAssuranceAgreement: safeGet(formDataMap[4], 'nondiscriminationAssuranceAgreement', false),
        certificationDebarmentSuspension: safeGet(formDataMap[4], 'certificationDebarmentSuspension', false),
      },
      welcomePlatformTraining: undefined,
      // welcomePlatformTraining: {
      //   // Add any fields from form 5 if they exist
      //   ...formDataMap?.[5],
      // },

      // Documents
      requiredDocuments: allDocuments,
    };

    const renderData: IDocumentRenderOptions = {
      documentTemplate: DocumentTemplateEnum.ELIGIBILITY_APPLICATION,
      payload: templateData,
    };

    const renderedDocument = await this.renderDocument(renderData);
    const pdf = await this.generatePdf(renderedDocument);

    // Same reason as the unsigned generator: keep a separate file per sign so History can link
    // each Approved event to the exact signed PDF that existed at that moment.
    const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    const displayName = `Eligibility_Application_Signed_${applicationId}_${ts}.pdf`;

    // Save to storage
    const storageDir = StoragePaths.private.orgs.org(organization.id).applications.application(applicationId.toString()).path;

    const documentPath = await saveUploadedFile(pdf, storageDir, displayName);

    await application.update(
      {
        pdf_path: documentPath,
        ...(isSaspSigner
          ? {}
          : {
            // In edit-request re-approval, keep the existing donee signer name and just refresh dates.
            signed_by: preserveSaspSignature ? (application.signed_by || payload.signedBy.name) : payload.signedBy.name,
            signed_date: doneeSignedAtMs,
          }),
      },
      { transaction }
    );

    logger.log('Eligibility application document signed successfully', { applicationId, documentPath });

    return {
      documentPath,
      displayName,
      applicationId,
      signedBy: payload.signedBy.name,
      signedDate: formatEligibilitySubmittedDateMmDdYyyy(application.submitted_date ?? null),
    };
  }

  // DOCUMENT RENDERERS
  private static async renderDocument({ documentTemplate, payload }: IDocumentRenderOptions): Promise<string> {
    try {
      const baseDir = path.join(__dirname, '../../templates/documents');
      const renderPath = path.join(baseDir, `${documentTemplate}.ejs`);

      const rendered = await ejs.renderFile(renderPath, { ...payload });
      return rendered;
    } catch (error) {
      throw new AppError(500, `Unable to render document ${error}`);
    }
  }

  private static async generatePdf(renderedInvoice: string): Promise<Buffer> {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(renderedInvoice, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '50px', bottom: '50px', left: '100px', right: '100px' },
    });
    await browser.close();
    return Buffer.from(pdfBuffer);
  }

  private static getLogoByStateId(stateId: number | string): string | undefined {
    switch (stateId) {
      case 1:
      case '1':
        return 'fl-dms-logo.png';
      default:
        return undefined;
    }
  }


  private static async generateLogisticsPacket(payload: { request: Request; createdBy: User; shippingName?: string; dontGenerateNewAttachment?: boolean }, transaction?: Transaction) {
    const request = payload.request;
    const requestId = request.id;

    const displayName = `Logistics_Packet_${request.tcn || 'Unknown'}`;

    // Check if logistics packet already exists (for updates)
    let attachment;

    if (!payload.dontGenerateNewAttachment) {
      attachment = await RequestAttachmentService.createAttachment(
        requestId,
        payload.createdBy,
        'emptyPath',
        RequestAttachmentTypeEnum.LogisticsPacket,
        displayName,
        transaction
      );
    } else {
      attachment = await RequestAttachmentService.getAttachment({
        request_id: requestId,
        attachment_type: RequestAttachmentTypeEnum.LogisticsPacket,
      });
    }

    if (payload.shippingName) {
      await RequestAttachmentService.updateAttachmentPath(attachment?.id as number, payload.shippingName, payload.createdBy, transaction);
      attachment = await RequestAttachmentService.getAttachment({
        id: attachment?.id,
        request_id: requestId,
        attachment_type: RequestAttachmentTypeEnum.LogisticsPacket,
      });
    }

    // Get all properties for the request
    const properties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
    if (!properties || properties.length === 0) {
      throw new AppError(404, 'No properties found for this request');
    }

    // Get allocated properties only
    const allocatedProperties = properties.filter((property) => property.property_allocated_quantity > 0);
    if (allocatedProperties.length === 0) {
      throw new AppError(400, 'No allocated properties found for this request');
    }

    const icnList = allocatedProperties.map((p) => p.property_control_number);
    const propertyDetails = await PropertyDataService.getManyPropertyDetails(icnList);

    const loarAttachment = await RequestAttachmentService.getAttachment({
      request_id: requestId,
      attachment_type: RequestAttachmentTypeEnum.LOAR,
    }, transaction);

    // Get or create the logistics packet entity for status information
    let logisticsPacket = await LogisticsPacket.findOne({
      where: { attachment_id: attachment?.id },
      include: [
        {
          model: RequestAttachment,
          as: 'loarAttachment',
        },
        {
          model: User,
          as: 'loarSaspUser',
        },
      ],
      transaction,
    });

    if (!logisticsPacket) {
      // Create new logistics packet entity if it doesn't exist
      logisticsPacket = await LogisticsPacket.create(
        {
          state_id: request.doneeAccount?.stateId || 0,
          donee_account_id: request.doneeAccount?.id || 0,
          request_id: requestId,
          status: LogisticsPacketStatus.PENDING,
          attachment_id: attachment?.id as number,
          packet_no: `LP-${requestId}-${Date.now()}`,
          loar_attachment_id: loarAttachment?.id,
          loar_sasp_user_id: payload.createdBy.id,
          packet_data: {
            generated_at: new Date().toISOString(),
            generated_by: payload.createdBy.id,
            request_id: requestId,
          },
        },
        { transaction }
      );
      await logisticsPacket.save({ transaction });
    }

    // FL-DMS logo
    const logoName = this.getLogoByStateId(request.doneeAccount?.stateId as number);
    const DMSLogoPath = path.join(__dirname, `../assets/${logoName}`);
    const DMSLogoBase64 = fs.readFileSync(DMSLogoPath, { encoding: 'base64' });
    const DMSLogo = `data:image/png;base64,${DMSLogoBase64}`;

    const organizationSignedByUser = await User.findByPk(logisticsPacket.organization_signed_by);
    const saspSignedByUser = await User.findByPk(logisticsPacket.sasp_signed_by);

    // Get head authorized user for LOAR data
    const doneeHeadAuthorizedRepScope = await UserScope.findOne({
      where: { donee_account_id: request.doneeAccount?.id, is_head_representative: true },
    });
    const headAuthorizedUser = await User.findByPk(doneeHeadAuthorizedRepScope?.user_id);
    const headAuthorizedOrganizationUser = await OrganizationUser.findOne({ where: { userId: headAuthorizedUser?.id }, transaction });
    const organizationMailingAddress = request.doneeAccount?.organization?.organization_addresses?.find(type => type.address_type == OrganizationAddressType.MAILING);

    // Prepare LOAR data
    const loarData = {
      request,
      headAuthorizedOrganizationUser,
      organizationMailingAddress,
      authenticatedUser: payload.createdBy,
      properties: allocatedProperties,
      propertyDetails,
      attachmentDate: attachment?.createdAt,
      saspUser: logisticsPacket.loarSaspUser ?? payload.createdBy,
      headAuthorizedUser,
      signatureDate: payload.shippingName ? new Date() : undefined, // Add signature date if shipping name exists
      shippingName: payload.shippingName, // Use shipping name from payload
    };

    // Prepare Logistics Packet data
    const logisticsData = {
      request,
      headAuthorizedOrganizationUser,
      organizationMailingAddress,
      properties: allocatedProperties,
      propertyDetails,
      loarAttachment,
      generatedDate: attachment?.createdAt,
      DMSLogo,
      organizationSignedBy: organizationSignedByUser,
      saspSignedBy: saspSignedByUser,
      logisticsPacket: logisticsPacket || {
        status: LogisticsPacketStatus.PENDING,
        sasp_signed_at: null,
        organization_signed_at: null,
        sasp_signed_by: null,
        organization_signed_by: null,
      },
      purposes: logisticsPacket.purposes,
      isLocalGovernment:
        request.doneeAccount?.organization?.organization_type === "Public Agency" &&
        request.doneeAccount?.organization?.organization_sub_type === "Local",
      isNonprofit: request.doneeAccount?.organization?.organization_type === "Nonprofit",
      isStateGovernment:
        request.doneeAccount?.organization?.organization_type === "Public Agency" &&
        request.doneeAccount?.organization?.organization_sub_type === "State",
    };

    const combinedPayload = {
      loarData,
      logisticsData,
    };

    const renderData: IDocumentRenderOptions = {
      documentTemplate: DocumentTemplateEnum.LOGISTICS_PACKET,
      payload: combinedPayload,
    };

    const renderedPacket = await this.renderDocument(renderData);
    const pdf = await this.generatePdf(renderedPacket);

    const storageDir = StoragePaths.private.orgs
      .org(request.doneeAccount?.organization?.id as string)
      .donees.donee((request.doneeAccount?.id as number).toString())
      .requests.request(requestId.toString()).path;

    const packetFileName = `${displayName}.pdf`;
    const packetPath = await saveUploadedFile(pdf, storageDir, packetFileName);

    await RequestAttachmentService.updateAttachmentPath(attachment?.id as number, packetPath, payload.createdBy, transaction);

    return { message: 'Logistics packet generated successfully', attachmentId: attachment?.id as number };
  }

  private static async signLogisticsPacket(payload: { request: Request; requestAttachmentId: number; signedBy: User; stateId: number; shippingName?: string; purposes?: object }, transaction?: Transaction) {
    const request = payload.request;
    const requestId = request.id;
    const attachmentId = payload.requestAttachmentId;

    // Get the logistics packet attachment
    const attachment = await RequestAttachmentService.getAttachment({
      id: attachmentId,
      request_id: requestId,
      attachment_type: RequestAttachmentTypeEnum.LogisticsPacket,
    });

    if (!attachment) {
      throw new AppError(404, 'Logistics packet attachment not found');
    }

    // Get all properties for the request
    const properties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
    if (!properties || properties.length === 0) {
      throw new AppError(400, 'No properties found for this request');
    }

    // Get allocated properties only
    const allocatedProperties = properties.filter((property) => property.property_allocated_quantity > 0);
    if (allocatedProperties.length === 0) {
      throw new AppError(400, 'No allocated properties found for this request');
    }

    const icnList = allocatedProperties.map((p) => p.property_control_number);
    const propertyDetails = await PropertyDataService.getManyPropertyDetails(icnList);

    const loarAttachment = await RequestAttachmentService.getAttachment({ request_id: requestId, attachment_type: RequestAttachmentTypeEnum.LOAR, });

    // Get the logistics packet entity for status information
    const logisticsPacket = await LogisticsPacket.findOne({
      where: { attachment_id: attachmentId },
      include: [
        { model: RequestAttachment, as: 'loarAttachment', },
        { model: User, as: 'loarSaspUser', },],
      transaction
    });

    if (!logisticsPacket) throw new AppError(404, 'Logistics packet entity not found');

    // Determine if this is SASP or Organization user signing
    const activeScope = payload.signedBy.scopes?.find((scope: any) => scope.isActive);
    const isSaspUser = activeScope?.type === ScopeType.SASP && payload.stateId === (activeScope as any)?.stateId;

    // Update the logistics packet status based on who is signing
    if (isSaspUser) {
      await logisticsPacket.update({
        status: LogisticsPacketStatus.SASP_SIGNED,
        sasp_signed_at: new Date(),
        sasp_signed_by: payload.signedBy.id,
        memo_sasp: `Signed by SASP representative ${payload.signedBy.name}`,
      }, { transaction });
    } else {
      // Organization user is signing
      await logisticsPacket.update({
        status: LogisticsPacketStatus.ORGANIZATION_SIGNED,
        organization_signed_at: new Date(),
        organization_signed_by: payload.signedBy.id,
        memo_organization: `Signed by donee representative ${payload.signedBy.name}`,
        purposes: payload.purposes,
      }, { transaction });
    }

    // Check if both parties have signed and update to FULLY_SIGNED if needed
    if (
      (logisticsPacket.status === LogisticsPacketStatus.SASP_SIGNED && logisticsPacket.organization_signed_by) ||
      (logisticsPacket.status === LogisticsPacketStatus.ORGANIZATION_SIGNED && logisticsPacket.sasp_signed_by)
    ) {
      await logisticsPacket.update({ status: LogisticsPacketStatus.FULLY_SIGNED, }, { transaction });
    }

    // FL-DMS logo
    const logoName = this.getLogoByStateId(payload.stateId as number);
    const DMSLogoPath = path.join(__dirname, `../assets/${logoName}`);
    const DMSLogoBase64 = fs.readFileSync(DMSLogoPath, { encoding: 'base64' });
    const DMSLogo = `data:image/png;base64,${DMSLogoBase64}`;

    const organizationSignedByUser = await User.findByPk(logisticsPacket.organization_signed_by);
    const saspSignedByUser = await User.findByPk(logisticsPacket.sasp_signed_by);

    // Get head authorized user for LOAR data
    const doneeHeadAuthorizedRepScope = await UserScope.findOne({ where: { donee_account_id: request.doneeAccount?.id, is_head_representative: true }, });
    const headAuthorizedUser = await User.findByPk(doneeHeadAuthorizedRepScope?.user_id);
    const headAuthorizedOrganizationUser = await OrganizationUser.findOne({ where: { userId: headAuthorizedUser?.id }, transaction });
    const organizationMailingAddress = request.doneeAccount?.organization?.organization_addresses?.find(type => type.address_type == OrganizationAddressType.MAILING);

    // Prepare LOAR data (with signature for signed version)
    const loarData = {
      request,
      authenticatedUser: payload.signedBy,
      properties: allocatedProperties,
      propertyDetails,
      attachmentDate: attachment.createdAt,
      saspUser: isSaspUser ? payload.signedBy : logisticsPacket.loarSaspUser,
      headAuthorizedUser,
      signatureDate: new Date(), // Current date for signature
      shippingName: payload.shippingName, // Use shipping name from payload
      headAuthorizedOrganizationUser,
      organizationMailingAddress
    };

    // Prepare Logistics Packet data
    const logisticsData = {
      request,
      properties: allocatedProperties,
      propertyDetails,
      loarAttachment,
      generatedDate: attachment.createdAt,
      DMSLogo,
      organizationSignedBy: organizationSignedByUser,
      saspSignedBy: saspSignedByUser,
      logisticsPacket: logisticsPacket,
      purposes: payload.purposes ? payload.purposes : logisticsPacket.purposes,
      isLocalGovernment:
        request.doneeAccount?.organization?.organization_type === "Public Agency" &&
        request.doneeAccount?.organization?.organization_sub_type === "Local",
      isNonprofit: request.doneeAccount?.organization?.organization_type === "Nonprofit",
      isStateGovernment:
        request.doneeAccount?.organization?.organization_type === "Public Agency" &&
        request.doneeAccount?.organization?.organization_sub_type === "State",
      headAuthorizedOrganizationUser,
      organizationMailingAddress
    };

    const combinedPayload = { loarData, logisticsData, };
    const renderData: IDocumentRenderOptions = { documentTemplate: DocumentTemplateEnum.LOGISTICS_PACKET, payload: combinedPayload, };
    const renderedSignedPacket = await this.renderDocument(renderData);
    const signedPdf = await this.generatePdf(renderedSignedPacket);

    const storageDir = StoragePaths.private.orgs
      .org(request.doneeAccount?.organization?.id as string)
      .donees.donee((request.doneeAccount?.id as number).toString())
      .requests.request(requestId.toString()).path;

    const signedPacketFileName = `${attachment.name}_signed.pdf`;
    const signedPacketPath = await saveUploadedFile(signedPdf, storageDir, signedPacketFileName);

    // Update the existing attachment with the signed version
    await RequestAttachmentService.updateAttachmentPath(attachment.id, signedPacketPath, payload.signedBy, transaction);
    return { message: 'Logistics packet signed successfully', attachmentId: attachment.id };
  }

  private static sf97AttachmentDisplayName(tcn: string, icn: string): string {
    const suffix = String(icn).replace(/\W/g, '').slice(-10) || 'PROP';
    const raw = `SF97_${tcn}_${suffix}`;
    return raw.slice(0, 45);
  }

  private static async generateSf97Document(
    payload: { request: Request; createdBy: User; property_control_number: string },
    transaction?: Transaction
  ) {
    const request = payload.request;
    const requestId = request.id;
    const icn = String(payload.property_control_number || '').trim();
    if (!request.tcn) throw new AppError(400, 'TCN is required to generate SF-97');
    if (!icn) throw new AppError(400, 'ICN is required to generate SF-97');

    const duplicatePacket = await Sf97Packet.findOne({
      where: { request_id: requestId, property_control_number: icn },
      transaction,
    });
    if (duplicatePacket) throw new AppError(400, 'SF-97 already exists for this property (ICN)');

    const loarAttachment = await RequestAttachmentService.getAttachment(
      { request_id: requestId, attachment_type: RequestAttachmentTypeEnum.LOAR },
      transaction
    );
    if (!loarAttachment) throw new AppError(400, 'LOAR must exist before generating SF-97');

    const paidInvoice = await Invoice.findOne({
      where: { request_id: requestId, status: InvoiceStatus.PAID },
      transaction,
    });
    if (!paidInvoice) throw new AppError(400, 'Invoice must be marked as Paid before generating SF-97');

    const properties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
    if (!properties?.length) throw new AppError(404, 'No properties found for this request');

    const allocatedProperties = properties.filter((p) => p.property_allocated_quantity > 0);
    if (allocatedProperties.length === 0) throw new AppError(400, 'No allocated properties found for this request');

    const sf97PrimaryProperty = allocatedProperties.find((p) => p.property_control_number === icn);
    if (!sf97PrimaryProperty) throw new AppError(400, 'Selected property is not allocated on this request');

    const icnList = allocatedProperties.map((p) => p.property_control_number);
    const propertyDetails = await PropertyDataService.getManyPropertyDetails(icnList);
    const sf97PrimaryPropertyDetail = propertyDetails.find(
      (propertyDetail: any) => propertyDetail?.data?.itemControlNumber === icn
    );
    if (!sf97PrimaryPropertyDetail || !isSf97EligibleProperty(sf97PrimaryPropertyDetail)) {
      throw new AppError(400, 'Selected property is not eligible for SF-97 (not a vehicle)');
    }

    const conditionCode =
      sf97PrimaryPropertyDetail?.data?.conditionCode || sf97PrimaryPropertyDetail?.data?.supplyConditionCode || '';
    const propertyLocation = sf97PrimaryPropertyDetail?.data?.propertyLocation;

    const displayName = DocumentFactory.sf97AttachmentDisplayName(request.tcn || 'Unknown', icn);
    const attachment = await RequestAttachmentService.createAttachment(
      requestId,
      payload.createdBy,
      'emptyPath',
      RequestAttachmentTypeEnum.SF97,
      displayName,
      transaction,
      icn
    );

    const sf97Packet = await Sf97Packet.create(
      {
        state_id: request.doneeAccount?.stateId || 0,
        donee_account_id: request.doneeAccount?.id || 0,
        request_id: requestId,
        status: Sf97PacketStatus.PENDING,
        attachment_id: attachment.id,
        property_control_number: icn,
        document_no: `SF97-${requestId}-${Date.now()}`,
        packet_data: {
          generated_at: new Date().toISOString(),
          generated_by: payload.createdBy.id,
          request_id: requestId,
          icn,
          property_control_number: icn,
        },
      },
      { transaction }
    );

    const organizationSignedByUser = await User.findByPk(sf97Packet.organization_signed_by);
    const saspSignedByUser = await User.findByPk(sf97Packet.sasp_signed_by);

    const sf97Data = {
      request,
      sf97PrimaryProperty,
      sf97PrimaryPropertyDetail,
      sf97Packet,
      organizationSignedBy: organizationSignedByUser,
      saspSignedBy: saspSignedByUser,
      conditionCode,
      propertyLocation,
      generatedDate: attachment.createdAt,
    };

    const rendered = await this.renderDocument({
      documentTemplate: DocumentTemplateEnum.SF97,
      payload: { sf97Data },
    });
    const pdf = await this.generatePdf(rendered);

    const storageDir = StoragePaths.private.orgs
      .org(request.doneeAccount?.organization?.id as string)
      .donees.donee((request.doneeAccount?.id as number).toString())
      .requests.request(requestId.toString()).path;

    const fileName = `${displayName}.pdf`;
    const filePath = await saveUploadedFile(pdf, storageDir, fileName);
    await RequestAttachmentService.updateAttachmentPath(attachment.id, filePath, payload.createdBy, transaction);

    return { message: 'SF-97 generated successfully', attachmentId: attachment.id };
  }

  private static async signSf97Document(
    payload: { request: Request; requestAttachmentId: number; signedBy: User; stateId: number },
    transaction?: Transaction
  ) {
    const request = payload.request;
    const requestId = request.id;
    const attachmentId = payload.requestAttachmentId;

    const attachment = await RequestAttachmentService.getAttachment({
      id: attachmentId,
      request_id: requestId,
      attachment_type: RequestAttachmentTypeEnum.SF97,
    });

    if (!attachment) throw new AppError(404, 'SF-97 attachment not found');

    const properties = await PropertyService.getAllPropertiesByRequestId(requestId, {}, transaction);
    if (!properties?.length) throw new AppError(400, 'No properties found for this request');

    const allocatedProperties = properties.filter((p) => p.property_allocated_quantity > 0);
    if (allocatedProperties.length === 0) throw new AppError(400, 'No allocated properties found for this request');

    const icnList = allocatedProperties.map((p) => p.property_control_number);
    const propertyDetails = await PropertyDataService.getManyPropertyDetails(icnList);

    let sf97Packet = await Sf97Packet.findOne({
      where: { attachment_id: attachmentId },
      transaction,
    });
    const attachmentIcn =
      attachment.property_control_number && String(attachment.property_control_number).trim();
    if (!sf97Packet && attachmentIcn) {
      sf97Packet = await Sf97Packet.findOne({
        where: { request_id: requestId, property_control_number: attachmentIcn },
        transaction,
      });
    }
    if (!sf97Packet) throw new AppError(404, 'SF-97 record not found');

    const icn =
      (sf97Packet.property_control_number && String(sf97Packet.property_control_number).trim()) ||
      attachmentIcn ||
      '';

    let sf97PrimaryProperty: Property | Sf97EligibleAllocatedProperty | undefined;
    let sf97PrimaryPropertyDetail: any;
    if (icn) {
      sf97PrimaryProperty = allocatedProperties.find((p) => p.property_control_number === icn);
      if (!sf97PrimaryProperty) throw new AppError(400, 'Could not resolve SF-97 property line for ICN');
      sf97PrimaryPropertyDetail = propertyDetails.find(
        (propertyDetail: any) => propertyDetail?.data?.itemControlNumber === icn
      );
    } else {
      if (!requestHasSf97EligibleProperty(allocatedProperties, propertyDetails)) {
        throw new AppError(400, 'No vehicle property on this request is eligible for SF-97');
      }
      const resolved = firstSf97EligibleAllocatedProperty(allocatedProperties, propertyDetails);
      if (!resolved) throw new AppError(400, 'Could not resolve SF-97 property line');
      sf97PrimaryProperty = resolved;
      sf97PrimaryPropertyDetail = propertyDetails.find(
        (propertyDetail: any) =>
          propertyDetail?.data?.itemControlNumber === resolved.property_control_number
      );
    }

    if (!sf97PrimaryProperty) throw new AppError(400, 'Could not resolve SF-97 property line');

    const conditionCode =
      sf97PrimaryPropertyDetail?.data?.conditionCode ||
      sf97PrimaryPropertyDetail?.data?.supplyConditionCode ||
      '';
    const propertyLocation = sf97PrimaryPropertyDetail?.data?.propertyLocation;

    const activeScope = payload.signedBy.scopes?.find((scope: any) => scope.isActive);
    const isSaspUser = activeScope?.type === ScopeType.SASP && payload.stateId === (activeScope as any)?.stateId;

    if (isSaspUser) {
      await sf97Packet.update(
        {
          status: Sf97PacketStatus.SASP_SIGNED,
          sasp_signed_at: new Date(),
          sasp_signed_by: payload.signedBy.id,
          memo_sasp: `Signed by SASP representative ${payload.signedBy.name}`,
        },
        { transaction }
      );
    } else {
      await sf97Packet.update(
        {
          status: Sf97PacketStatus.ORGANIZATION_SIGNED,
          organization_signed_at: new Date(),
          organization_signed_by: payload.signedBy.id,
          memo_organization: `Signed by donee representative ${payload.signedBy.name}`,
        },
        { transaction }
      );
    }

    await sf97Packet.reload({ transaction });

    if (
      (sf97Packet.status === Sf97PacketStatus.SASP_SIGNED && sf97Packet.organization_signed_by) ||
      (sf97Packet.status === Sf97PacketStatus.ORGANIZATION_SIGNED && sf97Packet.sasp_signed_by)
    ) {
      await sf97Packet.update({ status: Sf97PacketStatus.FULLY_SIGNED }, { transaction });
      await sf97Packet.reload({ transaction });
    }

    const organizationSignedByUser = await User.findByPk(sf97Packet.organization_signed_by);
    const saspSignedByUser = await User.findByPk(sf97Packet.sasp_signed_by);

    const sf97Data = {
      request,
      sf97PrimaryProperty,
      sf97PrimaryPropertyDetail,
      sf97Packet,
      organizationSignedBy: organizationSignedByUser,
      saspSignedBy: saspSignedByUser,
      conditionCode,
      propertyLocation,
      generatedDate: attachment.createdAt,
    };

    const rendered = await this.renderDocument({
      documentTemplate: DocumentTemplateEnum.SF97,
      payload: { sf97Data },
    });
    const pdf = await this.generatePdf(rendered);

    const storageDir = StoragePaths.private.orgs
      .org(request.doneeAccount?.organization?.id as string)
      .donees.donee((request.doneeAccount?.id as number).toString())
      .requests.request(requestId.toString()).path;

    const signedFileName = `${attachment.name}_signed.pdf`;
    const signedPath = await saveUploadedFile(pdf, storageDir, signedFileName);
    await RequestAttachmentService.updateAttachmentPath(attachment.id, signedPath, payload.signedBy, transaction);

    return { message: 'SF-97 signed successfully', attachmentId: attachment.id };
  }

  private static async generateLOAR(
    payload: { request: Request; authenticatedUser: User; properties: Property[]; propertyDetails: any[]; attachmentDate: Date; headAuthorizedUser?: User; },
    transaction?: Transaction
  ): Promise<string> {
    const request = payload.request;

    if (!request.tcn) throw new AppError(400, 'TCN is required to generate LOAR');


    // Get head authorized user if not provided
    let headAuthorizedUser = payload.headAuthorizedUser;
    if (!headAuthorizedUser) {
      const doneeHeadAuthorizedRepScope = await UserScope.findOne({
        where: { donee_account_id: request.doneeAccount?.id, is_head_representative: true },
        transaction,
      });
      if (doneeHeadAuthorizedRepScope?.user_id) {
        headAuthorizedUser = (await User.findByPk(doneeHeadAuthorizedRepScope.user_id, { transaction })) as User;
      }
    }
    // Get sample property details for TO field data
    const sampleProperty = payload.properties[0];
    const samplePropertyDetails = payload.propertyDetails.find(
      (propertyDetail) => propertyDetail.data.itemControlNumber === sampleProperty.property_control_number
    );

    if (!samplePropertyDetails) throw new AppError(400, 'Property details not found for the sample property');

    const headAuthorizedOrganizationUser = await OrganizationUser.findOne({ where: { userId: headAuthorizedUser?.id }, transaction });
    const organizationMailingAddress = request.doneeAccount?.organization?.organization_addresses?.find(type => type.address_type == OrganizationAddressType.MAILING);

    const loarPayload = {
      request,
      headAuthorizedOrganizationUser,
      organizationMailingAddress,
      authenticatedUser: payload.authenticatedUser,
      properties: payload.properties,
      propertyDetails: payload.propertyDetails,
      attachmentDate: payload.attachmentDate,
      saspUser: payload.authenticatedUser,
      headAuthorizedUser,
      signatureDate: undefined, // No signature for initial generation
      shippingName: undefined, // No shipping name for initial generation
      // Add data for TO field
      address: samplePropertyDetails.data.reportingAgencyAddress,
      poc: samplePropertyDetails.data.propertyPOC,
    };

    const renderData: IDocumentRenderOptions = { documentTemplate: DocumentTemplateEnum.LOAR, payload: loarPayload, };
    const renderedLOAR = await this.renderDocument(renderData);
    const pdfBuffer = await this.generatePdf(renderedLOAR);
    // Save the PDF to file system and return the file path
    const context = await this.getLoarContext(request);
    const fileName = `LOAR_${context.doneeAccountId}_${context.requestTcn}.pdf`;
    const filePath = `${context.requestPath}/${fileName}`;

    await this.saveToFileSystem(filePath, pdfBuffer);
    return filePath;
  }

  private static async updateLOARShipping(
    payload: {
      request: Request; authenticatedUser: User; properties: Property[]; propertyDetails: any[]; shippingName: string; loarAttachment: any; headAuthorizedUser?: User;
    },
    transaction?: Transaction
  ): Promise<string> {
    const request = payload.request;

    if (!request.tcn) throw new AppError(400, 'TCN is required to generate LOAR');


    // Get head authorized user if not provided
    let headAuthorizedUser = payload.headAuthorizedUser;
    if (!headAuthorizedUser) {
      const doneeHeadAuthorizedRepScope = await UserScope.findOne({
        where: { donee_account_id: request.doneeAccount?.id, is_head_representative: true },
        transaction,
      });
      if (doneeHeadAuthorizedRepScope?.user_id) {
        headAuthorizedUser = (await User.findByPk(doneeHeadAuthorizedRepScope.user_id, { transaction })) as User;
      }
    }
    // Get sample property details for TO field data
    const sampleProperty = payload.properties[0];
    const samplePropertyDetails = payload.propertyDetails.find(
      (propertyDetail) => propertyDetail.data.itemControlNumber === sampleProperty.property_control_number
    );

    if (!samplePropertyDetails) throw new AppError(400, 'Property details not found for the sample property');


    const logisticsPacket = await LogisticsPacket.findOne({
      where: { loar_attachment_id: payload.loarAttachment.id },
      include: [{ model: User, as: 'loarSaspUser', },],
      transaction
    });

    if (!logisticsPacket) throw new AppError(404, 'Logistics packet entity not found');

    const loarPayload = {
      request,
      authenticatedUser: payload.authenticatedUser,
      properties: payload.properties,
      propertyDetails: payload.propertyDetails,
      attachmentDate: payload.loarAttachment.createdAt,
      saspUser: logisticsPacket.loarSaspUser,
      headAuthorizedUser,
      signatureDate: new Date(), // Current date for signature
      shippingName: payload.shippingName,
      // Add data for TO field
      address: samplePropertyDetails.data.reportingAgencyAddress,
      poc: samplePropertyDetails.data.propertyPOC,
    };

    const renderData: IDocumentRenderOptions = { documentTemplate: DocumentTemplateEnum.LOAR, payload: loarPayload, };

    const renderedLOAR = await this.renderDocument(renderData);
    const pdfBuffer = await this.generatePdf(renderedLOAR);

    // Save the PDF to file system and return the file path
    const context = await this.getLoarContext(request);
    const fileName = `LOAR_${context.doneeAccountId}_${context.requestTcn}.pdf`;
    const filePath = `${context.requestPath}/${fileName}`;

    await this.saveToFileSystem(filePath, pdfBuffer);
    return filePath;
  }

  /**
   * Get LOAR context information for file path generation
   */
  private static async getLoarContext(request: Request): Promise<{ requestId: string; doneeAccountId: string; organizationId: string; requestTcn: string; requestPath: string; }> {
    if (!request.tcn) throw new AppError(400, 'Request TCN is missing');

    const requestId = request.id.toString();
    const doneeAccountId = request.donee_account.toString();
    const organizationId = await DoneeAccountService.getDoneeAccountOrganizationId(doneeAccountId);

    if (!organizationId) throw new AppError(400, 'Missing organization ID');

    const requestPath = StoragePaths.private.orgs.org(organizationId).donees.donee(doneeAccountId).requests.request(requestId).path;

    return { requestId, doneeAccountId, organizationId, requestTcn: request.tcn, requestPath };
  }

  /**
   * Save buffer to file system
   */
  private static async saveToFileSystem(filePath: string, buffer: Buffer): Promise<void> {
    const dir = path.dirname(filePath);
    const fileName = path.basename(filePath);

    await saveUploadedFile(buffer, dir, fileName);
  }




  // ------------ RECON ------------------

  /**
 * Generates the reconciliation agreement PDF using the RECONCILIATION_AGREEMENT.ejs template.
 * @param payload The payload for the agreement document
 * @param transaction Optional DB transaction
 */
  private static async generateReconciliationAgreement(
    payload: {
      reportPeriod: string;
      agreementFileName: string;
      stateName: string;
      outputPath: string;
      monthlySaspNetFees: number;
      monthlyAmericanSurplusNetFees: number;
      totalMonthlyFees: number;
    },
    transaction?: Transaction
  ) {
    // Prepare American Surplus logo
    const flDmsLogoPath = path.join(__dirname, `../assets/fl-dms-logo.png`);
    const flDmsLogoBase64 = fs.readFileSync(flDmsLogoPath, { encoding: 'base64' });
    const flDmsLogo = `data:image/png;base64,${flDmsLogoBase64}`;

    // Prepare render data for EJS template
    const renderData: IDocumentRenderOptions = {
      documentTemplate: DocumentTemplateEnum.RECONCILIATION_AGREEMENT,
      payload: {
        ...payload,
        flDmsLogo,
      },
    };

    // Render and generate PDF
    const renderedAgreement = await this.renderDocument(renderData);
    const pdf = await this.generatePdf(renderedAgreement);

    // Save to storage
    const storageDir = payload.outputPath;
    const { agreementFileName } = payload;
    const agreementPath = await saveUploadedFile(pdf, storageDir, agreementFileName);

    // return path back
    return agreementPath;
  }

  private static async generate3040Reporting(
    payload: IDocumentPayloadMap[DocumentActionType.GENERATE_3040_REPORTING],
    transaction?: Transaction
  ) {
    const renderData: IDocumentRenderOptions = {
      documentTemplate: DocumentTemplateEnum.REPORT_3040,
      payload,
    };

    const renderedReport = await this.renderDocument(renderData);
    const pdf = await this.generatePdf(renderedReport);

    const reportPath = await saveUploadedFile(pdf, payload.outputPath, payload.reportFileName);
    return reportPath;
  }
}
