/**
 * Brand Drug Search Endpoint
 * 
 * POST /api/drugs/search/brands
 * 
 * Searches EMDEX for brand name drugs.
 */

const { cachedEmdexRequest, EmdexError, CACHE_TTL } = require('../../services/emdex-service');
const { transformBrandResults } = require('../../services/drug-transformer');

module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { query, limit = 20 } = req.body;

    // Validate query
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const searchQuery = query.trim();

    // Call EMDEX brand search with caching
    console.log(`[EMDEX] Searching brands for: "${searchQuery}"`);
    
    const emdexResponse = await cachedEmdexRequest(
      '/api/v1/brands/search', 
      { query: searchQuery },
      CACHE_TTL.SEARCH
    );

    // Extract cache info
    const cacheInfo = emdexResponse._cache || { hit: false };
    delete emdexResponse._cache;

    // Log raw response for debugging (remove in production)
    console.log('[EMDEX] Raw brand response:', JSON.stringify(emdexResponse, null, 2));

    // Transform results to app format
    let results = transformBrandResults(emdexResponse);

    // Apply limit
    const totalCount = results.length;
    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }

    // Set cache headers
    res.setHeader('X-Cache', cacheInfo.hit ? 'HIT' : 'MISS');
    if (cacheInfo.ttl) {
      res.setHeader('X-Cache-TTL', cacheInfo.ttl);
    }

    return res.status(200).json({
      success: true,
      query: searchQuery,
      source: 'emdex',
      results: results,
      total: totalCount,
      cached: cacheInfo.hit,
    });

  } catch (error) {
    console.error('[EMDEX] Brand search error:', error);

    // Handle EMDEX-specific errors
    if (error instanceof EmdexError) {
      if (error.code === 'NETWORK_ERROR') {
        return res.status(503).json({
          success: false,
          error: 'Drug database temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
        });
      }

      if (error.code === 'AUTH_FAILED') {
        return res.status(503).json({
          success: false,
          error: 'Drug database authentication failed',
          code: 'AUTH_ERROR',
        });
      }
    }

    // Generic error
    return res.status(500).json({
      success: false,
      error: 'An error occurred while searching drugs',
      code: 'INTERNAL_ERROR',
    });
  }
};
