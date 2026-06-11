import 'reflect-metadata';
import { estypes } from '@elastic/elasticsearch';
import { EsRepository } from '@/elasticsearch/repository/EsRepository';
import { PropertyDetailsEntity } from '@/elasticsearch/entities/propertyDetails.entity';
import { elasticsearchClient } from '@/utils/elasticsearch';
import { ElasticsearchIndex } from '@/utils/elasticsearch';
import { AppError } from '@/utils/response/appError';
import { formatDateForElasticsearchDateField } from '@/utils/timeHelper';
import { getLogger } from '@/utils/logger';
import {
  PropertyDetails,
  PropertyContact,
  PropertyLocation,
  PropertyStatus,
} from '@/ppms/types/propertyDetails';

const logger = getLogger('PropertyDetailsRepository');

/** True when a terms (or similar) aggregation returned at least one bucket. */
function hasAggregationBuckets(
  aggregations: estypes.AggregationsAggregate | Record<string, estypes.AggregationsAggregate> | undefined
): boolean {
  if (!aggregations || typeof aggregations !== 'object') return false;
  return Object.values(aggregations).some((agg) => {
    if (agg && typeof agg === 'object' && 'buckets' in agg) {
      const buckets = (agg as { buckets?: unknown[] }).buckets;
      return Array.isArray(buckets) && buckets.length > 0;
    }
    return false;
  });
}

function hasNoResults<T>(result: estypes.SearchResponse<T>): boolean {
  // size: 0 aggregation queries return no hits by design; use aggs instead.
  if (hasAggregationBuckets(result.aggregations)) {
    return false;
  }

  const total = result.hits.total;
  const count = typeof total === 'number' ? total : total?.value ?? 0;
  const hits = result.hits.hits ?? [];
  if (count === 0) return true;
  if (hits.length === 0) return true;

  const hasUsableHit = hits.some((hit) => {
    const source = (hit as { _source?: Record<string, unknown> })._source;
    const propertyData = source?.property_data;
    if (propertyData == null || typeof propertyData !== 'object') return false;
    return Object.keys(propertyData).length > 0;
  });

  return !hasUsableHit;
}

/**
 * Search options for property search (aligned with summary API).
 * Used by the details index as the single source for search.
 */
export interface PropertySummarySearchOptions {
  search?: string;
  itemName?: string;
  fscDescription?: string;
  categoryName?: string;
  make?: string;
  model?: string;
  manufacturer?: string;
  reimbursementRequired?: boolean;
  conditionCode?: string | string[];
  stateCode?: string | string[];
  zip?: string | string[];
  city?: string | string[];
  categoryCode?: number | number[];
  agencyBureau?: string;
  isInternal?: boolean;
  withImagesOnly?: boolean;
  latitude?: number;
  longitude?: number;
  radiusMiles?: number;
  submittedDateFrom?: string;
  submittedDateTo?: string;
  surplusReleaseDateFrom?: string;
  surplusReleaseDateTo?: string;
  page?: number;
  limit?: number;
  sortField?: string;
  sortOrder?: 'ASC' | 'DESC';
  propertyIds?: string[];
}

/**
 * Property Details repository for Elasticsearch operations.
 * Single index for property search; query builder aligned with summary behavior.
 */

export class PropertyDetailsRepository extends EsRepository<PropertyDetailsEntity> {
  constructor() {
    super(PropertyDetailsEntity);
  }

  /**
   * Search with fallback: try PROPERTY_DETAILS_SERVICE first, then PROPERTY_DETAILS if no results.
   * Only used for property details entity.
   */
  override async search(
    query: Omit<estypes.SearchRequest, 'index'>
  ): Promise<estypes.SearchResponse<PropertyDetailsEntity>> {
    try {
      const { index: _, ...queryBody } = query as estypes.SearchRequest;
      const finalQuery = {
        ...queryBody,
        size: queryBody.size ?? 100,
      };

      const primaryResult = await elasticsearchClient.esClient.search<PropertyDetailsEntity>({
        ...finalQuery,
        index: ElasticsearchIndex.PROPERTY_DETAILS_SERVICE,
      });

      if (!hasNoResults(primaryResult)) {
        return primaryResult;
      }

      const fallbackResult = await elasticsearchClient.esClient.search<PropertyDetailsEntity>({
        ...finalQuery,
        index: ElasticsearchIndex.PROPERTY_DETAILS,
      });

      if (hasNoResults(fallbackResult)) {
        logger.debug('Property details: no results from SERVICE, fallback to DETAILS also empty');
      } else {
        logger.debug('Property details: no results from SERVICE, returned results from DETAILS');
      }

      return fallbackResult;
    } catch (error) {
      logger.error(`Error searching property details (with fallback):`, error);
      throw new AppError(
        500,
        `Error searching property details: ${error?.toString() || 'Unknown error'}`
      );
    }
  }

  /**
   * Search property details with multiple criteria. Returns entities and total for pagination.
   */
  async searchPropertyDetails(options: PropertySummarySearchOptions): Promise<{ entities: PropertyDetailsEntity[]; total: number }> {
    try {
      const query = this.buildSearchQuery(options);
      const result = (await this.search(query)) as estypes.SearchResponse<PropertyDetailsEntity>;
      const entities = result.hits.hits
        .filter(
          (hit): hit is estypes.SearchHit<PropertyDetailsEntity> => hit._source !== undefined
        )
        .map((hit) => hit._source!);
      const total =
        typeof result.hits.total === 'number'
          ? result.hits.total
          : result.hits.total?.value ?? 0;
      return { entities, total };
    } catch (error) {
      logger.error(`Error in searchPropertyDetails: ${error}`);
      throw new AppError(
        500,
        `Error searching property details: ${error?.toString() || 'Unknown error'}`
      );
    }
  }

  /**
   * Build wildcard queries for general search (item_name, description, icn) - aligned with summary.
   */
  private buildWildcardQueriesForSearchTerm(searchTerm: string): any[] {
    const queries: any[] = [];
    const trimmed = searchTerm.trim();
    const icnTerm = searchTerm.replace(/-/g, '').trim();
    if (icnTerm) {
      queries.push(...this.buildWildcardQueriesForField(icnTerm, 'icn'));
    }
    queries.push(...this.buildWildcardQueriesForField(trimmed, 'item_name'));
    queries.push(...this.buildWildcardQueriesForField(trimmed, 'description'));
    return queries;
  }

  private buildGeneralSearchFilter(search: string): any {
    const shouldQueries = this.buildWildcardQueriesForSearchTerm(search.trim());
    return {
      bool: { should: shouldQueries, minimum_should_match: 1 },
    };
  }

  /**
   * Build item name filter using wildcard per word (aligned with summary).
   */
  private buildItemNameFilter(itemName: string): any {
    const itemNameQueries = this.buildWildcardQueriesForField(itemName.trim(), 'item_name');
    return {
      bool: { should: itemNameQueries, minimum_should_match: 1 },
    };
  }

  /**
   * Build FSC/description filter (aligned with summary fsc_description).
   */
  private buildFscDescriptionFilter(fscDescription: string): any {
    const queries = this.buildWildcardQueriesForField(fscDescription.trim(), 'description');
    return {
      bool: { should: queries, minimum_should_match: 1 },
    };
  }

  /**
   * Build category name filter - use property_data.categoryName (aligned with summary).
   */
  private buildCategoryNameFilter(categoryName: string): any {
    const queries = this.buildWildcardQueriesForField(
      categoryName.trim(),
      'property_data.categoryName'
    );
    return {
      bool: { should: queries, minimum_should_match: 1 },
    };
  }

  /**
   * Build description filter (legacy single wildcard)
   */
  private buildDescriptionFilter(description: string): any {
    return {
      wildcard: {
        description: { value: `*${description.toLowerCase()}*`, case_insensitive: true },
      },
    };
  }

  /**
   * Build make filter
   */
  private buildMakeFilter(make: string): any {
    const makeQueries = this.buildWildcardQueriesForField(make, 'property_data.make');
    return {
      bool: { should: makeQueries, minimum_should_match: 1, },
    };
  }

  /**
   * Build model filter
   */
  private buildModelFilter(model: string): any {
    const modelQueries = this.buildWildcardQueriesForField(model, 'property_data.model');
    return {
      bool: { should: modelQueries, minimum_should_match: 1, },
    };
  }

  /**
   * Build manufacturer filter
   */
  private buildManufacturerFilter(manufacturer: string): any {
    const manufacturerQueries = this.buildWildcardQueriesForField(manufacturer, 'property_data.manufacturer');
    return {
      bool: { should: manufacturerQueries, minimum_should_match: 1, },
    };
  }

  /**
   * Build category filter
   */
  private buildCategoryFilter(category: string): any {
    return {
      wildcard: {
        'category.keyword': { value: `*${category.toLowerCase()}*`, case_insensitive: true, },
      },
    };
  }

  /**
   * Build condition code filter using wildcard (aligned with summary).
   */
  private buildConditionCodeFilter(conditionCode: string | string[]): any {
    const conditionCodes = Array.isArray(conditionCode) ? conditionCode : [conditionCode];
    if (conditionCodes.length === 1) {
      return {
        wildcard: {
          condition: { value: conditionCodes[0], case_insensitive: true },
        },
      };
    }
    return {
      bool: {
        should: conditionCodes.map((code) => ({
          wildcard: {
            condition: { value: code, case_insensitive: true },
          },
        })),
        minimum_should_match: 1,
      },
    };
  }

  /**
   * Build zip filter using wildcards (aligned with summary).
   */
  private buildZipFilter(zip: string | string[]): any[] {
    const filterQueries: any[] = [];
    const zips = Array.isArray(zip) ? zip : [zip];

    const zipWildcard = (code: string) => ({
      wildcard: {
        'location.zip': { value: code, case_insensitive: true },
      },
    });

    if (zips.length === 1) {
      filterQueries.push(zipWildcard(zips[0]));
    } else {
      filterQueries.push({
        bool: {
          should: zips.map((z) => zipWildcard(z)),
          minimum_should_match: 1,
        },
      });
    }
    return filterQueries;
  }

  /**
   * Build city filter using wildcards (aligned with summary).
   */
  private buildCityFilter(city: string | string[]): any[] {
    const filterQueries: any[] = [];
    const cities = Array.isArray(city) ? city : [city];

    const cityWildcard = (value: string) => ({
      term: {
        'location.city.keyword': { value, case_insensitive: true },
      },
    });

    if (cities.length === 1) {
      filterQueries.push(cityWildcard(cities[0]));
    } else {
      filterQueries.push({
        bool: {
          should: cities.map((c) => cityWildcard(c)),
          minimum_should_match: 1,
        },
      });
    }
    return filterQueries;
  }

  /**
   * Build state code filter with WA/DC handling using wildcards (aligned with summary).
   */
  private buildStateCodeFilter(stateCode: string | string[]): any[] {
    const filterQueries: any[] = [];
    const stateCodes = Array.isArray(stateCode) ? stateCode : [stateCode];
    const hasWA = stateCodes.some((c) => c?.toString().toUpperCase() === 'WA');
    const hasDC = stateCodes.some((c) => c?.toString().toUpperCase() === 'DC');
    const processedStateCodes = stateCodes.map((c) =>
      c?.toString().toUpperCase() === 'WA' ? 'DC' : c
    );
    const uniqueStateCodes = Array.from(new Set(processedStateCodes));

    const stateCodeWildcard = (code: string) => ({
      wildcard: {
        'location.stateCode': { value: code, case_insensitive: true },
      },
    });
    const cityWildcard = (value: string) => ({
      wildcard: {
        'location.city': { value, case_insensitive: true },
      },
    });

    if (uniqueStateCodes.length === 1) {
      const stateCodeQuery = stateCodeWildcard(uniqueStateCodes[0]);
      if (hasWA) {
        filterQueries.push({
          bool: {
            must: [stateCodeQuery, cityWildcard('Washington')],
          },
        });
      } else if (hasDC) {
        filterQueries.push({
          bool: {
            must: [stateCodeQuery],
            must_not: [cityWildcard('Washington')],
          },
        });
      } else {
        filterQueries.push(stateCodeQuery);
      }
    } else {
      const shouldQueries: any[] = [];
      for (const code of stateCodes) {
        const codeUpper = code?.toString().toUpperCase();
        if (codeUpper === 'WA') {
          shouldQueries.push({
            bool: {
              must: [stateCodeWildcard('DC'), cityWildcard('Washington')],
            },
          });
        } else if (codeUpper === 'DC') {
          shouldQueries.push({
            bool: {
              must: [stateCodeWildcard('DC')],
              must_not: [cityWildcard('Washington')],
            },
          });
        } else {
          shouldQueries.push(stateCodeWildcard(code));
        }
      }
      filterQueries.push({
        bool: { should: shouldQueries, minimum_should_match: 1 },
      });
    }
    return filterQueries;
  }

  /**
   * Build category code filter; supports single or multiple codes (aligned with summary).
   */
  private buildCategoryCodeFilter(categoryCode: number | number[]): any {
    const codes = Array.isArray(categoryCode) ? categoryCode : [categoryCode];
    if (codes.length === 1) {
      return { term: { 'property_data.categoryCode': codes[0] } };
    }
    return { terms: { 'property_data.categoryCode': codes } };
  }

  /**
   * Build with-images-only filter (documents that have at least one image in uploadItemList).
   * Only allows image types (e.g. jpeg, jpg, png) by checking string inclusion in itemType.
   */
  private buildWithImagesOnlyFilter(): any {
    return {
      script: {
        script: {
          // Use .keyword subfield: itemType is mapped as text; doc[] in Painless requires keyword (doc values)
          source: [
            'def types = doc["property_data.uploadItemList.itemType.keyword"];',
            "if (types.isEmpty()) return false;",
            "for (String t : types) {",
            '  def lower = t.toLowerCase();',
            '  if (lower.indexOf("jpeg") >= 0 || lower.indexOf("jpg") >= 0 || lower.indexOf("png") >= 0) return true;',
            "}",
            "return false;",
          ].join(' '),
          lang: 'painless',
        },
      },
    };
  }

  /**
   * Build property IDs filter (for consistency with summary API).
   */
  private buildPropertyIdsFilter(propertyIds: string[]): any {
    const numericIds = propertyIds
      .map((id) => parseInt(id, 10))
      .filter((n) => !isNaN(n));
    if (numericIds.length === 0) return { match_none: {} };
    if (numericIds.length === 1) {
      return { term: { 'property_data.propertyId': numericIds[0] } };
    }
    return {
      bool: {
        should: numericIds.map((id) => ({ term: { 'property_data.propertyId': id } })),
        minimum_should_match: 1,
      },
    };
  }

  /**
   * Build agency bureau filter
   */
  private buildAgencyBureauFilter(agencyBureau: string): any {
    return {
      term: { 'property_data.agencyBureau': agencyBureau }
    };
  }

  /**
   * Build property type filter
   */
  private buildPropertyTypeFilter(propertyType: string): any {
    return {
      term: { 'property_data.propertyType': propertyType }
    };
  }

  /**
   * Build is internal filter
   */
  private buildIsInternalFilter(isInternal: boolean): any {
    return {
      term: { 'property_data.isInternal': isInternal }
    };
  }

  /**
   * Build reimbursement required filter (aligned with summary: Y/P vs N).
   */
  private buildReimbursementRequiredFilter(reimbursementRequired: boolean): any {
    const values = reimbursementRequired ? ['Y', 'P'] : ['N'];
    return {
      bool: {
        should: values.map((value) => ({
          wildcard: {
            'property_data.reimbursementRequiredFlag': {
              value,
              case_insensitive: true,
            },
          },
        })),
        minimum_should_match: 1,
      },
    };
  }

  /**
   * Build submitted date filter
   */
  private buildSubmittedDateFilter(submittedDateFrom?: string, submittedDateTo?: string): any {
    const dateRange: any = {};
    if (submittedDateFrom) dateRange.gte = formatDateForElasticsearchDateField(submittedDateFrom);
    if (submittedDateTo) dateRange.lte = formatDateForElasticsearchDateField(submittedDateTo);

    return { range: { 'property_data.submittedDate': dateRange, }, };
  }

  /**
   * Build surplus release date filter
   */
  private buildSurplusReleaseDateFilter(surplusReleaseDateFrom?: string, surplusReleaseDateTo?: string): any {
    // Get today's date in ISO 8601 format (YYYY-MM-DD) for Elasticsearch date field queries
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const dateRange: any = {};

    if (surplusReleaseDateFrom) {
      dateRange.gte = formatDateForElasticsearchDateField(surplusReleaseDateFrom);
    } else {
      // Always ensure we filter for future dates
      dateRange.gte = todayFormatted;
    }

    if (surplusReleaseDateTo) dateRange.lte = formatDateForElasticsearchDateField(surplusReleaseDateTo);

    return { range: { 'property_data.surplusReleaseDate': dateRange } };
  }
  /**
   * Build default surplus release date filter (future dates only)
   */
  private buildDefaultSurplusReleaseDateFilter(): any {
    // Get today's date in ISO 8601 format (YYYY-MM-DD) for Elasticsearch date field queries
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return { range: { 'property_data.surplusReleaseDate': { gte: todayFormatted, }, }, };
  }

  /**
   * Build geo distance filter
   */
  private buildGeoDistanceFilter(latitude: number, longitude: number, radiusMiles: number): any {
    return { geo_distance: { distance: `${radiusMiles}mi`, rt_geo: { lat: latitude, lon: longitude } } };
  }

  /**
   * Build and finalize the Elasticsearch query with sorting and pagination.
   * Handles geo search with runtime mappings if needed.
   */
  private buildFinalQuery(
    mustQueries: any[],
    filterQueries: any[],
    options: PropertySummarySearchOptions
  ): any {
    // Build the final query
    const query: any = { query: { bool: {} } };

    // Geo search with runtime mappings (for geo_distance queries)
    // This needs to be handled first to ensure proper query structure
    if (options.latitude && options.longitude && options.radiusMiles) {
      query.runtime_mappings = {
        rt_geo: {
          type: 'geo_point',
          script: {
            source:
              "if (doc['location.latitude'].size()!=0 && doc['location.longitude'].size()!=0) { emit(doc['location.latitude'].value, doc['location.longitude'].value); } else if (doc['property_data.propertyLocation.latitude'].size()!=0 && doc['property_data.propertyLocation.longitude'].size()!=0) { emit(doc['property_data.propertyLocation.latitude'].value, doc['property_data.propertyLocation.longitude'].value); }",
          },
        },
      };

      // Add geo distance sort (takes precedence over regular sort field)
      query.sort = [{
        _geo_distance: {
          rt_geo: { lat: options.latitude, lon: options.longitude },
          order: (options.sortOrder?.toLowerCase() === 'desc' ? 'desc' : 'asc') as estypes.SortOrder,
          unit: 'mi' as estypes.DistanceUnit,
        },
      }];
    }

    if (mustQueries.length > 0) query.query.bool.must = mustQueries;
    if (filterQueries.length > 0) query.query.bool.filter = filterQueries;

    // If no must queries and no filter queries, add match_all
    if (mustQueries.length === 0 && filterQueries.length === 0) {
      query.query = { match_all: {} };
    } else if (mustQueries.length === 0) {
      query.query.bool.must = { match_all: {} };
    }

    // Add sorting (only if geo sort wasn't already added)
    // Default to metadata.generated_at DESC (newest to oldest) if no sortField specified
    // If sortField is provided, use it with the specified sortOrder
    if (!query.sort) {
      if (options.sortField) {
        query.sort = [{ [options.sortField]: { order: options.sortOrder || 'DESC' } }];
      } else {
        // Default sorting by metadata.generated_at (newest to oldest)
        // If metadata.generated_at doesn't exist in propertyDetails, use timestamp as fallback
        query.sort = [{ timestamp: { order: options.sortOrder || 'DESC', missing: '_last' }, },];
      }
    }

    // Add pagination
    if (options.limit !== undefined) {
      query.size = options.limit;

      if (options.page !== undefined) query.from = (options.page - 1) * options.limit;
    }

    return query;
  }

  /**
   * Build Elasticsearch query based on search options (aligned with summary builder).
   */
  private buildSearchQuery(options?: PropertySummarySearchOptions): any {
    if (!options) return { query: { match_all: {} } };

    const mustQueries: any[] = [];
    const filterQueries: any[] = [];

    // General search (item_name + description + icn)
    if (options.search && options.search.trim()) {
      mustQueries.push(this.buildGeneralSearchFilter(options.search));
    }

    // Text search fields
    if (options.itemName) mustQueries.push(this.buildItemNameFilter(options.itemName));
    if (options.fscDescription) mustQueries.push(this.buildFscDescriptionFilter(options.fscDescription));
    if (options.categoryName) mustQueries.push(this.buildCategoryNameFilter(options.categoryName));
    if (options.make) mustQueries.push(this.buildMakeFilter(options.make));
    if (options.model) mustQueries.push(this.buildModelFilter(options.model));
    if (options.manufacturer) mustQueries.push(this.buildManufacturerFilter(options.manufacturer));

    // Filter fields
    if (
      options.reimbursementRequired !== undefined &&
      options.reimbursementRequired !== null
    ) {
      filterQueries.push(this.buildReimbursementRequiredFilter(options.reimbursementRequired));
    }
    if (options.conditionCode) filterQueries.push(this.buildConditionCodeFilter(options.conditionCode));
    if (options.stateCode) filterQueries.push(...this.buildStateCodeFilter(options.stateCode));
    if (options.zip) filterQueries.push(...this.buildZipFilter(options.zip));
    if (options.city) filterQueries.push(...this.buildCityFilter(options.city));
    if (options.categoryCode) filterQueries.push(this.buildCategoryCodeFilter(options.categoryCode));
    if (options.agencyBureau) filterQueries.push(this.buildAgencyBureauFilter(options.agencyBureau));
    if (options.isInternal !== undefined && options.isInternal !== null) {
      filterQueries.push(this.buildIsInternalFilter(options.isInternal));
    }
    if (options.withImagesOnly) {
      filterQueries.push(this.buildWithImagesOnlyFilter());
    }

    // Date filters
    if (options.submittedDateFrom || options.submittedDateTo) {
      filterQueries.push(
        this.buildSubmittedDateFilter(options.submittedDateFrom, options.submittedDateTo)
      );
    }
    if (options.surplusReleaseDateFrom || options.surplusReleaseDateTo) {
      filterQueries.push(
        this.buildSurplusReleaseDateFilter(
          options.surplusReleaseDateFrom,
          options.surplusReleaseDateTo
        )
      );
    } else {
      // TODO: Uncomment this when we have a way to filter for future surplus release dates
      // filterQueries.push(this.buildDefaultSurplusReleaseDateFilter());
    }

    if (options.propertyIds && options.propertyIds.length > 0) {
      filterQueries.push(this.buildPropertyIdsFilter(options.propertyIds));
    }

    if (options.latitude && options.longitude && options.radiusMiles) {
      filterQueries.push(
        this.buildGeoDistanceFilter(options.latitude, options.longitude, options.radiusMiles)
      );
    }

    return this.buildFinalQuery(mustQueries, filterQueries, options);
  }

  /**
   * Get property IDs that match geo criteria using runtime mappings.
   * Uses the same buildSearchQuery with a subset of PropertySummarySearchOptions (geo + default surplus date filter).
   */
  async getGeoFilteredPropertyIds(latitude: number, longitude: number, radiusMiles: number): Promise<string[]> {
    try {
      const query = this.buildSearchQuery({ latitude, longitude, radiusMiles, sortOrder: 'ASC' });

      // Add specific fields for this query
      query._source = ['property_data.propertyId'];
      query.size = 10000;

      const result = await this.search(query as Omit<estypes.SearchRequest, 'index'>) as estypes.SearchResponse<PropertyDetailsEntity>;

      return result.hits.hits
        .filter((hit) => hit._source !== undefined && hit._source.property_data?.propertyId !== undefined)
        .map((hit) => (hit._source as any).property_data.propertyId.toString());
    } catch (error) {
      throw new AppError(500, `Error getting geo-filtered property IDs: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Get property IDs that match criteria from details index.
   * Supports make, model, manufacturer, and geo search in any combination.
   * Uses the same buildSearchQuery with a subset of PropertySummarySearchOptions.
   */
  async getFilteredPropertyIds(options?: {
    make?: string;
    model?: string;
    manufacturer?: string;
    latitude?: number;
    longitude?: number;
    radiusMiles?: number;
  }): Promise<string[]> {
    try {
      if (!options || Object.keys(options).length === 0) return [];

      const searchOptions: PropertySummarySearchOptions = {
        make: options.make,
        model: options.model,
        manufacturer: options.manufacturer,
        latitude: options.latitude,
        longitude: options.longitude,
        radiusMiles: options.radiusMiles,
        sortOrder: 'ASC',
      };

      const query = this.buildSearchQuery(searchOptions);

      // Add specific fields for this query
      query._source = ['property_data.propertyId'];
      query.size = 10000;

      const result = await this.search(query as Omit<estypes.SearchRequest, 'index'>) as estypes.SearchResponse<PropertyDetailsEntity>

      return result.hits.hits
        .filter((hit) => hit._source !== undefined && hit._source.property_data?.propertyId !== undefined)
        .map((hit) => (hit._source as any).property_data.propertyId.toString());
    } catch (error) {
      throw new AppError(500, `Error getting filtered property IDs: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Get unique condition codes for filtering UI
   */
  async getConditionCodes(): Promise<string[]> {
    try {
      const result = await this.search({
        aggs: { condition_codes: { terms: { field: 'condition', size: 100 } } },
        size: 0,
      }) as estypes.SearchResponse<PropertyDetailsEntity>;

      const agg = result.aggregations?.condition_codes;
      if (agg && 'buckets' in agg && Array.isArray(agg.buckets)) return agg.buckets.map((bucket: any) => bucket.key);

      return [];
    } catch (error) {
      throw new AppError(500, `Error getting condition codes: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Get unique state codes for filtering UI
   */
  async getStateCodes(): Promise<string[]> {
    try {
      const result = await this.search({
        aggs: { state_codes: { terms: { field: 'location.stateCode', size: 100 } }, },
        size: 0,
      }) as estypes.SearchResponse<PropertyDetailsEntity>;

      const agg = result.aggregations?.state_codes;
      if (agg && 'buckets' in agg && Array.isArray(agg.buckets)) return agg.buckets.map((bucket: any) => bucket.key);

      return [];
    } catch (error) { throw new AppError(500, `Error getting state codes: ${error?.toString() || 'Unknown error'}`); }
  }

  /**
   * Get unique agency bureaus for filtering UI
   */
  async getAgencyBureaus(): Promise<string[]> {
    try {
      const result = await this.search({
        aggs: { agency_bureaus: { terms: { field: 'property_data.agencyBureau', size: 100 }, }, },
        size: 0,
      }) as estypes.SearchResponse<PropertyDetailsEntity>;

      const agg = result.aggregations?.agency_bureaus;
      if (agg && 'buckets' in agg && Array.isArray(agg.buckets)) return agg.buckets.map((bucket: any) => bucket.key);

      return [];
    } catch (error) { throw new AppError(500, `Error getting agency bureaus: ${error?.toString() || 'Unknown error'}`); }
  }

  /**
   * Get unique categories for filtering UI (same shape as summary: categoryName, categoryCode, categoryCount).
   * Counts use the same default filters as property search (e.g. future surplus release date only).
   */
  async getCategories(): Promise<
    Array<{ categoryName: string; categoryCode: number; categoryCount: number }>
  > {
    try {
      const { query } = this.buildSearchQuery({});
      const result = (await this.search({
        query,
        aggs: {
          categories: {
            terms: { field: 'property_data.categoryCode', size: 100 },
            aggs: {
              category_name: {
                top_hits: {
                  size: 1,
                  _source: { includes: ['property_data.categoryName'] },
                },
              },
            },
          },
        },
        size: 0,
      })) as estypes.SearchResponse<PropertyDetailsEntity>;

      const agg = result.aggregations?.categories;
      if (agg && 'buckets' in agg && Array.isArray(agg.buckets)) {
        return agg.buckets
          .map((bucket: any) => {
            const categoryName =
              bucket.category_name?.hits?.hits?.[0]?._source?.property_data?.categoryName;
            if (categoryName === undefined || categoryName === null) return null;
            return {
              categoryName: categoryName as string,
              categoryCode: bucket.key as number,
              categoryCount: bucket.doc_count,
            };
          })
          .filter(
            (
              item
            ): item is {
              categoryName: string;
              categoryCode: number;
              categoryCount: number;
            } => item !== null
          );
      }
      return [];
    } catch (error) {
      throw new AppError(
        500,
        `Error getting categories: ${error?.toString() || 'Unknown error'}`
      );
    }
  }

  /**
   * Get property details by ICN (Item Control Number)
   */
  async getPropertyDetailsByIcn(icn: string): Promise<PropertyDetailsEntity | null> {
    try {
      const result = await this.search({ query: { term: { icn: icn } }, size: 1, }) as estypes.SearchResponse<PropertyDetailsEntity>;
      if (result.hits.hits.length === 0 || !result.hits.hits[0]._source)
        return null;

      return result.hits.hits[0]._source as PropertyDetailsEntity;
    } catch (error) {
      throw new AppError(500, `Error getting property details by ICN: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Maps PropertyDetailsEntity to PropertyDetails interface
   * Converts string dates to Date objects and maps nested structures
   */
  mapEntityToPropertyDetails(entity: PropertyDetailsEntity): PropertyDetails {
    const pd = entity.property_data;

    // Helper function to parse date strings to Date objects
    const parseDate = (dateStr: string | null | undefined): Date | null => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    };

    // Map PropertyStatus
    const mapPropertyStatus = (status: typeof pd.propertyStatus): PropertyStatus => ({
      createdAt: parseDate(status.createdAt) || new Date(),
      updatedAt: parseDate(status.updatedAt) || new Date(),
      createdBy: status.createdBy,
      updatedBy: status.updatedBy,
      statusId: status.statusId,
      statusName: status.statusName,
      statusDescription: status.statusDescription,
    });

    // Map PropertyLocation
    const mapPropertyLocation = (location: typeof pd.propertyLocation | typeof pd.reportingAgencyAddress): PropertyLocation => ({
      createdAt: parseDate(location.createdAt) || new Date(),
      updatedAt: parseDate(location.updatedAt) || new Date(),
      createdBy: location.createdBy,
      updatedBy: location.updatedBy,
      addressId: location.addressId,
      line1: location.line1,
      line2: location.line2,
      line3: location.line3,
      city: location.city,
      stateCode: location.stateCode,
      zip: location.zip,
      zip2: null,
      overseasZip: null,
      isDeleted: location.isDeleted,
      instructions: null,
      latitude: location.latitude,
      longitude: location.longitude,
    });

    // Map PropertyContact
    const mapPropertyContact = (contact: typeof pd.propertyPOC | typeof pd.propertyCustodian): PropertyContact => ({
      createdAt: parseDate(contact.createdAt) || new Date(),
      updatedAt: parseDate(contact.updatedAt) || new Date(),
      createdBy: contact.createdBy,
      updatedBy: contact.updatedBy,
      contactId: contact.contactId,
      firstName: contact.firstName,
      lastName: contact.lastName,
      middleName: null,
      email: contact.email,
      ccEmail: contact.ccEmail || null,
      phone: contact.phone,
      fax: contact.fax || 0,
      phoneExtension: null,
      isDeleted: contact.isDeleted,
    });

    return {
      data: {
        createdAt: parseDate(pd.createdAt) || new Date(),
        updatedAt: parseDate(pd.updatedAt) || new Date(),
        createdBy: pd.createdBy,
        updatedBy: pd.updatedBy,
        propertyId: pd.propertyId,
        itemControlNumber: pd.itemControlNumber,
        aacId: pd.aacId,
        agencyBureau: pd.agencyBureau,
        submittedDate: parseDate(pd.submittedDate) || new Date(),
        submittedBy: pd.submittedBy,
        notify_poc: pd.notify_poc,
        propertyRegion: pd.propertyRegion,
        propertyStatus: mapPropertyStatus(pd.propertyStatus),
        airCraft: pd.airCraft ?? null,
        vehicle: pd.vehicle ?? null,
        weapon: pd.weapon ?? null,
        vessel: pd.vessel ?? null,
        computer: pd.computer ?? null,
        trailerHome: pd.trailerHome ?? null,
        reportingAgencyAddress: mapPropertyLocation(pd.reportingAgencyAddress),
        propertyLocation: mapPropertyLocation(pd.propertyLocation),
        propertyPOC: mapPropertyContact(pd.propertyPOC),
        propertyCustodian: mapPropertyContact(pd.propertyCustodian),
        uploadItemList: pd.uploadItemList || [],
        propertyNotes: pd.propertyNotes || [],
        make: pd.make || '',
        model: pd.model || '',
        propertyType: pd.propertyType,
        contractInventoryCode: pd.contractInventoryCode,
        overseasInventoryCode: pd.overseasInventoryCode,
        agencyLocationCode: pd.agencyLocationCode,
        agencyControlNumber: pd.agencyControlNumber,
        amountTobeReimbursed: pd.amountTobeReimbursed,
        manufacturer: pd.manufacturer || '',
        manufactureDate: null,
        federalSalesCenter: pd.federalSalesCenter,
        excessReleaseDate: null,
        internalScreeningStartDate: null,
        surplusReleaseDate: parseDate(pd.surplusReleaseDate) || new Date(),
        cflScreeningStartDate: null,
        cflReleaseDate: null,
        externalScreeningStartDate: parseDate(pd.externalScreeningStartDate) || new Date(),
        availableInSalesDate: null,
        acquisitionDate: null,
        fscCode: pd.fscCode,
        niinCode: pd.niinCode || '',
        itemName: pd.itemName,
        specialDescriptionCode: pd.specialDescriptionCode,
        specialDescriptionText: pd.specialDescriptionText,
        quantity: pd.quantity,
        quantityReported: pd.quantityReported,
        unitOfIssue: pd.unitOfIssue,
        originalAcquisitionCost: pd.originalAcquisitionCost,
        totalAcquisitionCost: pd.totalAcquisitionCost,
        fairMarketValue: null,
        supplyConditionCode: pd.supplyConditionCode || '',
        conditionCode: pd.conditionCode,
        hazardous: pd.hazardous,
        fscapCode: pd.fscapCode,
        demilitarizationCode: pd.demilitarizationCode,
        isDeleted: pd.isDeleted,
        propertyDescription: pd.propertyDescription,
        isSubmitted: pd.isSubmitted,
        notifyCustodian: pd.notifyCustodian,
        valueAddedServices: null,
        isDonation: null,
        isExchangeSale: pd.isExchangeSale,
        reimbursementRequiredFlag: pd.reimbursementRequiredFlag,
        reimbursementCode: null,
        dropAfterInternalScreening: pd.dropAfterInternalScreening,
        withDrawnDate: null,
        withDrawnReason: null,
        withDrawnBy: null,
        rejectedDate: null,
        rejectedReason: null,
        rejectedBy: null,
        destroyedDate: null,
        destroyedReason: null,
        destroyedBy: null,
        categoryCode: pd.categoryCode,
        salesItemName: null,
        categoryName: pd.categoryName,
        sourceCode: pd.sourceCode,
        plantClearanceLineNumber: pd.plantClearanceLineNumber ? Number(pd.plantClearanceLineNumber) : 0,
        plantClearanceReferenceNumber: pd.plantClearanceReferenceNumber || '',
        plantClearanceCaseNumber: pd.plantClearanceCaseNumber || '',
        partNumber: null,
        drmoCode: pd.drmoCode || '',
        propertyCreationSource: pd.propertyCreationSource,
        recipientName: null,
        propertyGroup: pd.propertyGroup,
        donorInfo: null,
        recipientInfo: null,
        actionCode: null,
        salesCenter: null,
        assignedScoEmail: null,
        assignedMktSpclEmail: null,
        nasaItemIndicator: null,
        appraisalInfo: null,
        appraisalAgencyInfo: null,
        giftInfo: null,
        withdrawalComment: null,
        dosApproverName: null,
        dosApprovalDate: null,
        recalledDate: null,
        recalledReason: null,
        recalledBy: null,
        lastInventoryDate: null,
        lastInventoriedBy: null,
        siteStorage: pd.siteStorage || '',
        countryCode: null,
        salesQuantity: null,
        salesUnitOfIssue: null,
        salesOac: null,
        salesTotalOac: null,
        salesPropertyDescription: null,
        count: null,
        oldSrdDate: null,
        isInternal: pd.isInternal,
        quantityRequested: pd.quantityRequested,
        isChangeRequestRequired: null,
        oldSRDValue: null,
        editDocumentsFlag: pd.editDocumentsFlag,
        salesNotes: null,
        categoryCodeCount: null,
        vin: null,
        fgAPOContact: null,
      },
    };
  }
}

export const propertyDetailsRepository = new PropertyDetailsRepository();
