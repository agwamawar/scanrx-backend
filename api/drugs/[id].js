/**
 * Drug Details Endpoint
 * 
 * GET /api/drugs/{id}
 * 
 * Fetches comprehensive information about a specific drug from EMDEX.
 * 
 * URL examples:
 * - /api/drugs/emdex_brand_12345
 * - /api/drugs/emdex_generic_67890
 */

const { cachedEmdexRequest, EmdexError, CACHE_TTL } = require('../services/emdex-service');
const { 
  transformEmdexBrandDetails,
  transformEmdexGenericDetails,
  parseAppDrugId,
  transformBrandResults,
} = require('../services/drug-transformer');

module.exports = async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    // Get drug ID from URL parameter
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Drug ID is required',
        code: 'INVALID_REQUEST',
      });
    }

    // Parse the drug ID to determine type and EMDEX ID
    const parsedId = parseAppDrugId(id);

    if (!parsedId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid drug ID format. Expected format: emdex_brand_XXX or emdex_generic_XXX',
        code: 'INVALID_ID_FORMAT',
      });
    }

    const { type, emdexId } = parsedId;

    console.log(`[EMDEX] Fetching ${type} details for ID: ${emdexId}`);

    let emdexResponse;
    let drug;
    let cacheHit = false;

    // Helper to extract cache info
    const extractCacheInfo = (response) => {
      if (response && response._cache) {
        cacheHit = response._cache.hit;
        delete response._cache;
      }
      return response;
    };

    if (type === 'brand') {
      // Fetch brand details from EMDEX with 24hr cache
      emdexResponse = extractCacheInfo(await cachedEmdexRequest(
        '/api/v1/brands/details', 
        { brand_id: emdexId },
        CACHE_TTL.DETAILS
      ));

      // Log raw response for debugging
      console.log('[EMDEX] Raw brand details response:', JSON.stringify(emdexResponse, null, 2));

      // Handle EMDEX response structure
      const brandData = extractDrugData(emdexResponse);

      if (!brandData) {
        return res.status(404).json({
          success: false,
          error: 'Drug not found',
          code: 'NOT_FOUND',
        });
      }

      // Transform to app format
      drug = transformEmdexBrandDetails(brandData, id);

      // Optionally fetch related brands for same generic
      try {
        if (drug.generic_name) {
          const relatedResponse = extractCacheInfo(await cachedEmdexRequest(
            '/api/v1/brands/search', 
            { query: drug.generic_name },
            CACHE_TTL.SEARCH
          ));
          const relatedBrands = transformBrandResults(relatedResponse);
          // Filter out current drug and limit to 5
          drug.similar_drugs = relatedBrands
            .filter(b => b.id !== id)
            .slice(0, 5);
        }
      } catch (relatedError) {
        console.log('[EMDEX] Could not fetch related drugs:', relatedError.message);
        drug.similar_drugs = [];
      }

    } else if (type === 'generic') {
      // Fetch generic details from EMDEX with 24hr cache
      emdexResponse = extractCacheInfo(await cachedEmdexRequest(
        '/api/v1/generic/details', 
        { generic_id: emdexId },
        CACHE_TTL.DETAILS
      ));

      // Log raw response for debugging
      console.log('[EMDEX] Raw generic details response:', JSON.stringify(emdexResponse, null, 2));

      // Handle EMDEX response structure
      const genericData = extractDrugData(emdexResponse);

      if (!genericData) {
        return res.status(404).json({
          success: false,
          error: 'Drug not found',
          code: 'NOT_FOUND',
        });
      }

      // Transform to app format
      drug = transformEmdexGenericDetails(genericData, id);

      // Optionally fetch brand alternatives for this generic
      try {
        const brandsResponse = extractCacheInfo(await cachedEmdexRequest(
          '/api/v1/generic/brands', 
          { generic_id: emdexId },
          CACHE_TTL.SEARCH
        ));
        const brands = transformBrandResults(brandsResponse);
        drug.brand_alternatives = brands.slice(0, 10);
      } catch (brandsError) {
        console.log('[EMDEX] Could not fetch brand alternatives:', brandsError.message);
        drug.brand_alternatives = [];
      }
    }

    if (!drug) {
      return res.status(404).json({
        success: false,
        error: 'Drug not found',
        code: 'NOT_FOUND',
      });
    }

    // Set cache headers
    res.setHeader('X-Cache', cacheHit ? 'HIT' : 'MISS');

    return res.status(200).json({
      success: true,
      drug: drug,
      cached: cacheHit,
    });

  } catch (error) {
    console.error('[EMDEX] Drug details error:', error);

    // Handle EMDEX-specific errors
    if (error instanceof EmdexError) {
      if (error.code === 'NETWORK_ERROR') {
        return res.status(503).json({
          success: false,
          error: 'Unable to fetch drug details. Drug database temporarily unavailable.',
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

      // Check for 404-like responses from EMDEX
      if (error.message && error.message.includes('404')) {
        return res.status(404).json({
          success: false,
          error: 'Drug not found',
          code: 'NOT_FOUND',
        });
      }
    }

    // Generic error
    return res.status(500).json({
      success: false,
      error: 'An error occurred while fetching drug details',
      code: 'INTERNAL_ERROR',
    });
  }
};

/**
 * Extract drug data from EMDEX response
 * Handles various response structures
 * 
 * @param {Object} response - EMDEX API response
 * @returns {Object|null} Drug data or null if not found
 */
function extractDrugData(response) {
  if (!response) return null;

  // Direct data
  if (response.id || response.brand_id || response.generic_id) {
    return response;
  }

  // Wrapped in data property
  if (response.data) {
    if (Array.isArray(response.data)) {
      return response.data[0] || null;
    }
    return response.data;
  }

  // Wrapped in drug property
  if (response.drug) {
    return response.drug;
  }

  // Wrapped in brand/generic property
  if (response.brand) {
    return response.brand;
  }
  if (response.generic) {
    return response.generic;
  }

  // Wrapped in result property
  if (response.result) {
    return response.result;
  }

  // Check if it's an empty success response
  if (response.success === false || response.error) {
    return null;
  }

  // Last resort: return the whole response if it looks like drug data
  if (response.brand_name || response.generic_name || response.name) {
    return response;
  }

  return null;
}
