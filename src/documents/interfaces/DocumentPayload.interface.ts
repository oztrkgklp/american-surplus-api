import { DocumentActionType } from "../services/document-factory.service";
import Request from '@/properties/models/Request';
import User from "@/authn/models/User";
import Application from '@/eligibility/models/Application.entity';
import Property from '@/properties/models/Property';
import type { EligibilityDocumentSignOptions } from '@/eligibility/services/eligibility.service';

export interface IDocumentPayloadMap {
  [DocumentActionType.GENERATE_INVOICE]: { request: Request; createdBy: User; invoiceSerie: string };
  [DocumentActionType.SIGN_INVOICE]: { request: Request; requestAttachmentId: number; signedBy: User; stateId: number };
  [DocumentActionType.GENERATE_ELIGIBILITY_APPLICATION]: { application: Application; createdBy: User };
  [DocumentActionType.SIGN_ELIGIBILITY_APPLICATION]: {
    application: Application;
    signedBy: User;
    options?: EligibilityDocumentSignOptions;
  };
  [DocumentActionType.GENERATE_LOGISTICS_PACKET]: { request: Request; createdBy: User; shippingName?: string; dontGenerateNewAttachment?: boolean };
  [DocumentActionType.SIGN_LOGISTICS_PACKET]: { request: Request; requestAttachmentId: number; signedBy: User; stateId: number; shippingName?: string; purposes?: object };
  [DocumentActionType.GENERATE_SF97]: { request: Request; createdBy: User; property_control_number: string };
  [DocumentActionType.SIGN_SF97]: { request: Request; requestAttachmentId: number; signedBy: User; stateId: number };
  [DocumentActionType.GENERATE_LOAR]: {
    request: Request;
    authenticatedUser: User;
    properties: Property[];
    propertyDetails: any[];
    attachmentDate: Date;
    headAuthorizedUser?: User;
  };
  [DocumentActionType.UPDATE_LOAR_SHIPPING]: {
    request: Request;
    authenticatedUser: User;
    properties: Property[];
    propertyDetails: any[];
    shippingName: string;
    loarAttachment: any;
    headAuthorizedUser?: User;
  };
  [DocumentActionType.GENERATE_RECONCILIATION_AGREEMENT]: {
    reportPeriod: string;
    outputPath: string;
    stateName: string;
    monthlySaspNetFees: number;
    monthlyAmericanSurplusNetFees: number;
    totalMonthlyFees: number;
    agreementFileName: string;
  };
  [DocumentActionType.GENERATE_3040_REPORTING]: {
    reportTitle: string;
    stateName: string;
    dateRangeLabel: string;
    reportFileName: string;
    outputPath: string;
    sections: Array<{
      title: string;
      rows: Array<{ label: string; amount: number }>;
      totalLabel: string;
      totalAmount: string;
    }>;
    grandTotal: string;
    generatedAt: string;
  };
}
