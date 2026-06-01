import 'reflect-metadata';
import { estypes } from '@elastic/elasticsearch';
import { elasticsearchClient } from '@/utils/elasticsearch';
import { AppError } from '@/utils/response/appError';
import { getLogger } from '@/utils/logger';

const logger = getLogger('EsRepository');

/**
 * Base Elasticsearch Repository
 * 
 * Provides common Elasticsearch operations for entities
 */

export abstract class EsRepository<T> {
  protected readonly indexName: string;
  protected readonly entityClass: new () => T;

  constructor(entityClass: new () => T) {
    this.entityClass = entityClass;
    this.indexName = this.getIndexName(entityClass);
  }

  /**
   * Get the index name from entity metadata
   */
  private getIndexName(entityClass: any): string {
    const indexName = Reflect.getMetadata('es:entity', entityClass);
    if (!indexName) throw new Error(`Entity ${entityClass.name} must be decorated with @EsEntity`);

    return indexName;
  }

  /**
   * Search documents in Elasticsearch
   */
  async search(query: Omit<estypes.SearchRequest, 'index'>): Promise<estypes.SearchResponse<T>> {
    try {
      // Ensure index is always this.indexName and never overridden by query
      const { index: _, ...queryBody } = query as estypes.SearchRequest;

      // Set default size if not provided (ES defaults to 10 otherwise)
      const finalQuery = {
        ...queryBody,
        size: queryBody.size ?? 100,
        index: this.indexName,
      };

      const result = await elasticsearchClient.esClient.search<T>(finalQuery);

      return result;
    } catch (error) {
      logger.error(`Error searching ${this.indexName}:`, error);
      throw new AppError(500, `Error searching ${this.indexName}: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Find document by ID
   */
  async findById(id: string): Promise<T | null> {
    try {
      const result = await elasticsearchClient.esClient.get({ index: this.indexName, id: id, });
      return result._source as T;
    } catch (error: any) {
      if (error.statusCode === 404) return null;

      throw new AppError(500, `Error finding document by ID ${id}: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Save document to Elasticsearch
   */
  async save(entity: T): Promise<T> {
    try {
      const id = this.getIdFromEntity(entity);
      const result = await elasticsearchClient.esClient.index({ index: this.indexName, id: id, document: entity, });
      return entity;
    } catch (error) {
      throw new AppError(500, `Error saving document: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Delete document by ID
   */
  async delete(id: string): Promise<void> {
    try {
      await elasticsearchClient.esClient.delete({ index: this.indexName, id: id, });
    } catch (error: any) {
      if (error.statusCode === 404) return; // Document doesn't exist, consider it deleted

      throw new AppError(500, `Error deleting document ${id}: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Find documents with optional query
   */
  async find(query?: Omit<estypes.SearchRequest, 'index'>): Promise<estypes.SearchResponse<T>> {
    try {
      const searchQuery: Omit<estypes.SearchRequest, 'index'> = query || { query: { match_all: {} }, };
      // Ensure index is always this.indexName and never overridden by query
      const { index: _, ...queryBody } = searchQuery as estypes.SearchRequest;

      // Set default size if not provided (ES defaults to 10 otherwise)
      const finalQuery = {
        ...queryBody,
        size: queryBody.size !== undefined ? queryBody.size : 10000,
        index: this.indexName,
      };

      const result = await elasticsearchClient.esClient.search<T>(finalQuery);
      return result;
    } catch (error) {
      throw new AppError(500, `Error finding documents: ${error?.toString() || 'Unknown error'}`);
    }
  }

  /**
   * Get ID from entity using metadata
   */
  private getIdFromEntity(entity: T): string {
    const entityInstance = entity as any;
    const properties = Object.getOwnPropertyNames(entityInstance);

    for (const prop of properties) {
      const isId = Reflect.getMetadata('es:id', entityInstance, prop);
      if (isId) return entityInstance[prop];
    }

    throw new AppError(500, 'Entity must have a property decorated with @EsId');
  }

  /**
   * Build wildcard queries for a search term on a specific field
   * Splits the search term into words and generates wildcard queries for each word
   */
  protected buildWildcardQueriesForField(
    searchTerm: string,
    fieldName: string
  ): any[] {
    // Split search term into individual words
    const words = searchTerm
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => word.toLowerCase());

    const queries: any[] = [];

    // Generate wildcard queries for each word
    for (const word of words) {

      queries.push({ wildcard: { [fieldName]: { value: `*${word}*`, case_insensitive: true, } } });

      queries.push({ wildcard: { [fieldName]: { value: `${word}*`, case_insensitive: true, } } });

      queries.push({ wildcard: { [fieldName]: { value: `*${word}`, case_insensitive: true, } } });

      queries.push({ wildcard: { [fieldName]: { value: word, case_insensitive: true, } } });
    }
    return queries;
  }
}
