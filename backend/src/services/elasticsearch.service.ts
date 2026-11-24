import { getElasticsearchClient, isEsAvailable } from '../config/elasticsearch.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { EmailStatusType } from '../types/index.js';

export interface EmailDocument {
  id: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: EmailStatusType;
  scheduledAt: string | Date;
  sentAt?: string | Date | null;
  createdAt: string | Date;
}

export class ElasticsearchService {
  /**
   * Indexes or updates an email in Elasticsearch.
   * If Elasticsearch is offline, fails silently so background operations continue unimpeded.
   */
  static async indexEmail(email: EmailDocument): Promise<void> {
    const client = getElasticsearchClient();
    if (!client || !isEsAvailable()) {
      return;
    }

    try {
      await client.index({
        index: env.ELASTICSEARCH_INDEX,
        id: email.id,
        document: {
          id: email.id,
          userId: email.userId,
          senderEmail: email.senderEmail,
          recipientEmail: email.recipientEmail,
          subject: email.subject,
          body: email.body,
          status: email.status,
          scheduledAt: new Date(email.scheduledAt).toISOString(),
          sentAt: email.sentAt ? new Date(email.sentAt).toISOString() : null,
          createdAt: new Date(email.createdAt).toISOString(),
        },
        refresh: 'wait_for',
      });
    } catch (err: any) {
      console.warn(`⚠️ Elasticsearch indexing skipped for ${email.id}: ${err.message}`);
    }
  }

  /**
   * Searches emails using Elasticsearch with automatic database fallback.
   */
  static async searchEmails(params: {
    userId: string;
    query?: string;
    status?: EmailStatusType;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 10));
    const offset = (page - 1) * limit;

    const client = getElasticsearchClient();

    // 1. Try Elasticsearch first
    if (client && isEsAvailable()) {
      try {
        const mustClauses: any[] = [{ term: { userId: params.userId } }];

        if (params.status) {
          mustClauses.push({ term: { status: params.status } });
        }

        if (params.query && params.query.trim()) {
          mustClauses.push({
            multi_match: {
              query: params.query.trim(),
              fields: ['recipientEmail^3', 'subject^2', 'body', 'senderEmail'],
              fuzziness: 'AUTO',
            },
          });
        }

        const response = await client.search({
          index: env.ELASTICSEARCH_INDEX,
          from: offset,
          size: limit,
          query: {
            bool: {
              must: mustClauses,
            },
          },
          sort: [{ createdAt: { order: 'desc' } }],
        });

        const hits = response.hits.hits;
        const total = typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

        const emailIds = hits.map((h: any) => h._id);

        // Fetch full rich DB records for the matching IDs to ensure complete relation data
        const emails = await prisma.email.findMany({
          where: { id: { in: emailIds } },
          include: { campaign: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        });

        return {
          emails,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
          source: 'elasticsearch' as const,
        };
      } catch (err: any) {
        console.warn(`⚠️ Elasticsearch search failed, falling back to database: ${err.message}`);
      }
    }

    // 2. Fallback to Prisma Database search
    const whereClause: any = {
      userId: params.userId,
    };

    if (params.status) {
      whereClause.status = params.status;
    }

    if (params.query && params.query.trim()) {
      const q = params.query.trim();
      whereClause.OR = [
        { recipientEmail: { contains: q } },
        { subject: { contains: q } },
        { body: { contains: q } },
        { senderEmail: { contains: q } },
      ];
    }

    const [total, emails] = await Promise.all([
      prisma.email.count({ where: whereClause }),
      prisma.email.findMany({
        where: whereClause,
        include: { campaign: { select: { name: true } } },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      emails,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      source: 'database_fallback' as const,
    };
  }
}
