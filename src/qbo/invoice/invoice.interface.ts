import { Reference, MetaData, Address } from '../customer/customer.interface';

export interface InvoiceData {
    Id?: string;
    SyncToken?: string;
    domain?: string;
    MetaData?: MetaData;
    CustomField?: CustomField[];
    DocNumber?: string;
    TxnDate?: string;
    DueDate?: string;
    ShipDate?: string;
    TrackingNum?: string;
    FOB?: string;
    ClassRef?: Reference;
    Source?: string;
    CustomerRef: Reference;
    CustomerMemo?: MemoRef;
    BillAddr?: Address;
    ShipAddr?: Address;
    ReplyEmailAddress?: string;
    ReplyPhone?: string;
    BillEmail?: EmailRef;
    DepartmentRef?: Reference;
    SalesTermRef?: Reference;
    RecurDataRef?: Reference;
    TaxExemptionRef?: Reference;
    DepositToAccountRef?: Reference;
    PaymentMethodRef?: Reference;
    PaymentRefNum?: string;
    PrivateNote?: string;
    Line: InvoiceLine[];
    TxnTaxDetail?: TaxDetail;
    ExchangeRate?: number;
    GlobalTaxCalculation?: string;
    HomeBalance?: number;
    PrintStatus?: string;
    EmailStatus?: string;
    ManuallyClosed?: boolean;
    ApplyTaxAfterDiscount?: boolean;
    Balance?: number;
    Deposit?: number;
    AllowIPNPayment?: boolean;
    AllowOnlinePayment?: boolean;
    AllowOnlineCreditCardPayment?: boolean;
    AllowOnlineACHPayment?: boolean;
    EInvoiceStatus?: string;
    ECloudStatus?: string;
    DeliveryInfo?: DeliveryInfo;
    CalculateTaxOnSave?: boolean;
}

export interface CustomField {
    DefinitionId?: string;
    StringValue?: string;
    BooleanValue?: boolean;
    DateValue?: string;
    NumberValue?: number;
}

export interface MemoRef {
    value?: string;
}

export interface EmailRef {
    Address?: string;
}

export interface InvoiceLine {
    Id?: string;
    LineNum?: number;
    Description?: string;
    Amount?: number;
    DetailType: string;
    SalesItemLineDetail?: SalesItemLineDetail;
    SubTotalLineDetail?: SubTotalLineDetail;
    DiscountLineDetail?: DiscountLineDetail;
    TaxLineDetail?: TaxLineDetail;
}

export interface SalesItemLineDetail {
    ItemRef?: Reference;
    ClassRef?: Reference;
    UnitPrice?: number;
    Qty?: number;
    TaxCodeRef?: Reference;
    PercentBased?: boolean;
    ItemAccountRef?: Reference;
    MarkupInfo?: MarkupInfo;
    ServiceDate?: string;
}

export interface MarkupInfo {
    Percent?: number;
    PriceLevelRef?: Reference;
}

export interface SubTotalLineDetail {
    itemRef?: Reference;
}

export interface DiscountLineDetail {
    PercentBased?: boolean;
    DiscountPercent?: number;
    DiscountAccountRef?: Reference;
}

export interface TaxLineDetail {
    TaxRateRef?: Reference;
    PercentBased?: boolean;
    TaxPercent?: number;
    NetAmountTaxable?: number;
}

export interface TaxDetail {
    TxnTaxCodeRef?: Reference;
    TotalTax?: number;
    TaxLine?: TaxLine[];
}

export interface TaxLine {
    Amount?: number;
    DetailType?: string;
    TaxLineDetail?: TaxLineDetail;
}

export interface DeliveryInfo {
    DeliveryType?: string;
    DeliveryTime?: string;
}

export interface CreateInvoiceDto {
    CustomerRef: Reference;
    Line: InvoiceLine[];
    TxnDate?: string;
    DueDate?: string;
    DocNumber?: string;
    PrivateNote?: string;
    CustomerMemo?: MemoRef;
    BillEmail?: EmailRef;
    ReplyEmailAddress?: string;
    DepartmentRef?: Reference;
    SalesTermRef?: Reference;
    BillAddr?: Address;
    ShipAddr?: Address;
    ShipDate?: string;
    DepositToAccountRef?: Reference;
    PaymentMethodRef?: Reference;
    Notes?: string;
}

export interface UpdateInvoiceDto extends CreateInvoiceDto {
    Id: string;
    SyncToken: string;
}

export interface InvoiceQueryResult {
    startPosition?: number;
    maxResults?: number;
    totalCount?: number;
    invoices: InvoiceData[];
}
