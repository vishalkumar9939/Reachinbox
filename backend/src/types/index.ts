export type EmailStatusType =
  | 'SCHEDULED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export interface EmailJobData {
  emailId: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  campaignId?: string;
  hourlyLimit?: number;
  delayBetweenEmails?: number;
  idempotencyKey: string;
  scheduledAt: string;
}

export interface UserPayload {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
}

export interface AuthRequestUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  resetTime: Date;
  retryAfterMs: number;
}

export interface EmailFilterQuery {
  page?: number;
  limit?: number;
  status?: EmailStatusType;
  search?: string;
  senderEmail?: string;
  campaignId?: string;
  startDate?: string;
  endDate?: string;
}

export interface QueueStatistics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}
