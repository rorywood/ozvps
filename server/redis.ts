import { createClient } from 'redis';

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
        console.warn(`⚠ Redis reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        console.warn('⚠ Permanently falling back to memory-based sessions');
        return false; // Stop reconnecting
      }

      reconnectAttempts = retries;
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc., max 30 seconds
      const delay = Math.min(100 * Math.pow(2, retries), 30000);
      console.log(`Redis reconnecting in ${delay}ms... (attempt ${retries + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      return delay;
    },
    connectTimeout: 10000, // 10 seconds
  },
}) : null;

// Connection event handlers (only register if Redis is configured)
if (redisClient) {
  redisClient.on('connect', () => {
    console.log('✓ Redis client connected');
    reconnectAttempts = 0; // Reset counter on successful connection
  });

  redisClient.on('ready', () => {
    console.log('✓ Redis client ready');
  });

  redisClient.on('error', (err) => {
    console.error('Redis client error:', err.message);
  });

  redisClient.on('reconnecting', () => {
    console.log('→ Redis client reconnecting...');
  });

  redisClient.on('end', () => {
    console.log('✗ Redis client disconnected');
  });
}

// Connect to Redis
export async function connectRedis() {
  // Skip if Redis not configured
  if (!REDIS_URL) {
    console.log('ℹ REDIS_URL not configured - using memory-based sessions');
    return;
  }

  if (!redisClient) {
    console.warn('⚠ Redis client not initialized - using memory-based sessions');
    return;
  }

  try {
    await redisClient.connect();
    console.log('✓ Redis connection established');
  } catch (error: any) {
    console.error('Failed to connect to Redis:', error.message);
    console.warn('⚠ Application will continue with memory-based sessions');
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
    console.log('✓ Redis connection closed gracefully');
  } catch (error: any) {
    console.error('Error closing Redis connection:', error.message);
  }
}
