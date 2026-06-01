export interface CustomerData {
    Id?: string;
    DisplayName: string;
    CompanyName?: string;
    GivenName?: string;
    FamilyName?: string;
    PrintOnCheckName?: string;
    Active?: boolean;
    PrimaryPhone?: PhoneNumber;
    AlternatePhone?: PhoneNumber;
    Mobile?: PhoneNumber;
    Fax?: PhoneNumber;
    PrimaryEmailAddr?: EmailAddress;
    WebAddr?: WebAddress;
    BillAddr?: Address;
    ShipAddr?: Address;
    Job?: boolean;
    BillWithParent?: boolean;
    ParentRef?: Reference;
    Level?: number;
    SalesTermRef?: Reference;
    TaxExemptionReasonId?: number;
    Taxable?: boolean;
    Notes?: string;
    JobInfo?: JobInfo;
    MetaData?: MetaData;
    SyncToken?: string;
    domain?: string;
}

export interface PhoneNumber {
    FreeFormNumber?: string;
}

export interface EmailAddress {
    Address?: string;
}

export interface WebAddress {
    URI?: string;
}

export interface Address {
    Line1?: string;
    Line2?: string;
    Line3?: string;
    Line4?: string;
    Line5?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
    Lat?: string;
    Long?: string;
}

export interface Reference {
    value: string;
    name?: string;
}

export interface JobInfo {
    Status?: string;
    StartDate?: string;
    ProjectedEndDate?: string;
    EndDate?: string;
    Description?: string;
    TypeRef?: Reference;
}

export interface MetaData {
    CreateTime?: string;
    LastUpdatedTime?: string;
}

export interface CreateCustomerDto {
    DisplayName: string;
    CompanyName?: string;
    GivenName?: string;
    FamilyName?: string;
    PrintOnCheckName?: string;
    Active?: boolean;
    PrimaryPhone?: PhoneNumber;
    AlternatePhone?: PhoneNumber;
    Mobile?: PhoneNumber;
    Fax?: PhoneNumber;
    PrimaryEmailAddr?: EmailAddress;
    WebAddr?: WebAddress;
    BillAddr?: Address;
    ShipAddr?: Address;
    Job?: boolean;
    BillWithParent?: boolean;
    ParentRef?: Reference;
    SalesTermRef?: Reference;
    TaxExemptionReasonId?: number;
    Taxable?: boolean;
    Notes?: string;
    JobInfo?: JobInfo;
}

export interface UpdateCustomerDto extends CreateCustomerDto {
    Id: string;
    SyncToken: string;
}

export interface CustomerQueryResult {
    startPosition?: number;
    maxResults?: number;
    totalCount?: number;
    customers: CustomerData[];
}
