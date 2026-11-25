import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { EMAIL_QUEUE_NAME, emailQueue } from '../queues/email.queue.js';
import { EmailJobData } from '../types/index.js';
import { RateLimitService } from '../services/rate-limit.service.js';
import { mailService } from '../integrations/ethereal.service.js';
import { ElasticsearchService } from '../services/elasticsearch.service.js';
import { emitToUser } from '../socket/index.js';
import { SlackService } from '../integrations/slack.service.js';

console.log(`🚀 Initializing ReachInbox Email Worker with concurrency: ${env.WORKER_CONCURRENCY}`);

export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const data = job.data;
    const { emailId, userId, senderEmail, recipientEmail, subject, body, campaignId, hourlyLimit } = data;

    console.log(`[Worker] Picked up job ${job.id} for email ${emailId} -> ${recipientEmail}`);

    // Step 1: Idempotency & Eligibility Check in Database
    const emailRecord = await prisma.email.findUnique({
      where: { id: emailId },
    });

    if (!emailRecord) {
      console.warn(`[Worker] Email record ${emailId} not found in database. Skipping.`);
      return { skipped: true, reason: 'Record not found' };
    }

    if (emailRecord.status === 'SENT') {
      console.log(`[Worker] Email ${emailId} is already marked as SENT. Idempotency safeguard applied.`);
      return { skipped: true, reason: 'Already sent' };
    }

    if (emailRecord.status === 'CANCELLED') {
      console.log(`[Worker] Email ${emailId} was CANCELLED by user. Skipping.`);
      return { skipped: true, reason: 'Cancelled' };
    }

    // Step 2: Check Hourly Rate Limiting
    // Uses sender/global throughput limit (default 200/hr) without any per-recipient limitation.
    // If a custom hourlyLimit is set to <= 0 or not provided, it falls back to MAX_EMAILS_PER_HOUR.
    const effectiveLimit = hourlyLimit && hourlyLimit > 0 ? hourlyLimit : env.MAX_EMAILS_PER_HOUR;
    const rateLimitCheck = await RateLimitService.checkAndIncrementHourlyLimit(
      senderEmail,
      effectiveLimit
    );

    if (!rateLimitCheck.allowed) {
      console.warn(
        `⏳ Hourly rate limit reached for ${senderEmail} (${rateLimitCheck.currentCount}/${rateLimitCheck.limit}). Deferring job to next hour.`
      );

      // Reschedule to next hour window
      await emailQueue.add('send-email', data, {
        delay: rateLimitCheck.retryAfterMs,
        jobId: `email-${emailId}-retry-${Date.now()}`,
      });

      // Notify user via Socket.IO
      emitToUser(userId, 'email:rate-limited', {
        emailId,
        recipientEmail,
        senderEmail,
        limit: rateLimitCheck.limit,
        currentUsage: rateLimitCheck.currentCount,
        resumesAt: rateLimitCheck.resetTime,
      });

      // Send Slack Alert if Slack integration is active
      try {
        await SlackService.sendRateLimitAlert({
          userId,
          senderEmail,
          hourlyLimit: rateLimitCheck.limit,
          currentUsage: rateLimitCheck.currentCount,
          resumesAt: rateLimitCheck.resetTime,
        });
      } catch (slackErr: any) {
        console.warn(`⚠️ Slack rate-limit alert failed: ${slackErr.message}`);
      }

      return {
        deferred: true,
        reason: 'Rate limit reached',
        resumesAt: rateLimitCheck.resetTime,
      };
    }

    // Step 3: Update DB to PROCESSING
    await prisma.email.update({
      where: { id: emailId },
      data: { status: 'PROCESSING' },
    });

    emitToUser(userId, 'email:processing', { emailId, recipientEmail, subject });

    // Step 4: Apply minimum delay if configured
    const delayMs = data.delayBetweenEmails ?? env.MIN_EMAIL_DELAY_MS;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 5000)));
    }

    // Step 5: Send Email through Nodemailer / Ethereal SMTP
    try {
      const sendResult = await mailService.sendMail({
        from: senderEmail,
        to: recipientEmail,
        subject,
        html: body,
      });

      const sentTime = new Date();

      // Step 6: Update database status to SENT
      const updated = await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: sentTime,
          messageId: sendResult.messageId,
          previewUrl: sendResult.previewUrl,
          failureReason: null,
        },
      });

      // Step 7: Index in Elasticsearch
      await ElasticsearchService.indexEmail({
        id: updated.id,
        userId: updated.userId,
        senderEmail: updated.senderEmail,
        recipientEmail: updated.recipientEmail,
        subject: updated.subject,
        body: updated.body,
        status: 'SENT',
        scheduledAt: updated.scheduledAt,
        sentAt: sentTime,
        createdAt: updated.createdAt,
      });

      // Step 8: Emit real-time event to user's dashboard
      emitToUser(userId, 'email:sent', {
        emailId: updated.id,
        recipientEmail: updated.recipientEmail,
        subject: updated.subject,
        sentAt: sentTime,
        previewUrl: sendResult.previewUrl,
        campaignId,
      });

      console.log(`✅ [Worker] Email ${emailId} successfully sent to ${recipientEmail}`);
      return { success: true, messageId: sendResult.messageId, previewUrl: sendResult.previewUrl };
    } catch (err: any) {
      console.error(`❌ [Worker] Error sending email ${emailId}: ${err.message}`);

      const failureReason = err.message || 'Unknown SMTP error';

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'FAILED',
          failureReason,
          retryCount: { increment: 1 },
        },
      });

      // Index failure in Elasticsearch
      await ElasticsearchService.indexEmail({
        id: emailRecord.id,
        userId: emailRecord.userId,
        senderEmail: emailRecord.senderEmail,
        recipientEmail: emailRecord.recipientEmail,
        subject: emailRecord.subject,
        body: emailRecord.body,
        status: 'FAILED',
        scheduledAt: emailRecord.scheduledAt,
        sentAt: null,
        createdAt: emailRecord.createdAt,
      });

      emitToUser(userId, 'email:failed', {
        emailId,
        recipientEmail,
        subject,
        failureReason,
      });

      throw err; // Allow BullMQ retry strategy to operate
    }
  },
  {
    connection: redis,
    concurrency: env.WORKER_CONCURRENCY,
    limiter: {
      max: env.MAX_EMAILS_PER_HOUR,
      duration: 3600000,
    },
  }
);

emailWorker.on('completed', (job: Job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

emailWorker.on('failed', (job: Job | undefined, err: Error) => {
  console.error(`[Worker] Job ${job?.id} failed permanently: ${err.message}`);
});

emailWorker.on('error', (err: Error) => {
  console.error(`[Worker] Worker error: ${err.message}`);
});
