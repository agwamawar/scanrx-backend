/**
 * EMDEX Authentication Test Endpoint
 * 
 * GET /api/test/emdex-auth
 * 
 * Tests that EMDEX authentication is working correctly.
 * This endpoint is for development testing only.
 * Remove or protect it before production.
 */

const { getToken, EmdexError } = require('../services/emdex-service');

module.exports = async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    // Attempt to get a token from EMDEX
    await getToken();

    return res.status(200).json({
      success: true,
      message: 'EMDEX authentication successful',
    });
  } catch (error) {
    console.error('EMDEX auth test failed:', error);

    const errorMessage = error instanceof EmdexError
      ? error.message
      : 'Unknown error during EMDEX authentication';

    const errorCode = error instanceof EmdexError
      ? error.code
      : 'UNKNOWN_ERROR';

    return res.status(500).json({
      success: false,
      error: errorMessage,
      code: errorCode,
    });
  }
};
