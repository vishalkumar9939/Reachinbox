import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';

import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.js';
import { initElasticsearchIndex } from './config/elasticsearch.js';
import { emailQueue } from './queues/email.queue.js';
import { mailService } from './integrations/ethereal.service.js';
import { initSocketServer } from './socket/index.js';
import apiRouter from './routes/index.js';
import './workers/email.worker.js'; // Start BullMQ email worker in the same process

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
export const io = initSocketServer(server);

// Security & Parsing Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Bull Board and dashboard inline previews
  })
);

const allowedOrigins = [
  env.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://reachinbox-frontend-beta.vercel.app',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Also allow any *.vercel.app preview deployments
      if (origin.endsWith('.vercel.app')) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------------------
// Bull Board Queue Dashboard Setup
// ---------------------------------------------------------------------------
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(emailQueue) as any],
  serverAdapter: serverAdapter,
});

// Protect Bull Board in production — only allow authenticated access
if (env.NODE_ENV === 'production') {
  app.use('/admin/queues', (req, res, next) => {
    return res.status(403).json({ success: false, message: 'Queue dashboard is disabled in production' });
  });
} else {
  app.use('/admin/queues', serverAdapter.getRouter());
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api', apiRouter);

// Root Welcome Route
app.get('/', (req, res) => {
  res.json({
    app: 'ReachInbox Email Scheduler API',
    version: '1.0.0',
    bullBoard: '/admin/queues',
    documentation: '/api/health',
  });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
});

// ---------------------------------------------------------------------------
// Server Initialization
// ---------------------------------------------------------------------------
const PORT = env.PORT;

const startServer = async () => {
  try {
    // 1. Initialize Ethereal SMTP transporter
    await mailService.initTransporter();

    // 2. Initialize Elasticsearch Index (with graceful fallback if ES is not yet running)
    await initElasticsearchIndex();

    server.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`🚀 ReachInbox API Server running on port ${PORT}`);
      console.log(`🌐 Local URL: http://localhost:${PORT}`);
      console.log(`📊 Bull Board Queue Monitor: http://localhost:${PORT}/admin/queues`);
      console.log(`======================================================\n`);
    });
  } catch (err: any) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

// Graceful Termination
const gracefulShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await redis.quit();
      await prisma.$disconnect();
      console.log('Cleanup completed. Server exited.');
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
