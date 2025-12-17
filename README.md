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

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLAMA_API_KEY` | Yes | Your Together AI / Groq / Fireworks API key |
| `LLAMA_PROVIDER` | No | Provider to use: `together` (default), `groq`, or `fireworks` |

## Testing

Test your deployed API:

```bash
# Health check
curl https://your-app.vercel.app/health

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
