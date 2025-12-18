/**
 * EMDEX API Service
 * 
 * Handles authentication and communication with the EMDEX Nigerian drug database API.
 * This is the authoritative source for drug information in ScanRx.
 * 
 * Set USE_MOCK_EMDEX=true in environment to use mock data for development.
 */

const cache = require('./cache-service');
const { mockEmdexRequest } = require('./mock-emdex-service');

// Check if mock mode is enabled
const USE_MOCK = process.env.USE_MOCK_EMDEX === 'true';

// Token cache
let cachedToken = null;
let tokenExpiresAt = null;

// Cache TTL constants (in seconds)
const CACHE_TTL = {
  SEARCH: 3600,      // 1 hour for search results
  DETAILS: 86400,    // 24 hours for drug details
  VERIFY: 86400,     // 24 hours for verification
};

/**
 * Custom error class for EMDEX-specific errors
 */
class EmdexError extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'EmdexError';
    this.code = code;
    this.originalError = originalError;
  }
}

/**
 * Get or refresh the EMDEX API token
 * 
 * - Checks if cached token exists and is not expired (with 60 second buffer)
 * - If valid token exists, returns it
 * - If no valid token, logs in to EMDEX and caches the new token
 * 
 * @returns {Promise<string>} The JWT token
 * @throws {EmdexError} If authentication fails
 */
async function getToken() {
  // Check if we have a valid cached token (with 60 second buffer)
  const now = Date.now();
  if (cachedToken && tokenExpiresAt && (tokenExpiresAt - 60000) > now) {
    return cachedToken;
  }

  // Get credentials from environment
  const apiUrl = process.env.EMDEX_API_URL;
  const email = process.env.EMDEX_EMAIL;
  const password = process.env.EMDEX_PASSWORD;

  if (!apiUrl || !email || !password) {
    throw new EmdexError(
      'EMDEX credentials not configured. Please set EMDEX_API_URL, EMDEX_EMAIL, and EMDEX_PASSWORD environment variables.',
      'AUTH_FAILED'
    );
  }

  try {
    // Login to EMDEX
    const loginUrl = `${apiUrl}/api/v1/login`;
    
    const body = new URLSearchParams();
    body.append('email', email);
    body.append('password', password);

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new EmdexError(
        `EMDEX login failed: ${response.status} ${response.statusText}. ${errorText}`,
        'AUTH_FAILED'
      );
    }

    const data = await response.json();

    // Extract token from response
    // EMDEX typically returns { token: "...", expires_in: ... } or similar
    const token = data.token || data.access_token;
    
    if (!token) {
      throw new EmdexError(
        'EMDEX login response did not contain a token',
        'AUTH_FAILED'
      );
    }

    // Calculate expiration time
    // Default to 1 hour if not specified
    const expiresIn = data.expires_in || data.expiresIn || 3600;
    tokenExpiresAt = now + (expiresIn * 1000);
    cachedToken = token;

    return cachedToken;
  } catch (error) {
    // Clear any cached token on error
    cachedToken = null;
    tokenExpiresAt = null;

    if (error instanceof EmdexError) {
      throw error;
    }

    throw new EmdexError(
      `Network error during EMDEX authentication: ${error.message}`,
      'NETWORK_ERROR',
      error
    );
  }
}

/**
 * Make an authenticated request to the EMDEX API
 * 
 * @param {string} endpoint - The API endpoint (e.g., '/api/v1/drugs/search')
 * @param {Object} body - The request body as an object
 * @param {boolean} isRetry - Internal flag to prevent infinite retry loops
 * @returns {Promise<Object>} The parsed JSON response
 * @throws {EmdexError} If the request fails
 */
async function emdexRequest(endpoint, body = {}, isRetry = false) {
  // Use mock service if enabled
  if (USE_MOCK) {
    console.log('[EMDEX] Using MOCK service');
    return mockEmdexRequest(endpoint, body);
  }

  const apiUrl = process.env.EMDEX_API_URL;
  
  if (!apiUrl) {
    throw new EmdexError(
      'EMDEX_API_URL not configured',
      'REQUEST_FAILED'
    );
  }

  try {
    // Get authentication token
    const token = await getToken();

    // Build request URL
    const requestUrl = `${apiUrl}${endpoint}`;

    // Build request body
    const requestBody = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) {
        requestBody.append(key, value);
      }
    }

    // Make the request
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody.toString(),
    });

    // Handle 401 Unauthorized - token may have expired
    if (response.status === 401 && !isRetry) {
      // Clear cached token and retry once
      cachedToken = null;
      tokenExpiresAt = null;
      return emdexRequest(endpoint, body, true);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new EmdexError(
        `EMDEX request failed: ${response.status} ${response.statusText}. ${errorText}`,
        'REQUEST_FAILED'
      );
    }

    // Parse and return response
    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof EmdexError) {
      throw error;
    }

    throw new EmdexError(
      `Network error during EMDEX request: ${error.message}`,
      'NETWORK_ERROR',
      error
    );
  }
}

/**
 * Clear the cached token (useful for testing)
 */
function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = null;
}

/**
 * Make a cached authenticated request to the EMDEX API
 * 
 * Wraps emdexRequest with caching to reduce API calls and improve response times.
 * 
 * @param {string} endpoint - The API endpoint (e.g., '/api/v1/drugs/search')
 * @param {Object} body - The request body as an object
 * @param {number} ttlSeconds - Cache TTL in seconds (default: 1 hour)
 * @returns {Promise<Object>} The response with fromCache flag
 * @throws {EmdexError} If the request fails
 */
async function cachedEmdexRequest(endpoint, body = {}, ttlSeconds = CACHE_TTL.SEARCH) {
  // Generate cache key from endpoint and body
  const cacheKey = cache.generateKey(`emdex${endpoint.replace(/\//g, '_')}`, body);
  
  // Check cache first
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log(`[EMDEX] Cache HIT: ${cacheKey}`);
    return { 
      ...cachedData, 
      _cache: {
        hit: true,
        key: cacheKey,
        ttl: cache.getTTL(cacheKey),
      }
    };
  }
  
  console.log(`[EMDEX] Cache MISS: ${cacheKey}`);
  
  // Make actual request
  const result = await emdexRequest(endpoint, body);
  
  // Cache successful results (don't cache errors)
  if (result && !result.error) {
    cache.set(cacheKey, result, ttlSeconds);
    console.log(`[EMDEX] Cached result for ${ttlSeconds}s: ${cacheKey}`);
  }
  
  return { 
    ...result, 
    _cache: {
      hit: false,
      key: cacheKey,
      ttl: ttlSeconds,
    }
  };
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return cache.getStats();
}

/**
 * Clear all cached EMDEX responses
 */
function clearResponseCache() {
  cache.clear();
}

module.exports = {
  EmdexError,
  getToken,
  emdexRequest,
  cachedEmdexRequest,
  clearTokenCache,
  clearResponseCache,
  getCacheStats,
  CACHE_TTL,
};
