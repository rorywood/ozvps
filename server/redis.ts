import { createClient } from 'redis';
import { log } from './logger';

// Redis configuration from environment
const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const MAX_RECONNECT_ATTEMPTS = 10;

// Track reconnection attempts to enforce max limit
let reconnectAttempts = 0;

// Create Redis client (only if REDIS_URL is configured)
export const redisClient = REDIS_URL ? createClient({
  url: REDIS_URL,
  password: REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries >= MAX_RECONNECT_ATTEMPTS) {
        log(`Redis reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`, 'redis', { level: 'warn' });
        log('Permanently falling back to memory-based sessions', 'redis', { level: 'warn' });
        return false; // Stop reconnecting
      }

      reconnectAttempts = retries;
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc., max 30 seconds
      const delay = Math.min(100 * Math.pow(2, retries), 30000);
      log(`Redis reconnecting in ${delay}ms... (attempt ${retries + 1}/${MAX_RECONNECT_ATTEMPTS})`, 'redis');
      return delay;
    },
    connectTimeout: 10000, // 10 seconds
  },
}) : null;

// Connection event handlers (only register if Redis is configured)
if (redisClient) {
  redisClient.on('connect', () => {
    log('Redis client connected', 'redis');
    reconnectAttempts = 0; // Reset counter on successful connection
  });

  redisClient.on('ready', () => {
    log('Redis client ready', 'redis');
  });

  redisClient.on('error', (err) => {
    log(`Redis client error: ${err.message}`, 'redis', { level: 'error' });
  });

  redisClient.on('reconnecting', () => {
    log('Redis client reconnecting...', 'redis');
  });

  redisClient.on('end', () => {
    log('Redis client disconnected', 'redis', { level: 'warn' });
  });
}

// Connect to Redis
export async function connectRedis() {
  // Skip if Redis not configured
  if (!REDIS_URL) {
    log('REDIS_URL not configured - using memory-based sessions', 'redis');
    return;
  }

  if (!redisClient) {
    log('Redis client not initialized - using memory-based sessions', 'redis', { level: 'warn' });
    return;
  }

  try {
    await redisClient.connect();
    log('Redis connection established', 'redis');
  } catch (error: any) {
    log(`Failed to connect to Redis: ${error.message}`, 'redis', { level: 'error' });
    log('Application will continue with memory-based sessions', 'redis', { level: 'warn' });
    // Don't throw - allow app to start without Redis
  }
}

// Graceful shutdown
export async function disconnectRedis() {
  if (!redisClient || !REDIS_URL) {
    return; // No Redis connection to close
  }

  try {
    await redisClient.quit();
    log('Redis connection closed gracefully', 'redis');
  } catch (error: any) {
    log(`Error closing Redis connection: ${error.message}`, 'redis', { level: 'error' });
  }
}
