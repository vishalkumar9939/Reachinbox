import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// Try loading .env from backend folder or current working directory or root
const candidatePaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  typeof __dirname !== 'undefined' ? path.resolve(__dirname, '../../../.env') : null,
  typeof __dirname !== 'undefined' ? path.resolve(__dirname, '../../.env') : null,
].filter((p): p is string => Boolean(p));

for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

const envSchema = z.object({
  PORT: z.string().default('5000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  BACKEND_URL: z.string().default('http://localhost:5000'),

  JWT_SECRET: z.string().default('reachinbox_super_secret_jwt_key_default_123'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  DATABASE_URL: z.string().default('postgresql://reachinbox:reachinbox123@localhost:5432/reachinbox_db?schema=public'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform((val) => parseInt(val, 10)),
  REDIS_PASSWORD: z.string().optional().default(''),

  WORKER_CONCURRENCY: z.string().default('5').transform((val) => parseInt(val, 10)),
  MAX_EMAILS_PER_HOUR: z.string().default('200').transform((val) => parseInt(val, 10)),
  MIN_EMAIL_DELAY_MS: z.string().default('2000').transform((val) => parseInt(val, 10)),

  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.string().default('587').transform((val) => parseInt(val, 10)),
  SMTP_SECURE: z.string().default('false').transform((val) => val === 'true'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASSWORD: z.string().optional().default(''),
  DEFAULT_SENDER_EMAIL: z.string().default('outreach@reachinbox.ai'),
  DEFAULT_SENDER_NAME: z.string().default('ReachInbox Team'),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5000/api/auth/google/callback'),

  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:5000/api/slack/callback'),

  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('reachinbox-emails'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const env = parsed.data;
