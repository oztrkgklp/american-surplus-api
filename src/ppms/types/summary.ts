export interface PropertyDiskFile {
    data: PropertySummary;
}

export interface PropertySummary {
    propertySearchResultList: PropertySearchResult[];
    propertySearchCategoryCountDTOList: CategoryCount[];
}

export interface PropertySearchResult {
  itemControlNumber: string;
  propertyLocationDTO: PropertyLocation;
  excessReleaseDate: string;
  surplusReleaseDate: string;
  cflReleaseDate: string;
  submittedDate: string;
  submittedBy: string;
  createdBy: null | string;
  itemStatus: string;
  itemName: string;
  fscCode: string;
  fscDescription: string;
  conditionCode: string;
  originalAcquisitionCost: number;
  quantityAvailable: number;
  quantityRequested: number;
  quantityReqByMe: number;
  unitOfIssue: string;
  reimbursementRequired: string;
  fairMarketValue: number | null;
  presignedUrl: string;
  path: string | null;
  fileName: string | null;
  propertyId: number;
  categoryCode: number;
  categoryName: string;
  agencyBureau: string;
  custodianEmail: string;
  pocEmail: string;
  custodianCCEmail: string;
  pocCCEmail: string;
  statusFlag: StatusFlag;
  internal: boolean;
  isRequestedByOrganization?: boolean;
}

export interface PropertyLocation {
    zip: string;
    city: string;
    stateCode: string;
}

export interface StatusFlag {
    itemControlNumber: string | null;
    editFlag: boolean;
    editDocumentsFlag: boolean;
    requests: unknown | null;
}

export interface PropertyCategorySummary {
    propertySearchCategoryCountDTOList: CategoryCount[];
}

export interface CategoryCount {
    categoryName: string;
    categoryCode: number;
    count: number;
    total: number;
}

export interface SummarySearchOptions {
    sortOrder?: 'ASC' | 'DESC';
    categoryCode?: number;
    itemName?: string;
    icn?: string;
    description?: string;
    icnPrefix?: string;
    propertySurplusReleaseDate?: string;
    propertyLocation?: PropertyLocation
    existingPropertyControlNumbers?: string[];
    futureSurplusReleaseDate?: boolean;
    withImagesOnly?: boolean;
}