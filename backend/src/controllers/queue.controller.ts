import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { emailQueue, getQueueStats } from '../queues/email.queue.js';

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
};

export class QueueController {
  /**
   * Retrieves live BullMQ statistics
   */
  static async getStatistics(req: AuthenticatedRequest, res: Response) {
    try {
      const stats = await getQueueStats();

      // Get sample of active, delayed, waiting, and failed jobs with safe timeout
      const jobsPromise = Promise.all([
        emailQueue.getJobs(['active'], 0, 9).catch(() => []),
        emailQueue.getJobs(['delayed'], 0, 9).catch(() => []),
        emailQueue.getJobs(['waiting'], 0, 9).catch(() => []),
        emailQueue.getJobs(['failed'], 0, 9).catch(() => []),
      ]);

      const [activeJobs, delayedJobs, waitingJobs, failedJobs] = await withTimeout(
        jobsPromise,
        1500,
        [[], [], [], []]
      );

      const formatJob = (j: any) => ({
        id: j.id,
        name: j.name,
        data: {
          recipientEmail: j.data?.recipientEmail,
          senderEmail: j.data?.senderEmail,
          subject: j.data?.subject,
          emailId: j.data?.emailId,
        },
        delay: j.opts?.delay || 0,
        timestamp: j.timestamp,
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
        failedReason: j.failedReason,
        attemptsMade: j.attemptsMade,
      });

      return res.json({
        success: true,
        stats,
        recentJobs: {
          active: activeJobs.map(formatJob),
          delayed: delayedJobs.map(formatJob),
          waiting: waitingJobs.map(formatJob),
          failed: failedJobs.map(formatJob),
        },
      });
    } catch (err: any) {
      return res.status(200).json({
        success: true,
        stats: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: false },
        recentJobs: { active: [], delayed: [], waiting: [], failed: [] },
      });
    }
  }

  /**
   * Pause the email queue
   */
  static async pauseQueue(req: AuthenticatedRequest, res: Response) {
    try {
      await emailQueue.pause();
      return res.json({ success: true, message: 'Email queue paused successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to pause queue: ${err.message}` });
    }
  }

  /**
   * Resume the email queue
   */
  static async resumeQueue(req: AuthenticatedRequest, res: Response) {
    try {
      await emailQueue.resume();
      return res.json({ success: true, message: 'Email queue resumed successfully' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to resume queue: ${err.message}` });
    }
  }

  /**
   * Clean failed jobs in BullMQ
   */
  static async cleanFailed(req: AuthenticatedRequest, res: Response) {
    try {
      await emailQueue.clean(0, 1000, 'failed');
      return res.json({ success: true, message: 'Cleared failed queue history' });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: `Failed to clean queue: ${err.message}` });
    }
  }
}
