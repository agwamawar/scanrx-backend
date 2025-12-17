const multer = require('multer');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// Promisify multer middleware
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

// System prompt for Llama
const SYSTEM_PROMPT = `You are a pharmaceutical identification assistant specializing in Nigerian medications. 
Analyze medication packaging images and extract drug information. 
Always respond with valid JSON only, no markdown formatting or explanation outside the JSON.
Focus on accurately extracting NAFDAC registration numbers and all visible text.`;

// Analysis prompt
const ANALYSIS_PROMPT = `Analyze this medication packaging image. Extract all visible information and return a JSON object with these exact fields:

{
  "identified": boolean,
  "confidence": number between 0.0 and 1.0,
  "brand_name": string or null,
  "generic_name": string or null,
  "nafdac_number": string or null (look for NAFDAC REG NO or similar),
  "manufacturer": string or null,
  "strength": string or null (e.g., "500mg"),
  "dosage_form": string or null (tablet, capsule, syrup, etc.),
  "pack_size": string or null (e.g., "24 tablets"),
  "batch_number": string or null,
  "expiry_date": string or null,
  "manufacturing_date": string or null,
  "country_of_origin": string or null,
  "active_ingredients": array of strings or null,
  "storage_instructions": string or null,
  "prescription_required": boolean or null,
  "warnings_visible": array of strings or null,
  "description": brief description of what the medication is for,
  "verification_notes": any concerns about authenticity,
  "image_quality": "good", "fair", or "poor",
  "suggestions": suggestions if information is unclear or incomplete
}

Important:
- Extract information exactly as shown on packaging
- For NAFDAC number, look for patterns like "NAFDAC REG NO:", "NAFDAC:", "A4-XXXX", "B2-XXXX"
- If information is not visible or unclear, use null
- If you cannot identify the medication at all, set identified to false
- Return ONLY the JSON object, no other text`;

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    await runMiddleware(req, res, upload.single('image'));

    // Check if image was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Get API key from environment variable
    const apiKey = process.env.LLAMA_API_KEY;
    if (!apiKey) {
      console.error('LLAMA_API_KEY not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Convert image to base64
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    console.log(`Processing image: ${req.file.size} bytes`);

    // Determine which API provider to use
    const provider = process.env.LLAMA_PROVIDER || 'together';
    let apiUrl, model;

    switch (provider) {
      case 'groq':
        apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        model = 'llama-3.2-11b-vision-preview';
        break;
      case 'fireworks':
        apiUrl = 'https://api.fireworks.ai/inference/v1/chat/completions';
        model = 'accounts/fireworks/models/llama-v3p2-11b-vision-instruct';
        break;
      case 'together':
      default:
        apiUrl = 'https://api.together.xyz/v1/chat/completions';
        model = 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo';
        break;
    }

    // Build request body
    const requestBody = {
      model: model,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: dataUri,
              },
            },
            {
              type: 'text',
              text: ANALYSIS_PROMPT,
            },
          ],
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    };

    // Call Llama Vision API
    const llamaResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Handle API errors
    if (!llamaResponse.ok) {
      const errorText = await llamaResponse.text();
      console.error(`Llama API error: ${llamaResponse.status} - ${errorText}`);
      
      if (llamaResponse.status === 401) {
        return res.status(500).json({ error: 'API authentication failed' });
      } else if (llamaResponse.status === 429) {
        return res.status(503).json({ error: 'Service temporarily unavailable' });
      } else {
        return res.status(500).json({ error: 'Analysis service error' });
      }
    }

    // Parse Llama response
    const llamaData = await llamaResponse.json();
    
    // Extract content from response
    let content = '';
    try {
      content = llamaData.choices?.[0]?.message?.content || '';
    } catch (e) {
      console.error('Error extracting content:', e);
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    if (!content) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    // Clean up content (remove markdown code blocks if present)
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.substring(7);
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.substring(3);
    }
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.substring(0, cleanContent.length - 3);
    }
    cleanContent = cleanContent.trim();

    // Parse JSON from Llama
    let analysisResult;
    try {
      analysisResult = JSON.parse(cleanContent);
    } catch (e) {
      console.error('JSON parse error:', e);
      console.error('Raw content:', content);
      return res.status(500).json({ error: 'Failed to parse analysis result' });
    }

    // Return successful result
    console.log('Analysis complete:', analysisResult.brand_name || 'Unknown');
    return res.status(200).json(analysisResult);

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
