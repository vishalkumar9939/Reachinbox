import Redis from 'ioredis';
import { env } from './env.js';

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Mandatory for BullMQ
  enableReadyCheck: false,
  lazyConnect: false,
  connectTimeout: 5000,
  retryStrategy(times) {
    const delay = Math.min(times * 300, 3000);
    return delay;
  },
});

redis.on('connect', () => {
  console.log(`🔌 Redis connected to ${env.REDIS_HOST}:${env.REDIS_PORT}`);
});

redis.on('error', (err) => {
  // Gracefully log warning so server doesn't crash on initial unready state
  console.warn(`⚠️ Redis connection warning: ${err.message}`);
});

export const getRedisClient = () => redis;
