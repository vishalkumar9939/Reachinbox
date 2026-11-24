export type EmailStatusType =
  | 'SCHEDULED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
  createdAt: string;
}

export interface Email {
  id: string;
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatusType;
  failureReason?: string | null;
  messageId?: string | null;
  previewUrl?: string | null;
  idempotencyKey: string;
  jobId?: string | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  campaign?: {
    name: string;
  } | null;
}

export interface EmailCampaign {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  totalRecipients: number;
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  status: string;
  createdAt: string;
}

export interface QueueStatistics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface RecentJob {
  id: string;
  name: string;
  data: {
    recipientEmail: string;
    senderEmail: string;
    subject: string;
    emailId: string;
  };
  delay: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  attemptsMade: number;
}

export interface DashboardStats {
  totalScheduled: number;
  totalSent: number;
  totalFailed: number;
  totalQueued: number;
  hourlyUsage: number;
  hourlyLimit: number;
  remainingThisHour: number;
  resetsAt: string;
}

export interface SlackIntegrationStatus {
  connected: boolean;
  configuredInEnv: boolean;
  integration?: {
    id: string;
    teamName: string | null;
    channelName: string | null;
    connectedAt: string;
  } | null;
}
