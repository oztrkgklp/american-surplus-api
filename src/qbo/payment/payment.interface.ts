import { MetaData, Reference } from "../customer/customer.interface";

export interface PaymentData {
    Id?: string;
    SyncToken?: string;
    domain?: string;
    sparse?: boolean;
    MetaData?: MetaData;
    CustomerRef?: Reference;
    DepositToAccountRef?: Reference;
    PaymentMethodRef?: Reference;
    ARAccountRef?: Reference;
    CurrencyRef?: Reference;
    ProcessPayment?: boolean;
    PrivateNote?: string;
    TxnDate?: string;
    TotalAmt?: number;
    UnappliedAmt?: number;
    Line?: PaymentLine[];
}

export interface PaymentLine {
    Amount?: number;
    LinkedTxn?: LinkedTxn[];
}

export interface LinkedTxn {
    TxnId?: string;
    TxnType?: string;
}

export interface PaymentQueryResult {
    startPosition?: number;
    maxResults?: number;
    totalCount?: number;
    payments: PaymentData[];
}
