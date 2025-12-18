/**
 * In-Memory Cache Service
 * 
 * Provides caching for EMDEX API responses to:
 * - Reduce API calls and rate limiting issues
 * - Improve response times
 * - Handle repeated searches efficiently
 * 
 * Note: This cache resets on cold starts. For production,
 * consider upgrading to Vercel KV (Redis-based).
 */

// Maximum cache size to prevent unbounded memory growth
const MAX_CACHE_SIZE = 1000;

// In-memory cache storage
const cache = new Map();

// Cache statistics for monitoring
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
};

/**
 * Get an item from the cache
 * 
 * @param {string} key - Cache key
 * @returns {Object|null} Cached data or null if not found/expired
 */
function get(key) {
  const item = cache.get(key);
  
  if (!item) {
    stats.misses++;
    return null;
  }
  
  // Check if item has expired
  const now = Date.now();
  if (item.expiresAt < now) {
    // Remove expired item
    cache.delete(key);
    stats.misses++;
    return null;
  }
  
  stats.hits++;
  return item.data;
}

/**
 * Store an item in the cache
 * 
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {number} ttlSeconds - Time to live in seconds
 */
function set(key, data, ttlSeconds = 3600) {
  // Check cache size and evict if necessary
  if (cache.size >= MAX_CACHE_SIZE) {
    evictOldest();
  }
  
  const now = Date.now();
  cache.set(key, {
    data,
    createdAt: now,
    expiresAt: now + (ttlSeconds * 1000),
    ttl: ttlSeconds,
  });
  
  stats.sets++;
}

/**
 * Delete an item from the cache
 * 
 * @param {string} key - Cache key
 * @returns {boolean} True if item was deleted
 */
function del(key) {
  return cache.delete(key);
}

/**
 * Clear all cached items
 */
function clear() {
  const size = cache.size;
  cache.clear();
  console.log(`[Cache] Cleared ${size} items`);
}

/**
 * Evict the oldest items when cache is full
 * Removes 10% of items to make room
 */
function evictOldest() {
  const itemsToRemove = Math.ceil(MAX_CACHE_SIZE * 0.1);
  const entries = Array.from(cache.entries());
  
  // Sort by creation time (oldest first)
  entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
  
  // Remove oldest items
  for (let i = 0; i < itemsToRemove && i < entries.length; i++) {
    cache.delete(entries[i][0]);
    stats.evictions++;
  }
  
  console.log(`[Cache] Evicted ${itemsToRemove} oldest items`);
}

/**
 * Generate a consistent cache key from prefix and parameters
 * 
 * @param {string} prefix - Key prefix (e.g., 'emdex_brands_search')
 * @param {Object} params - Parameters to include in key
 * @returns {string} Cache key
 */
function generateKey(prefix, params = {}) {
  // Normalize params: lowercase, sorted keys
  const normalizedParts = Object.keys(params)
    .sort()
    .map(key => {
      const value = params[key];
      if (value === null || value === undefined) return null;
      const normalizedValue = String(value).toLowerCase().trim();
      return `${key}=${normalizedValue}`;
    })
    .filter(part => part !== null);
  
  const paramsString = normalizedParts.join('_');
  return paramsString ? `${prefix}_${paramsString}` : prefix;
}

/**
 * Get remaining TTL for a cached item
 * 
 * @param {string} key - Cache key
 * @returns {number} Remaining TTL in seconds, or 0 if not found/expired
 */
function getTTL(key) {
  const item = cache.get(key);
  if (!item) return 0;
  
  const remaining = item.expiresAt - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

/**
 * Get cache statistics
 * 
 * @returns {Object} Cache stats
 */
function getStats() {
  return {
    ...stats,
    size: cache.size,
    maxSize: MAX_CACHE_SIZE,
    hitRate: stats.hits + stats.misses > 0 
      ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) + '%'
      : '0%',
  };
}

/**
 * Log cache statistics (call periodically for monitoring)
 */
function logStats() {
  const s = getStats();
  console.log(`[Cache] Stats: ${s.size}/${s.maxSize} items, ${s.hitRate} hit rate, ${s.hits} hits, ${s.misses} misses`);
}

/**
 * Check if a key exists and is not expired
 * 
 * @param {string} key - Cache key
 * @returns {boolean} True if key exists and is valid
 */
function has(key) {
  const item = cache.get(key);
  if (!item) return false;
  
  if (item.expiresAt < Date.now()) {
    cache.delete(key);
    return false;
  }
  
  return true;
}

module.exports = {
  get,
  set,
  del,
  clear,
  generateKey,
  getTTL,
  getStats,
  logStats,
  has,
  // Constants
  MAX_CACHE_SIZE,
};
