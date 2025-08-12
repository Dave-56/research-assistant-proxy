# Research Assistant Proxy Server

This proxy server securely handles API requests from the Research Assistant Chrome Extension.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your Anthropic API key

3. Run the server:
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

## Endpoints

- `GET /health` - Health check
- `POST /api/summary` - Generate AI summaries

## Security Features

- API key stored securely on server
- CORS configured for Chrome extensions only
- Rate limiting (100 requests per 15 minutes per IP)
- No API key exposure to client

## Deployment

You can deploy this to:
- Heroku
- Vercel
- Railway
- DigitalOcean
- Any Node.js hosting service

Remember to set your environment variables in your hosting platform.