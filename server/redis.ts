import { createClient } from 'redis';

// Redis configuration from environment
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Create Redis client
export const redisClient = createClient({
  url: REDIS_URL,
  password: REDIS_PASSWORD,
  socket: {
    reconnectStrategy: (retries) => {
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc., max 30 seconds
      const delay = Math.min(100 * Math.pow(2, retries), 30000);
      console.log(`Redis reconnecting in ${delay}ms... (attempt ${retries + 1})`);
      return delay;
    },
    connectTimeout: 10000, // 10 seconds
  },
});

// Connection event handlers
redisClient.on('connect', () => {
  console.log('✓ Redis client connected');
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

// Connect to Redis
export async function connectRedis() {
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
  try {
    await redisClient.quit();
    console.log('✓ Redis connection closed gracefully');
  } catch (error: any) {
    console.error('Error closing Redis connection:', error.message);
  }
}
