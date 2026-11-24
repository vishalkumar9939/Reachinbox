import { Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { addEmailJob, cancelEmailJob, retryEmailJob } from '../queues/email.queue.js';
import { ElasticsearchService } from '../services/elasticsearch.service.js';
import { RateLimitService } from '../services/rate-limit.service.js';
import { emitToUser } from '../socket/index.js';
import { EmailStatusType } from '../types/index.js';
import { env } from '../config/env.js';

export class EmailController {
  /**
   * Schedule a single email
   */
  static async scheduleSingle(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    const {
      recipientEmail,
      senderEmail,
      subject,
      body,
      scheduledAt,
      delayBetweenEmails = env.MIN_EMAIL_DELAY_MS,
      hourlyLimit = env.MAX_EMAILS_PER_HOUR,
      idempotencyKey,
    } = req.body;

    const parsedScheduledDate = new Date(scheduledAt);
    const now = Date.now();
    const delayMs = Math.max(0, parsedScheduledDate.getTime() - now);

    const key = idempotencyKey || crypto.randomUUID();

    try {
      // 1. Create Email in Database first
      const emailRecord = await prisma.email.create({
        data: {
          userId,
          recipientEmail,
          senderEmail,
          subject,
          body,
          scheduledAt: parsedScheduledDate,
          status: 'SCHEDULED',
          idempotencyKey: key,
        },
      });

      // 2. Add delayed job to BullMQ
      const jobId = `email-${emailRecord.id}`;
      const job = await addEmailJob(
        {
          emailId: emailRecord.id,
          userId,
          recipientEmail,
          senderEmail,
          subject,
          body,
          hourlyLimit,
          delayBetweenEmails,
          idempotencyKey: key,
          scheduledAt: parsedScheduledDate.toISOString(),
        },
        delayMs,
        jobId
      );

      // 3. Update Email record with BullMQ Job ID
      const updatedEmail = await prisma.email.update({
        where: { id: emailRecord.id },
        data: { jobId: job.id },
      });

      // 4. Index in Elasticsearch
      await ElasticsearchService.indexEmail({
        id: updatedEmail.id,
        userId: updatedEmail.userId,
        senderEmail: updatedEmail.senderEmail,
        recipientEmail: updatedEmail.recipientEmail,
        subject: updatedEmail.subject,
        body: updatedEmail.body,
        status: 'SCHEDULED',
        scheduledAt: updatedEmail.scheduledAt,
        sentAt: null,
        createdAt: updatedEmail.createdAt,
      });

      // 5. Emit real-time event to user room
      emitToUser(userId, 'email:scheduled', {
        email: updatedEmail,
        jobId: job.id,
        delayMs,
      });

      return res.status(201).json({
        success: true,
        message: 'Email scheduled successfully',
        email: updatedEmail,
        jobId: job.id,
        delayMs,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: 'An email with this idempotency key has already been scheduled',
        });
      }
      console.error('❌ Failed to schedule email:', err);
      return res.status(500).json({ success: false, message: `Failed to schedule email: ${err.message}` });
    }
  }

  /**
   * Schedule a batch of emails to multiple recipients (e.g. from CSV upload)
   * Staggers delivery according to delayBetweenEmails so sending rate is respected.
   */
  static async scheduleBatch(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    const {
      recipients,
      senderEmail,
      subject,
      body,
      startTime,
      delayBetweenEmails = env.MIN_EMAIL_DELAY_MS,
      hourlyLimit = env.MAX_EMAILS_PER_HOUR,
      campaignName = 'Batch Campaign',
    } = req.body;

    const baseStartTime = new Date(startTime).getTime();
    const now = Date.now();

    try {
      // 1. Create Campaign
      const campaign = await prisma.emailCampaign.create({
        data: {
          userId,
          name: campaignName,
          subject,
          body,
          totalRecipients: recipients.length,
          startTime: new Date(baseStartTime),
          delayBetweenEmails,
          hourlyLimit,
          status: 'SCHEDULED',
        },
      });

      const scheduledEmails = [];

      // 2. Schedule each recipient with calculated staggered delay
      for (let i = 0; i < recipients.length; i++) {
        const recipientEmail = recipients[i];
        const emailScheduledTimestamp = baseStartTime + i * delayBetweenEmails;
        const emailScheduledDate = new Date(emailScheduledTimestamp);
        const delayMs = Math.max(0, emailScheduledTimestamp - now);
        const idempotencyKey = `${campaign.id}-${i}-${recipientEmail}-${Date.now()}`;

        // Create individual email record
        const email = await prisma.email.create({
          data: {
            userId,
            campaignId: campaign.id,
            recipientEmail,
            senderEmail,
            subject,
            body,
            scheduledAt: emailScheduledDate,
            status: 'SCHEDULED',
            idempotencyKey,
          },
        });

        // Add delayed BullMQ job
        const jobId = `email-${email.id}`;
        await addEmailJob(
          {
            emailId: email.id,
            userId,
            campaignId: campaign.id,
            recipientEmail,
            senderEmail,
            subject,
            body,
            hourlyLimit,
            delayBetweenEmails,
            idempotencyKey,
            scheduledAt: emailScheduledDate.toISOString(),
          },
          delayMs,
          jobId
        );

        await prisma.email.update({
          where: { id: email.id },
          data: { jobId },
        });

        // Index in Elasticsearch
        ElasticsearchService.indexEmail({
          id: email.id,
          userId,
          senderEmail,
          recipientEmail,
          subject,
          body,
          status: 'SCHEDULED',
          scheduledAt: emailScheduledDate,
          sentAt: null,
          createdAt: email.createdAt,
        }).catch(() => {});

        scheduledEmails.push(email);
      }

      emitToUser(userId, 'email:scheduled', {
        campaignId: campaign.id,
        count: scheduledEmails.length,
      });

      return res.status(201).json({
        success: true,
        message: `Successfully scheduled ${scheduledEmails.length} emails`,
        campaign,
        scheduledCount: scheduledEmails.length,
      });
    } catch (err: any) {
      console.error('❌ Failed to schedule batch campaign:', err);
      return res.status(500).json({ success: false, message: `Batch scheduling error: ${err.message}` });
    }
  }

  /**
   * Search and filter emails with Elasticsearch + DB fallback
   */
  static async getEmails(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    const { q, status, page = 1, limit = 10 } = req.query as any;

    try {
      const result = await ElasticsearchService.searchEmails({
        userId,
        query: q,
        status: status as EmailStatusType,
        page: Number(page),
        limit: Number(limit),
      });

      return res.json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to retrieve emails: ${err.message}` });
    }
  }

  /**
   * Get single email by ID
   */
  static async getEmailById(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    const { id } = req.params;

    try {
      const email = await prisma.email.findFirst({
        where: { id, userId },
        include: { campaign: true },
      });

      if (!email) {
        return res.status(404).json({ success: false, message: 'Email not found' });
      }

      return res.json({ success: true, email });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Error: ${err.message}` });
    }
  }

  /**
   * Cancel a scheduled email
   */
  static async cancelEmail(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    const { id } = req.params;

    try {
      const email = await prisma.email.findFirst({
        where: { id, userId },
      });

      if (!email) {
        return res.status(404).json({ success: false, message: 'Email record not found' });
      }

      if (email.status === 'SENT') {
        return res.status(400).json({ success: false, message: 'Cannot cancel an email that has already been sent' });
      }

      // Remove from BullMQ queue
      if (email.jobId) {
        await cancelEmailJob(email.jobId);
      }

      // Update in Database
      const updated = await prisma.email.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // Update in Elasticsearch
      ElasticsearchService.indexEmail({
        id: updated.id,
        userId: updated.userId,
        senderEmail: updated.senderEmail,
        recipientEmail: updated.recipientEmail,
        subject: updated.subject,
        body: updated.body,
        status: 'CANCELLED',
        scheduledAt: updated.scheduledAt,
        sentAt: updated.sentAt,
        createdAt: updated.createdAt,
      }).catch(() => {});

      emitToUser(userId, 'email:cancelled', { emailId: id });

      return res.json({
        success: true,
        message: 'Email cancelled successfully',
        email: updated,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to cancel email: ${err.message}` });
    }
  }

  /**
   * Retry a failed email safely without duplicating
   */
  static async retryEmail(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;
    const { id } = req.params;

    try {
      const email = await prisma.email.findFirst({
        where: { id, userId },
      });

      if (!email) {
        return res.status(404).json({ success: false, message: 'Email not found' });
      }

      if (email.status === 'SENT') {
        return res.status(400).json({ success: false, message: 'Email is already sent' });
      }

      // Reset in Database
      const updated = await prisma.email.update({
        where: { id },
        data: {
          status: 'QUEUED',
          failureReason: null,
          scheduledAt: new Date(),
        },
      });

      // Re-enqueue job
      const jobId = `email-${id}-retry-${Date.now()}`;
      await addEmailJob(
        {
          emailId: updated.id,
          userId,
          recipientEmail: updated.recipientEmail,
          senderEmail: updated.senderEmail,
          subject: updated.subject,
          body: updated.body,
          idempotencyKey: `${updated.idempotencyKey}-retry-${Date.now()}`,
          scheduledAt: new Date().toISOString(),
        },
        0,
        jobId
      );

      await prisma.email.update({
        where: { id },
        data: { jobId },
      });

      emitToUser(userId, 'email:retried', { emailId: id });

      return res.json({
        success: true,
        message: 'Email enqueued for retry',
        email: updated,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to retry email: ${err.message}` });
    }
  }

  /**
   * Parse CSV or TXT content on the backend (utility/validation)
   */
  static parseRecipientText(req: AuthenticatedRequest, res: Response) {
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, message: 'Content string is required' });
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
    // Split by commas, semicolons, tabs, newlines
    const rawTokens = content
      .split(/[\r\n,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const validEmails: string[] = [];
    const invalidEmails: string[] = [];
    const seen = new Set<string>();
    let duplicatesCount = 0;

    for (const token of rawTokens) {
      // Remove enclosing quotes or brackets
      const clean = token.replace(/^[<"']+|[>"']+$/g, '').trim();
      if (!clean) continue;

      if (!emailRegex.test(clean)) {
        invalidEmails.push(clean);
      } else {
        const lower = clean.toLowerCase();
        if (seen.has(lower)) {
          duplicatesCount++;
        } else {
          seen.add(lower);
          validEmails.push(lower);
        }
      }
    }

    return res.json({
      success: true,
      totalParsed: rawTokens.length,
      validEmails,
      validCount: validEmails.length,
      invalidEmails,
      invalidCount: invalidEmails.length,
      duplicatesCount,
    });
  }

  /**
   * Main dashboard aggregates and hourly usage
   */
  static async getDashboardOverview(req: AuthenticatedRequest, res: Response) {
    const userId = req.user!.id;

    try {
      const [
        totalScheduled,
        totalSent,
        totalFailed,
        totalQueued,
        hourlyUsage,
        recentEmails,
      ] = await Promise.all([
        prisma.email.count({ where: { userId, status: 'SCHEDULED' } }),
        prisma.email.count({ where: { userId, status: 'SENT' } }),
        prisma.email.count({ where: { userId, status: 'FAILED' } }),
        prisma.email.count({ where: { userId, status: { in: ['QUEUED', 'PROCESSING'] } } }),
        RateLimitService.getHourlyUsage(),
        prisma.email.findMany({
          where: { userId },
          take: 6,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return res.json({
        success: true,
        stats: {
          totalScheduled,
          totalSent,
          totalFailed,
          totalQueued,
          hourlyUsage: hourlyUsage.currentUsage,
          hourlyLimit: hourlyUsage.limit,
          remainingThisHour: hourlyUsage.remaining,
          resetsAt: hourlyUsage.resetTime,
        },
        recentEmails,
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to fetch dashboard stats: ${err.message}` });
    }
  }
}
