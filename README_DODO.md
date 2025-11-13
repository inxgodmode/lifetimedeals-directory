# Dodo Payments integration (REST) — Notes

This repo contains Cloudflare Pages Functions that implement Dodo Payments REST checkout creation and webhook handling.

Environment variables (Cloudflare Pages Secrets / Environment):
- DODO_API_KEY: Server API key for Dodo
- DODO_WEBHOOK_SECRET: Webhook signing secret (used to verify dodo-signature)
- DODO_BASE_URL (optional): API base URL (defaults to https://api.dodopayments.com). Use test endpoint if required.
- PUBLIC_BASE_URL: e.g. https://yourdomain.example
- DB: D1 binding name (configured in Pages)

Endpoints:
- POST /api/create-checkout
  - body: { submissionId, amount_cents, currency, email, name }
  - response: { checkoutUrl, sessionId }
- POST /api/webhook
  - Dodo will POST webhook events here.
  - Expects header 'dodo-signature' containing HMAC-SHA256 of the raw body. The handler verifies and updates payments/submissions in D1.

Notes:
- The code assumes Dodo returns session fields session_id and checkout_url. If the live API differs, update src/lib/dodo.js parsing.
- Test the webhook by creating a test webhook in Dodo dashboard pointed to https://<your-site>/api/webhook and sending a sample event.
