import { describe, it, expect } from 'vitest';
import { scheduleEmailSchema, batchScheduleSchema } from '../src/middleware/validation.middleware.js';

describe('Zod Request Validation Tests', () => {
  it('should accept valid single email scheduling payload', () => {
    const valid = {
      recipientEmail: 'lead@target.com',
      senderEmail: 'outreach@reachinbox.ai',
      subject: 'Quick question regarding your tech stack',
      body: '<p>Hi Lead, wanted to connect!</p>',
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
      delayBetweenEmails: 2500,
      hourlyLimit: 200,
    };

    const parsed = scheduleEmailSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('should reject invalid recipient email address format', () => {
    const invalid = {
      recipientEmail: 'not-an-email-at-all',
      senderEmail: 'outreach@reachinbox.ai',
      subject: 'Hello',
      body: 'Body text',
      scheduledAt: new Date().toISOString(),
    };

    const parsed = scheduleEmailSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toContain('Invalid recipient email address');
    }
  });

  it('should reject missing subject or empty body', () => {
    const missingSubject = {
      recipientEmail: 'lead@target.com',
      senderEmail: 'outreach@reachinbox.ai',
      subject: '',
      body: 'Some body',
      scheduledAt: new Date().toISOString(),
    };

    const parsed = scheduleEmailSchema.safeParse(missingSubject);
    expect(parsed.success).toBe(false);
  });

  it('should validate batch scheduling with multiple recipients', () => {
    const batch = {
      recipients: ['alice@firm.com', 'bob@firm.com', 'carol@firm.com'],
      senderEmail: 'outreach@reachinbox.ai',
      subject: 'Batch Announcement',
      body: 'Important update for founders',
      startTime: new Date().toISOString(),
      delayBetweenEmails: 2000,
      hourlyLimit: 150,
      campaignName: 'Series B Outreach',
    };

    const parsed = batchScheduleSchema.safeParse(batch);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.recipients).toHaveLength(3);
      expect(parsed.data.delayBetweenEmails).toBe(2000);
    }
  });

  it('should reject empty recipients array in batch schedule', () => {
    const emptyBatch = {
      recipients: [],
      senderEmail: 'outreach@reachinbox.ai',
      subject: 'Batch Announcement',
      body: 'Important update',
      startTime: new Date().toISOString(),
    };

    const parsed = batchScheduleSchema.safeParse(emptyBatch);
    expect(parsed.success).toBe(false);
  });
});
