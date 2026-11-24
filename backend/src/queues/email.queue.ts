import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { EmailJobData, QueueStatistics } from '../types/index.js';

export const EMAIL_QUEUE_NAME = 'email-queue';

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: false,
    removeOnFail: false,
  },
});

export const addEmailJob = async (
  data: EmailJobData,
  delayMs = 0,
  jobId?: string
) => {
  const customJobId = jobId || `email-${data.emailId}`;
  return await emailQueue.add(
    'send-email',
    data,
    {
      jobId: customJobId,
      delay: Math.max(0, delayMs),
    }
  );
};

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
};

export const getQueueStats = async (): Promise<QueueStatistics> => {
  const fallbackStats: QueueStatistics = {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: false,
  };

  try {
    const statsPromise = Promise.all([
      emailQueue.getWaitingCount(),
      emailQueue.getActiveCount(),
      emailQueue.getCompletedCount(),
      emailQueue.getFailedCount(),
      emailQueue.getDelayedCount(),
      emailQueue.isPaused(),
    ]).then(([waiting, active, completed, failed, delayed, isPaused]) => ({
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: isPaused,
    }));

    return await withTimeout(statsPromise, 1200, fallbackStats);
  } catch (err: any) {
    console.warn(`⚠️ Error reading queue stats: ${err.message}`);
    return fallbackStats;
  }
};

export const cancelEmailJob = async (jobId: string): Promise<boolean> => {
  try {
    const job = await emailQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn(`⚠️ Error removing job ${jobId}: ${err.message}`);
    return false;
  }
};

export const retryEmailJob = async (jobId: string): Promise<boolean> => {
  try {
    const job = await emailQueue.getJob(jobId);
    if (job) {
      await job.retry();
      return true;
    }
    return false;
  } catch (err: any) {
    console.warn(`⚠️ Error retrying job ${jobId}: ${err.message}`);
    return false;
  }
};
