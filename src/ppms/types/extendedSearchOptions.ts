import { PropertyLocation } from './summary';

/**
 * Extended search options for Elasticsearch-based property search
 * Includes all the new search fields requested
 */
export interface ExtendedPropertySearchOptions {
    // Existing fields from SummarySearchOptions
    sortOrder?: 'ASC' | 'DESC';
    categoryCode?: number;
    itemName?: string;
    icn?: string;
    description?: string;
    icnPrefix?: string;
    propertySurplusReleaseDate?: string;
    propertyLocation?: PropertyLocation;
    existingPropertyControlNumbers?: string[];
    futureSurplusReleaseDate?: boolean;
    withImagesOnly?: boolean;

    // New fields for Elasticsearch search
    reimbursementRequired?: boolean;
    propertyDescription?: string;
    make?: string;
    model?: string;
    manufacturer?: string;
    
    // Geographic search
    latitude?: number;
    longitude?: number;
    radiusMiles?: number;
    
    // State filtering
    stateCode?: string;
    
    // Condition code filtering
    conditionCode?: string;
    
    // Pagination
    page?: number;
    limit?: number;
    
    // Sorting
    sortField?: string;
}
