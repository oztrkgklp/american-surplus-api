import 'reflect-metadata';
import { Client } from '@elastic/elasticsearch';
import { getLogger } from '@/utils/logger';
import envvars from '@/config/envvars';

const logger = getLogger('Elasticsearch');

export enum ElasticsearchIndex {
  PROPERTY_DETAILS_SERVICE = 'ppms-service-details',
  PROPERTY_DETAILS = 'ppms-details',
}

class ElasticsearchUtility {
  private client: Client;

  constructor() {
    const esConfig = envvars.elasticsearch;
    const isLocalDevelopment = envvars.app.environment === 'local_development';

    const clientConfig: any = {
      node: esConfig.node,
      requestTimeout: 30000, // 30 seconds timeout
      pingTimeout: 5000, // 5 seconds for ping
    };

    // Only use cloud/serverless options for remote Elasticsearch targets.
    if (!isLocalDevelopment && esConfig.apiKey) {
      clientConfig.serverMode = 'serverless';
      clientConfig.auth = {
        apiKey: esConfig.apiKey,
      };
    }

    // Add SSL configuration if enabled
    if (!isLocalDevelopment && esConfig.ssl.enabled) {
      clientConfig.ssl = {
        rejectUnauthorized: esConfig.ssl.rejectUnauthorized,
      };
    }

    this.client = new Client(clientConfig);
  }

  get esClient(): Client {
    return this.client;
  }

  async connect(): Promise<void> {
    try {
      const response = await this.client.ping();
      logger.info('Connected to Elasticsearch successfully.');
      logger.info(`Elasticsearch cluster info: ${JSON.stringify(response)}`);
    } catch (error) {
      logger.error('Error connecting to Elasticsearch:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<any> {
    try {
      const response = await this.client.cluster.health();
      return response;
    } catch (error) {
      logger.error('Error checking Elasticsearch health:', error);
      throw error;
    }
  }

  async createIndex(
    indexName: string,
    settings?: any,
    mappings?: any
  ): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: indexName });

      if (!exists) {
        await this.client.indices.create({
          index: indexName,
          body: {
            settings: settings || {},
            mappings: mappings || {},
          },
        });
        logger.info(`Index "${indexName}" created successfully.`);
      } else {
        logger.info(`Index "${indexName}" already exists.`);
      }
    } catch (error) {
      logger.error(`Error creating index "${indexName}":`, error);
      throw error;
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: indexName });

      if (exists) {
        await this.client.indices.delete({ index: indexName });
        logger.info(`Index "${indexName}" deleted successfully.`);
      } else {
        logger.info(`Index "${indexName}" does not exist.`);
      }
    } catch (error) {
      logger.error(`Error deleting index "${indexName}":`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.close();
      logger.info('Elasticsearch client closed successfully.');
    } catch (error) {
      logger.error('Error closing Elasticsearch client:', error);
      throw error;
    }
  }
}

export const elasticsearchClient = new ElasticsearchUtility();
