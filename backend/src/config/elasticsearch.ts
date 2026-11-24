import { Client } from '@elastic/elasticsearch';
import { env } from './env.js';

let esClient: Client | null = null;
let isElasticsearchConnected = false;

try {
  esClient = new Client({
    node: env.ELASTICSEARCH_URL,
    maxRetries: 2,
    requestTimeout: 3000,
  });
} catch (err: any) {
  console.warn(`⚠️ Could not instantiate Elasticsearch client: ${err.message}`);
}

export const getElasticsearchClient = (): Client | null => esClient;

export const checkElasticsearchHealth = async (): Promise<boolean> => {
  if (!esClient) {
    isElasticsearchConnected = false;
    return false;
  }
  try {
    const health = await esClient.cluster.health({}, { requestTimeout: 2000 });
    isElasticsearchConnected = health.status !== 'red';
    return isElasticsearchConnected;
  } catch (err: any) {
    isElasticsearchConnected = false;
    return false;
  }
};

export const isEsAvailable = (): boolean => isElasticsearchConnected;

export const initElasticsearchIndex = async () => {
  if (!esClient) return;

  try {
    const available = await checkElasticsearchHealth();
    if (!available) {
      console.warn('⚠️ Elasticsearch not responding. Graceful fallback mode is ACTIVE.');
      return;
    }

    const indexExists = await esClient.indices.exists({ index: env.ELASTICSEARCH_INDEX });
    if (!indexExists) {
      await esClient.indices.create({
        index: env.ELASTICSEARCH_INDEX,
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderEmail: { type: 'keyword' },
              recipientEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              createdAt: { type: 'date' },
            },
          },
        },
      });
      console.log(`✅ Elasticsearch index created: ${env.ELASTICSEARCH_INDEX}`);
    } else {
      console.log(`ℹ️ Elasticsearch index verified: ${env.ELASTICSEARCH_INDEX}`);
    }
  } catch (err: any) {
    console.warn(`⚠️ Elasticsearch initialization note: ${err.message}. Graceful fallback active.`);
  }
};
