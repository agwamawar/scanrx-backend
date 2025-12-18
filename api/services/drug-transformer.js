/**
 * Drug Data Transformer
 * 
 * Transforms EMDEX API responses to the ScanRx app's Drug model format.
 * 
 * NOTE: The exact field names from EMDEX may vary. Log raw responses during
 * development to verify and adjust field mappings as needed.
 */

/**
 * Transform an EMDEX brand drug response to app format
 * 
 * @param {Object} emdexData - Raw data from EMDEX brand search
 * @returns {Object} Transformed drug object
 */
function transformEmdexBrand(emdexData) {
  if (!emdexData) return null;

  // Map EMDEX fields to our Drug model
  // Adjust these field names based on actual EMDEX API response structure
  return {
    id: `emdex_brand_${emdexData.id || emdexData.brand_id || generateTempId()}`,
    type: 'brand',
    brand_name: emdexData.brand_name || emdexData.name || emdexData.brandName || null,
    generic_name: emdexData.generic_name || emdexData.genericName || emdexData.active_ingredient || null,
    manufacturer: emdexData.manufacturer || emdexData.company || emdexData.mfr || null,
    strength: emdexData.strength || emdexData.dosage || null,
    dosage_form: emdexData.dosage_form || emdexData.form || emdexData.dosageForm || null,
    nafdac_number: emdexData.nafdac_number || emdexData.nafdac_no || emdexData.registration_number || null,
    pack_size: emdexData.pack_size || emdexData.packSize || null,
    category: emdexData.category || emdexData.therapeutic_class || null,
    description: emdexData.description || emdexData.indication || null,
    price: emdexData.price || emdexData.retail_price || null,
    is_verified: true, // EMDEX drugs are NAFDAC registered
    source: 'emdex',
    raw_data: emdexData, // Keep raw data for debugging
  };
}

/**
 * Transform an EMDEX generic drug response to app format
 * 
 * @param {Object} emdexData - Raw data from EMDEX generic search
 * @returns {Object} Transformed drug object
 */
function transformEmdexGeneric(emdexData) {
  if (!emdexData) return null;

  // Map EMDEX fields to our Drug model
  // Adjust these field names based on actual EMDEX API response structure
  return {
    id: `emdex_generic_${emdexData.id || emdexData.generic_id || generateTempId()}`,
    type: 'generic',
    brand_name: null, // Generics don't have brand names
    generic_name: emdexData.generic_name || emdexData.name || emdexData.genericName || null,
    manufacturer: emdexData.manufacturer || emdexData.company || null,
    strength: emdexData.strength || emdexData.dosage || null,
    dosage_form: emdexData.dosage_form || emdexData.form || emdexData.dosageForm || null,
    nafdac_number: emdexData.nafdac_number || emdexData.nafdac_no || null,
    pack_size: emdexData.pack_size || emdexData.packSize || null,
    category: emdexData.category || emdexData.therapeutic_class || null,
    description: emdexData.description || emdexData.indication || null,
    price: emdexData.price || emdexData.retail_price || null,
    is_verified: true, // EMDEX drugs are NAFDAC registered
    source: 'emdex',
    raw_data: emdexData, // Keep raw data for debugging
  };
}

/**
 * Transform an array of EMDEX brand results
 * 
 * @param {Array} emdexResults - Array of raw EMDEX brand data
 * @returns {Array} Array of transformed drug objects
 */
function transformBrandResults(emdexResults) {
  if (!Array.isArray(emdexResults)) {
    // Handle case where results might be wrapped in an object
    if (emdexResults && emdexResults.data) {
      emdexResults = emdexResults.data;
    } else if (emdexResults && emdexResults.results) {
      emdexResults = emdexResults.results;
    } else if (emdexResults && emdexResults.brands) {
      emdexResults = emdexResults.brands;
    } else {
      return [];
    }
  }

  return emdexResults
    .map(transformEmdexBrand)
    .filter(drug => drug !== null);
}

/**
 * Transform an array of EMDEX generic results
 * 
 * @param {Array} emdexResults - Array of raw EMDEX generic data
 * @returns {Array} Array of transformed drug objects
 */
function transformGenericResults(emdexResults) {
  if (!Array.isArray(emdexResults)) {
    // Handle case where results might be wrapped in an object
    if (emdexResults && emdexResults.data) {
      emdexResults = emdexResults.data;
    } else if (emdexResults && emdexResults.results) {
      emdexResults = emdexResults.results;
    } else if (emdexResults && emdexResults.generics) {
      emdexResults = emdexResults.generics;
    } else {
      return [];
    }
  }

  return emdexResults
    .map(transformEmdexGeneric)
    .filter(drug => drug !== null);
}

/**
 * Remove duplicate drugs based on NAFDAC number
 * 
 * @param {Array} drugs - Array of drug objects
 * @returns {Array} Deduplicated array
 */
function removeDuplicates(drugs) {
  const seen = new Set();
  return drugs.filter(drug => {
    // Use NAFDAC number as unique identifier, or ID if no NAFDAC
    const key = drug.nafdac_number || drug.id;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Generate a temporary ID for drugs without one
 * @returns {string} Random ID
 */
function generateTempId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Parse a string of items into an array
 * Handles comma-separated, newline-separated, or semicolon-separated values
 * 
 * @param {string|Array} value - Value to parse
 * @returns {Array} Array of items
 */
function parseToArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  
  // Split by common delimiters
  return value
    .split(/[,;\n]+/)
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Parse active ingredients from EMDEX format
 * May be a string like "Paracetamol 500mg, Caffeine 65mg" or an array
 * 
 * @param {string|Array} ingredients - Raw ingredients data
 * @returns {Array} Array of ingredient objects
 */
function parseIngredients(ingredients) {
  if (!ingredients) return [];
  if (Array.isArray(ingredients)) {
    return ingredients.map(ing => {
      if (typeof ing === 'object') return ing;
      return parseIngredientString(ing);
    });
  }
  if (typeof ingredients !== 'string') return [];
  
  return ingredients
    .split(/[,;]+/)
    .map(ing => parseIngredientString(ing.trim()))
    .filter(ing => ing.name);
}

/**
 * Parse a single ingredient string like "Paracetamol 500mg"
 * 
 * @param {string} str - Ingredient string
 * @returns {Object} Ingredient object with name and amount
 */
function parseIngredientString(str) {
  if (!str) return { name: null, amount: null };
  
  // Try to match pattern like "Paracetamol 500mg" or "Paracetamol (500mg)"
  const match = str.match(/^(.+?)\s*[\(\[]?(\d+\.?\d*\s*(?:mg|g|ml|mcg|iu|%)?)\)?$/i);
  if (match) {
    return {
      name: match[1].trim(),
      amount: match[2].trim(),
    };
  }
  
  return { name: str, amount: null };
}

/**
 * Transform detailed EMDEX brand response to comprehensive app format
 * 
 * @param {Object} emdexData - Raw detailed data from EMDEX brand details
 * @param {string} originalId - The original app ID (with prefix)
 * @returns {Object} Comprehensive drug object
 */
function transformEmdexBrandDetails(emdexData, originalId) {
  if (!emdexData) return null;

  // Extract the EMDEX ID from original ID if needed
  const emdexId = emdexData.id || emdexData.brand_id || 
    (originalId ? originalId.replace('emdex_brand_', '') : null);

  return {
    // Basic identification
    id: originalId || `emdex_brand_${emdexId || generateTempId()}`,
    type: 'brand',
    source: 'emdex',

    // Names
    brand_name: emdexData.brand_name || emdexData.name || emdexData.brandName || null,
    generic_name: emdexData.generic_name || emdexData.genericName || emdexData.active_ingredient || null,
    
    // Manufacturer info
    manufacturer: emdexData.manufacturer || emdexData.company || emdexData.mfr || null,
    manufacturer_country: emdexData.manufacturer_country || emdexData.country || emdexData.origin || null,

    // Regulatory info
    nafdac_number: emdexData.nafdac_number || emdexData.nafdac_no || emdexData.registration_number || null,
    is_verified: true,
    verification_source: 'EMDEX/NAFDAC Database',

    // Formulation
    strength: emdexData.strength || emdexData.dosage || null,
    dosage_form: emdexData.dosage_form || emdexData.form || emdexData.dosageForm || null,
    pack_sizes: parseToArray(emdexData.pack_sizes || emdexData.pack_size || emdexData.packSize),
    route: emdexData.route || emdexData.administration_route || null,

    // Classification
    therapeutic_class: emdexData.therapeutic_class || emdexData.category || null,
    pharmacological_class: emdexData.pharmacological_class || emdexData.pharm_class || null,
    category: emdexData.category || emdexData.therapeutic_class || null,

    // Active ingredients
    active_ingredients: parseIngredients(
      emdexData.active_ingredients || emdexData.ingredients || emdexData.composition
    ),

    // Clinical information
    indications: parseToArray(emdexData.indications || emdexData.indication || emdexData.uses),
    contraindications: parseToArray(emdexData.contraindications || emdexData.contraindication),
    side_effects: parseToArray(
      emdexData.side_effects || emdexData.adverse_effects || emdexData.adverse_reactions
    ),
    warnings: parseToArray(emdexData.warnings || emdexData.precautions || emdexData.cautions),
    drug_interactions: parseToArray(emdexData.drug_interactions || emdexData.interactions),

    // Dosage
    dosage_instructions: {
      adults: emdexData.adult_dosage || emdexData.dosage_adult || emdexData.dosage || null,
      children: emdexData.pediatric_dosage || emdexData.dosage_children || emdexData.children_dosage || null,
      elderly: emdexData.elderly_dosage || emdexData.geriatric_dosage || null,
    },

    // Special populations
    pregnancy_category: emdexData.pregnancy_category || emdexData.pregnancy || null,
    breastfeeding: emdexData.breastfeeding || emdexData.lactation || null,

    // Storage and handling
    storage: emdexData.storage || emdexData.storage_conditions || null,

    // Prescription status
    prescription_required: emdexData.prescription_required ?? 
      emdexData.otc === false ?? 
      emdexData.rx_only ?? null,

    // Pricing
    price: emdexData.price || emdexData.retail_price || null,

    // Metadata
    description: emdexData.description || null,
    last_updated: emdexData.last_updated || emdexData.updated_at || null,

    // Keep raw data for debugging (can be removed in production)
    raw_data: emdexData,
  };
}

/**
 * Transform detailed EMDEX generic response to comprehensive app format
 * 
 * @param {Object} emdexData - Raw detailed data from EMDEX generic details
 * @param {string} originalId - The original app ID (with prefix)
 * @returns {Object} Comprehensive drug object
 */
function transformEmdexGenericDetails(emdexData, originalId) {
  if (!emdexData) return null;

  // Extract the EMDEX ID from original ID if needed
  const emdexId = emdexData.id || emdexData.generic_id || 
    (originalId ? originalId.replace('emdex_generic_', '') : null);

  return {
    // Basic identification
    id: originalId || `emdex_generic_${emdexId || generateTempId()}`,
    type: 'generic',
    source: 'emdex',

    // Names
    brand_name: null, // Generics don't have brand names
    generic_name: emdexData.generic_name || emdexData.name || emdexData.genericName || null,
    
    // Manufacturer info (may be null for generics)
    manufacturer: emdexData.manufacturer || emdexData.company || null,
    manufacturer_country: emdexData.manufacturer_country || emdexData.country || null,

    // Regulatory info
    nafdac_number: emdexData.nafdac_number || emdexData.nafdac_no || null,
    is_verified: true,
    verification_source: 'EMDEX/NAFDAC Database',

    // Formulation
    strength: emdexData.strength || emdexData.dosage || null,
    dosage_form: emdexData.dosage_form || emdexData.form || emdexData.dosageForm || null,
    pack_sizes: parseToArray(emdexData.pack_sizes || emdexData.pack_size),
    route: emdexData.route || emdexData.administration_route || null,

    // Classification
    therapeutic_class: emdexData.therapeutic_class || emdexData.category || null,
    pharmacological_class: emdexData.pharmacological_class || emdexData.pharm_class || null,
    category: emdexData.category || emdexData.therapeutic_class || null,

    // Active ingredients
    active_ingredients: parseIngredients(
      emdexData.active_ingredients || emdexData.ingredients || emdexData.composition
    ),

    // Clinical information
    indications: parseToArray(emdexData.indications || emdexData.indication || emdexData.uses),
    contraindications: parseToArray(emdexData.contraindications || emdexData.contraindication),
    side_effects: parseToArray(
      emdexData.side_effects || emdexData.adverse_effects || emdexData.adverse_reactions
    ),
    warnings: parseToArray(emdexData.warnings || emdexData.precautions || emdexData.cautions),
    drug_interactions: parseToArray(emdexData.drug_interactions || emdexData.interactions),

    // Dosage
    dosage_instructions: {
      adults: emdexData.adult_dosage || emdexData.dosage_adult || emdexData.dosage || null,
      children: emdexData.pediatric_dosage || emdexData.dosage_children || null,
      elderly: emdexData.elderly_dosage || emdexData.geriatric_dosage || null,
    },

    // Special populations
    pregnancy_category: emdexData.pregnancy_category || emdexData.pregnancy || null,
    breastfeeding: emdexData.breastfeeding || emdexData.lactation || null,

    // Storage and handling
    storage: emdexData.storage || emdexData.storage_conditions || null,

    // Prescription status
    prescription_required: emdexData.prescription_required ?? 
      emdexData.otc === false ?? 
      emdexData.rx_only ?? null,

    // Pricing
    price: emdexData.price || emdexData.retail_price || null,

    // Metadata
    description: emdexData.description || null,
    last_updated: emdexData.last_updated || emdexData.updated_at || null,

    // Keep raw data for debugging
    raw_data: emdexData,
  };
}

/**
 * Extract EMDEX ID from our app's prefixed ID
 * 
 * @param {string} appId - App ID like "emdex_brand_12345"
 * @returns {Object} { type: 'brand'|'generic', emdexId: '12345' } or null
 */
function parseAppDrugId(appId) {
  if (!appId || typeof appId !== 'string') return null;

  if (appId.startsWith('emdex_brand_')) {
    return {
      type: 'brand',
      emdexId: appId.replace('emdex_brand_', ''),
    };
  }

  if (appId.startsWith('emdex_generic_')) {
    return {
      type: 'generic',
      emdexId: appId.replace('emdex_generic_', ''),
    };
  }

  return null;
}

module.exports = {
  transformEmdexBrand,
  transformEmdexGeneric,
  transformBrandResults,
  transformGenericResults,
  removeDuplicates,
  transformEmdexBrandDetails,
  transformEmdexGenericDetails,
  parseAppDrugId,
};
