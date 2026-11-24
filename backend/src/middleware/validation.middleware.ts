import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export const validateBody = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = await schema.parseAsync(req.body);
      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }
  };
};

export const validateQuery = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = (await schema.parseAsync(req.query)) as any;
      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: 'Query parameter validation failed',
          errors: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ success: false, message: 'Invalid query parameters' });
    }
  };
};

export const scheduleEmailSchema = z.object({
  recipientEmail: z.string().email('Invalid recipient email address'),
  senderEmail: z.string().email('Invalid sender email address'),
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.string().min(1, 'Email body is required'),
  scheduledAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid scheduled date-time format',
  }),
  delayBetweenEmails: z.number().int().nonnegative().optional().default(2000),
  hourlyLimit: z.number().int().positive().optional().default(200),
  idempotencyKey: z.string().optional(),
});

export const batchScheduleSchema = z.object({
  recipients: z
    .array(z.string().email('Invalid email in list'))
    .min(1, 'At least one recipient is required'),
  senderEmail: z.string().email('Invalid sender email'),
  subject: z.string().min(1, 'Subject is required').max(255),
  body: z.string().min(1, 'Email body is required'),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start time format',
  }),
  delayBetweenEmails: z.number().int().nonnegative().default(2000),
  hourlyLimit: z.number().int().positive().default(200),
  campaignName: z.string().optional().default('Standard Campaign'),
});

export const searchEmailSchema = z.object({
  q: z.string().optional(),
  status: z
    .enum(['SCHEDULED', 'QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'])
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
});
