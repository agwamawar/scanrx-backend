/**
 * Mock EMDEX Service
 * 
 * Provides fake EMDEX API responses for development and testing.
 * Enable by setting USE_MOCK_EMDEX=true in environment.
 */

const path = require('path');
const fs = require('fs');

// Load mock data
let mockData = null;

function loadMockData() {
  if (mockData) return mockData;
  
  try {
    const dataPath = path.join(__dirname, '../data/mock-drugs.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    mockData = JSON.parse(rawData);
    console.log(`[MOCK EMDEX] Loaded ${mockData.brands.length} brands and ${mockData.generics.length} generics`);
    return mockData;
  } catch (error) {
    console.error('[MOCK EMDEX] Failed to load mock data:', error.message);
    return { brands: [], generics: [] };
  }
}

// Simulate network delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mock login - always succeeds
 */
async function mockLogin() {
  await delay(200);
  console.log('[MOCK EMDEX] Login successful (mock)');
  return {
    success: true,
    token: 'mock_token_' + Date.now(),
    expires_in: 86400,
  };
}

/**
 * Mock brand search
 */
async function mockBrandSearch(query) {
  await delay(300);
  const data = loadMockData();
  
  if (!query || query.trim() === '') {
    return {
      success: true,
      data: [],
      total: 0,
    };
  }
  
  const queryLower = query.toLowerCase().trim();
  
  const results = data.brands.filter(brand => {
    const brandNameMatch = brand.brand_name.toLowerCase().includes(queryLower);
    const genericNameMatch = brand.generic_name.toLowerCase().includes(queryLower);
    const nafdacMatch = brand.nafdac_number.toLowerCase().includes(queryLower);
    const categoryMatch = brand.category.toLowerCase().includes(queryLower);
    const manufacturerMatch = brand.manufacturer.toLowerCase().includes(queryLower);
    
    return brandNameMatch || genericNameMatch || nafdacMatch || categoryMatch || manufacturerMatch;
  });
  
  console.log(`[MOCK EMDEX] Brand search "${query}" returned ${results.length} results`);
  
  return {
    success: true,
    data: results,
    total: results.length,
  };
}

/**
 * Mock generic search
 */
async function mockGenericSearch(query) {
  await delay(300);
  const data = loadMockData();
  
  if (!query || query.trim() === '') {
    return {
      success: true,
      data: [],
      total: 0,
    };
  }
  
  const queryLower = query.toLowerCase().trim();
  
  const results = data.generics.filter(generic => {
    const genericNameMatch = generic.generic_name.toLowerCase().includes(queryLower);
    const categoryMatch = generic.category.toLowerCase().includes(queryLower);
    const therapeuticMatch = generic.therapeutic_class.toLowerCase().includes(queryLower);
    
    return genericNameMatch || categoryMatch || therapeuticMatch;
  });
  
  console.log(`[MOCK EMDEX] Generic search "${query}" returned ${results.length} results`);
  
  return {
    success: true,
    data: results,
    total: results.length,
  };
}

/**
 * Mock brand details
 */
async function mockBrandDetails(brandId) {
  await delay(200);
  const data = loadMockData();
  
  const brand = data.brands.find(b => b.id === String(brandId));
  
  if (!brand) {
    console.log(`[MOCK EMDEX] Brand ID "${brandId}" not found`);
    return {
      success: false,
      error: 'Brand not found',
    };
  }
  
  console.log(`[MOCK EMDEX] Brand details for "${brand.brand_name}"`);
  
  return {
    success: true,
    data: brand,
  };
}

/**
 * Mock generic details
 */
async function mockGenericDetails(genericId) {
  await delay(200);
  const data = loadMockData();
  
  const generic = data.generics.find(g => g.id === String(genericId));
  
  if (!generic) {
    console.log(`[MOCK EMDEX] Generic ID "${genericId}" not found`);
    return {
      success: false,
      error: 'Generic not found',
    };
  }
  
  // Find brands for this generic
  const relatedBrands = data.brands.filter(b => 
    b.generic_name.toLowerCase() === generic.generic_name.toLowerCase()
  );
  
  console.log(`[MOCK EMDEX] Generic details for "${generic.generic_name}" with ${relatedBrands.length} brands`);
  
  return {
    success: true,
    data: {
      ...generic,
      brands: relatedBrands,
    },
  };
}

/**
 * Mock NAFDAC verification
 */
async function mockVerifyNafdac(nafdacNumber) {
  await delay(250);
  const data = loadMockData();
  
  if (!nafdacNumber || nafdacNumber.trim() === '') {
    return {
      success: false,
      verified: false,
      error: 'NAFDAC number is required',
    };
  }
  
  const normalizedNafdac = nafdacNumber.toUpperCase().replace(/\s+/g, '');
  
  const brand = data.brands.find(b => {
    const brandNafdac = b.nafdac_number.toUpperCase().replace(/\s+/g, '');
    return brandNafdac === normalizedNafdac;
  });
  
  if (brand) {
    console.log(`[MOCK EMDEX] Verified NAFDAC "${nafdacNumber}" -> ${brand.brand_name}`);
    return {
      success: true,
      verified: true,
      data: brand,
    };
  }
  
  console.log(`[MOCK EMDEX] NAFDAC "${nafdacNumber}" not found`);
  return {
    success: true,
    verified: false,
    data: null,
  };
}

/**
 * Mock brands for generic
 */
async function mockBrandsForGeneric(genericId) {
  await delay(200);
  const data = loadMockData();
  
  const generic = data.generics.find(g => g.id === String(genericId));
  
  if (!generic) {
    return {
      success: false,
      error: 'Generic not found',
    };
  }
  
  const relatedBrands = data.brands.filter(b => 
    b.generic_name.toLowerCase() === generic.generic_name.toLowerCase()
  );
  
  return {
    success: true,
    data: relatedBrands,
    total: relatedBrands.length,
  };
}

/**
 * Route mock requests based on endpoint
 */
async function mockEmdexRequest(endpoint, body = {}) {
  console.log(`[MOCK EMDEX] Request: ${endpoint}`, body);
  
  switch (endpoint) {
    case '/api/v1/login':
      return mockLogin();
      
    case '/api/v1/brands/search':
      return mockBrandSearch(body.query);
      
    case '/api/v1/brands/details':
      return mockBrandDetails(body.brand_id);
      
    case '/api/v1/generic/search':
      return mockGenericSearch(body.query);
      
    case '/api/v1/generic/details':
      return mockGenericDetails(body.generic_id);
      
    case '/api/v1/generic/brands':
      return mockBrandsForGeneric(body.generic_id);
      
    case '/api/v1/verify':
      return mockVerifyNafdac(body.nafdac_number);
      
    default:
      console.log(`[MOCK EMDEX] Unknown endpoint: ${endpoint}`);
      return {
        success: false,
        error: `Unknown endpoint: ${endpoint}`,
      };
  }
}

module.exports = {
  mockEmdexRequest,
  mockLogin,
  mockBrandSearch,
  mockGenericSearch,
  mockBrandDetails,
  mockGenericDetails,
  mockVerifyNafdac,
  mockBrandsForGeneric,
  loadMockData,
};
