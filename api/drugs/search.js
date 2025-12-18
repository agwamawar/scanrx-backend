/**
 * Unified Drug Search Endpoint
 * 
 * POST /api/drugs/search
 * 
 * Searches EMDEX for drugs by brand name, generic name, or both.
 */

const { cachedEmdexRequest, EmdexError, CACHE_TTL } = require('../services/emdex-service');
const { 
  transformBrandResults, 
  transformGenericResults,
  removeDuplicates,
} = require('../services/drug-transformer');

module.exports = async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { query, type = 'all', limit = 20 } = req.body;

    // Validate query
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const searchQuery = query.trim();
    const searchType = type.toLowerCase();

    // Validate type
    if (!['all', 'brand', 'generic'].includes(searchType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid search type. Must be "all", "brand", or "generic"',
      });
    }

    console.log(`[EMDEX] Unified search for: "${searchQuery}" (type: ${searchType})`);

    let brandResults = [];
    let genericResults = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // Helper to extract cache info and track stats
    const extractCacheInfo = (response) => {
      if (response && response._cache) {
        if (response._cache.hit) cacheHits++;
        else cacheMisses++;
        delete response._cache;
      }
      return response;
    };

    // Search based on type
    if (searchType === 'brand') {
      // Brand only
      const emdexResponse = extractCacheInfo(await cachedEmdexRequest(
        '/api/v1/brands/search', 
        { query: searchQuery },
        CACHE_TTL.SEARCH
      ));
      console.log('[EMDEX] Raw brand response:', JSON.stringify(emdexResponse, null, 2));
      brandResults = transformBrandResults(emdexResponse);

    } else if (searchType === 'generic') {
      // Generic only
      const emdexResponse = extractCacheInfo(await cachedEmdexRequest(
        '/api/v1/generic/search', 
        { query: searchQuery },
        CACHE_TTL.SEARCH
      ));
      console.log('[EMDEX] Raw generic response:', JSON.stringify(emdexResponse, null, 2));
      genericResults = transformGenericResults(emdexResponse);

    } else {
      // Search both in parallel
      const [brandResponse, genericResponse] = await Promise.all([
        cachedEmdexRequest('/api/v1/brands/search', { query: searchQuery }, CACHE_TTL.SEARCH)
          .then(extractCacheInfo)
          .catch(err => {
            console.error('[EMDEX] Brand search failed:', err.message);
            return null;
          }),
        cachedEmdexRequest('/api/v1/generic/search', { query: searchQuery }, CACHE_TTL.SEARCH)
          .then(extractCacheInfo)
          .catch(err => {
            console.error('[EMDEX] Generic search failed:', err.message);
            return null;
          }),
      ]);

      if (brandResponse) {
        console.log('[EMDEX] Raw brand response:', JSON.stringify(brandResponse, null, 2));
        brandResults = transformBrandResults(brandResponse);
      }

      if (genericResponse) {
        console.log('[EMDEX] Raw generic response:', JSON.stringify(genericResponse, null, 2));
        genericResults = transformGenericResults(genericResponse);
      }
    }

    // Merge results: brands first, then generics
    let allResults = [...brandResults, ...genericResults];

    // Remove duplicates by NAFDAC number
    allResults = removeDuplicates(allResults);

    // Get counts before limiting
    const brandCount = brandResults.length;
    const genericCount = genericResults.length;
    const totalCount = allResults.length;

    // Apply limit
    if (limit && limit > 0) {
      allResults = allResults.slice(0, limit);
    }

    // Set cache headers
    const allCached = cacheHits > 0 && cacheMisses === 0;
    res.setHeader('X-Cache', allCached ? 'HIT' : (cacheHits > 0 ? 'PARTIAL' : 'MISS'));

    return res.status(200).json({
      success: true,
      query: searchQuery,
      source: 'emdex',
      type: searchType,
      results: allResults,
      total: totalCount,
      brand_count: brandCount,
      generic_count: genericCount,
      cached: allCached,
    });

  } catch (error) {
    console.error('[EMDEX] Unified search error:', error);

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
