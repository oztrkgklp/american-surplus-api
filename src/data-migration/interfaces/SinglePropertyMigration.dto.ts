export interface SinglePropertyMigrationDto {
    id: number; //LEGACY PROP DATA ID,
    propertyStatus: string; // DEFINITIVE FOR COMPLIANCE STUF
    tcn?: string;
    request_status?: string;
    doneeAccountNumber?: string;
    propertyName?: string;
    propertyType?: string;
    propertyDescription?: string;
    propertyJustification?: string;
    propertyJustificationExtended?: string | null;
    propertyQuantity?: number;
    originalValue?: number;
    totalValue?: number;
    fairMarketValue?: number;
    disposalCondition?: string;
    supplyCondition?: string;
    demilCondition?: string;
    surplusReleaseDate?: number;
    allocatedDate?: number;
    reimbursable?: boolean;
    surplusReviewComments?: string;
    locationAddressOne?: string;
    locationAddressTwo?: string;
    locationAddressThree?: string;
    locationCity?: string;
    locationRegionState?: string;
    locationPostalCode?: string;
    pocName?: string;
    custodianName?: string;
    requestor?: string;
    propertyControlNumber?: string;
    complianceDetails: LegacyComplianceDetails
}

interface LegacyComplianceDetails {
    term_start: number;
    term_end: number;
    period_months: number;
    term_months: number;
    next_reporting_date: number;
}