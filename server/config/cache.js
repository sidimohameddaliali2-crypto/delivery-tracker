/**
 * Redis Cache Configuration & Utilities
 * 
 * Provides centralized Redis connection management and cache utilities.
 * Used for caching frequently-accessed data like menus and customer profiles.
 * 
 * Initialize: await initRedis()
 * Cache data: await cacheSet('key', data, 3600) // 1 hour TTL
 * Get data: await cacheGet('key')
 * Invalidate: await cacheDelete('key')
 */

import redis from 'redis';
import dotenv from 'dotenv';

dotenv.config();

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis connection
 * Called once during server startup
 */
export const initRedis = async () => {
  if (redisClient && isConnected) {
    console.log('ℹ️  Redis already initialized');
    return redisClient;
  }

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          // Stop reconnecting after 3 attempts
          if (retries > 3) {
            console.warn('💡 Redis unavailable - continuing without cache (performance may be slower)');
            console.warn('   To enable caching: Install Redis or set REDIS_URL in .env');
            return false; // Stop reconnecting
          }
          // Exponential backoff: 1s, 2s, 3s
          return retries * 1000;
        },
        connectTimeout: 5000,
      },
    });

    let errorLogged = false;
    redisClient.on('error', (err) => {
      if (!errorLogged) {
        console.warn('⚠️  Redis connection failed');
        errorLogged = true;
      }
      isConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis connected');
      isConnected = true;
      errorLogged = false;
    });

    await redisClient.connect();
    isConnected = true;
    console.log('✅ Redis initialized successfully');
    
    return redisClient;

  } catch (error) {
    console.warn('💡 Redis not available - continuing without cache');
    console.warn('   System will work normally but may be slower for 200+ simultaneous users');
    console.warn('   To enable caching: Install Redis (apt-get install redis-server) or set REDIS_URL');
    isConnected = false;
    redisClient = null;
    return null;
  }
};

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null if not found/expired
 */
export const cacheGet = async (key) => {
  if (!redisClient || !isConnected) {
    return null;
  }

  try {
    const stored = await redisClient.get(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // If not JSON, return as string
        return stored;
      }
    }
    return null;
  } catch (error) {
    console.warn(`⚠️  Cache GET ${key} failed:`, error.message);
    return null;
  }
};

/**
 * Set a value in cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache (will be JSON stringified)
 * @param {number} ttl - Time to live in seconds (default 3600 = 1 hour)
 * @returns {Promise<boolean>} True if successful
 */
export const cacheSet = async (key, value, ttl = 3600) => {
  if (!redisClient || !isConnected) {
    return false;
  }

  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await redisClient.setEx(key, ttl, serialized);
    return true;
  } catch (error) {
    console.warn(`⚠️  Cache SET ${key} failed:`, error.message);
    return false;
  }
};

/**
 * Delete a value from cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if successful
 */
export const cacheDelete = async (key) => {
  if (!redisClient || !isConnected) {
    return false;
  }

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.warn(`⚠️  Cache DELETE ${key} failed:`, error.message);
    return false;
  }
};

/**
 * Delete multiple values matching a pattern
 * @param {string} pattern - Redis key pattern (e.g., 'menu:*')
 * @returns {Promise<number>} Number of keys deleted
 */
export const cacheDeletePattern = async (pattern) => {
  if (!redisClient || !isConnected) {
    return 0;
  }

  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length === 0) return 0;
    
    for (const key of keys) {
      await redisClient.del(key);
    }
    return keys.length;
  } catch (error) {
    console.warn(`⚠️  Cache DELETE pattern ${pattern} failed:`, error.message);
    return 0;
  }
};

/**
 * Clear all cache data
 * ⚠️ Use with caution in production!
 * @returns {Promise<boolean>}
 */
export const cacheClearAll = async () => {
  if (!redisClient || !isConnected) {
    return false;
  }

  try {
    await redisClient.flushDb();
    console.log('🗑️  Cache cleared');
    return true;
  } catch (error) {
    console.warn('⚠️  Cache clear failed:', error.message);
    return false;
  }
};

/**
 * Get Redis client instance
 * Useful for advanced operations
 */
export const getRedisClient = () => redisClient;

/**
 * Check if Redis is connected
 */
export const isRedisConnected = () => isConnected;

/**
 * Gracefully close Redis connection
 */
export const closeRedis = async () => {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      isConnected = false;
      console.log('✅ Redis connection closed');
    } catch (error) {
      console.warn('⚠️  Error closing Redis:', error.message);
    }
  }
};

export default {
  initRedis,
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern,
  cacheClearAll,
  getRedisClient,
  isRedisConnected,
  closeRedis,
};
