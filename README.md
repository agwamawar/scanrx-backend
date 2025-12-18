# ScanRx Backend API

Backend API for the ScanRx drug verification app. Handles image analysis using Llama Vision AI.

## Quick Deploy to Vercel

### Prerequisites
- A [Vercel account](https://vercel.com/signup) (free)
- A [Together AI](https://together.ai) API key (or Groq/Fireworks)

### Step-by-Step Deployment

#### Step 1: Get Your API Key

1. Go to [together.ai](https://together.ai)
2. Sign up for a free account
3. Go to Settings → API Keys
4. Create a new API key
5. Copy the key (starts with something like `sk-...`)

#### Step 2: Deploy to Vercel

**Option A: Deploy via Vercel Dashboard (Easiest)**

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New..." → "Project"
3. Click "Upload" (or connect GitHub if you prefer)
4. Drag and drop the `scanrx-backend` folder
5. Wait for upload to complete
6. Click "Deploy"

**Option B: Deploy via Command Line**

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to this folder
cd scanrx-backend

# Deploy
vercel

# Follow the prompts
```

#### Step 3: Add Your API Key

1. In Vercel dashboard, go to your project
2. Click "Settings" tab
3. Click "Environment Variables" in the sidebar
4. Add a new variable:
   - Name: `LLAMA_API_KEY`
   - Value: `your-api-key-here`
5. Click "Save"
6. Go to "Deployments" tab
7. Click the three dots on your latest deployment → "Redeploy"

#### Step 4: Get Your API URL

After deployment, Vercel gives you a URL like:
```
https://scanrx-backend.vercel.app
```

This is your backend URL!

#### Step 5: Update Your Flutter App

In your Flutter app, update the API endpoint in `scan_screen.dart`:

```dart
_drugAnalysisService = DrugAnalysisService(
  config: DrugAnalysisConfig(
    apiEndpoint: 'https://scanrx-backend.vercel.app',  // ← Your URL here
    apiVersion: '/v1',
  ),
);
```

## API Endpoints

### POST /v1/analyze

Analyze a drug image.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `image` field with JPEG/PNG file

**Response:**
```json
{
  "identified": true,
  "confidence": 0.95,
  "brand_name": "Panadol Extra",
  "generic_name": "Paracetamol + Caffeine",
  "nafdac_number": "A4-0123",
  "manufacturer": "GlaxoSmithKline",
  "strength": "500mg/65mg",
  "dosage_form": "Tablet",
  "pack_size": "24 tablets",
  "batch_number": "ABC123",
  "expiry_date": "2025-12",
  "description": "Pain relief medication",
  "image_quality": "good"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "service": "scanrx-backend"
}
```

### POST /api/drugs/search

Unified drug search - searches both brand and generic names via EMDEX.

**Request:**
```json
{
  "query": "panadol",
  "type": "all",
  "limit": 20
}
```

- `query` (required): Search term
- `type` (optional): "all" | "brand" | "generic" (default: "all")
- `limit` (optional): Max results to return (default: 20)

**Response:**
```json
{
  "success": true,
  "query": "panadol",
  "source": "emdex",
  "type": "all",
  "results": [
    {
      "id": "emdex_brand_123",
      "type": "brand",
      "brand_name": "Panadol Extra",
      "generic_name": "Paracetamol + Caffeine",
      "manufacturer": "GlaxoSmithKline",
      "strength": "500mg/65mg",
      "dosage_form": "Tablet",
      "nafdac_number": "A4-0123",
      "is_verified": true,
      "source": "emdex"
    }
  ],
  "total": 25,
  "brand_count": 15,
  "generic_count": 10
}
```

### POST /api/drugs/search/brands

Search brand name drugs only.

**Request:**
```json
{
  "query": "panadol",
  "limit": 20
}
```

### POST /api/drugs/search/generic

Search generic name drugs only.

**Request:**
```json
{
  "query": "paracetamol",
  "limit": 20
}
```

### GET /api/drugs/{id}

Get comprehensive details for a specific drug.

**URL Examples:**
- `/api/drugs/emdex_brand_12345`
- `/api/drugs/emdex_generic_67890`

**Response:**
```json
{
  "success": true,
  "drug": {
    "id": "emdex_brand_12345",
    "type": "brand",
    "source": "emdex",
    "brand_name": "Panadol Extra",
    "generic_name": "Paracetamol + Caffeine",
    "manufacturer": "GlaxoSmithKline",
    "manufacturer_country": "Nigeria",
    "nafdac_number": "A4-0123",
    "is_verified": true,
    "verification_source": "EMDEX/NAFDAC Database",
    "strength": "500mg/65mg",
    "dosage_form": "Tablet",
    "pack_sizes": ["12 tablets", "24 tablets"],
    "therapeutic_class": "Analgesic",
    "active_ingredients": [
      { "name": "Paracetamol", "amount": "500mg" },
      { "name": "Caffeine", "amount": "65mg" }
    ],
    "indications": ["Headache", "Fever", "Pain"],
    "contraindications": ["Hypersensitivity"],
    "side_effects": ["Nausea", "Allergic reactions"],
    "warnings": ["Do not exceed 8 tablets in 24 hours"],
    "dosage_instructions": {
      "adults": "1-2 tablets every 4-6 hours",
      "children": "Not recommended under 12",
      "elderly": "Use with caution"
    },
    "prescription_required": false,
    "similar_drugs": [...]
  }
}
```

**Error Responses:**
- `400` - Invalid drug ID format
- `404` - Drug not found
- `503` - Drug database unavailable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLAMA_API_KEY` | Yes | Your Together AI / Groq / Fireworks API key |
| `LLAMA_PROVIDER` | No | Provider to use: `together` (default), `groq`, or `fireworks` |
| `EMDEX_API_URL` | Yes | EMDEX API base URL (e.g., `https://sandbox.emdexapi.com`) |
| `EMDEX_EMAIL` | Yes | Your EMDEX account email |
| `EMDEX_PASSWORD` | Yes | Your EMDEX account password |

### EMDEX API (Drug Database)

EMDEX is the authoritative source for Nigerian drug information. To set up:

1. Copy `.env.example` to `.env` for local development
2. Add your EMDEX credentials to `.env`
3. For Vercel deployment, add these in Settings → Environment Variables

## Testing

Test your deployed API:

```bash
# Health check
curl https://your-app.vercel.app/health

# Test EMDEX authentication
curl https://your-app.vercel.app/api/test/emdex-auth

# Search drugs (unified)
curl -X POST https://your-app.vercel.app/api/drugs/search \
  -H "Content-Type: application/json" \
  -d '{"query": "panadol", "type": "all"}'

# Search brand drugs only
curl -X POST https://your-app.vercel.app/api/drugs/search/brands \
  -H "Content-Type: application/json" \
  -d '{"query": "panadol"}'

# Search generic drugs only
curl -X POST https://your-app.vercel.app/api/drugs/search/generic \
  -H "Content-Type: application/json" \
  -d '{"query": "paracetamol"}'

# Get drug details
curl https://your-app.vercel.app/api/drugs/emdex_brand_12345

# Analyze an image
curl -X POST https://your-app.vercel.app/v1/analyze \
  -F "image=@test-image.jpg"
```

## Troubleshooting

**"API authentication failed"**
- Check that your `LLAMA_API_KEY` is set correctly in Vercel environment variables
- Make sure you redeployed after adding the variable

**"Service temporarily unavailable"**
- You've hit rate limits. Wait a moment and try again.
- Consider upgrading your Together AI plan.

**"No image provided"**
- Make sure you're sending the image as a `multipart/form-data` with field name `image`

## Cost

- **Together AI**: ~$0.001 per analysis (very cheap)
- **Vercel**: Free tier includes 100GB bandwidth/month (plenty for most apps)
