// Dodo REST adapter for Cloudflare Pages Functions (Workers runtime)
// - createCheckout: calls Dodo REST create-checkout endpoint and returns { session_id, checkout_url }
// - verifyWebhook: verifies HMAC-SHA256 signature from header 'dodo-signature'
//
// Requires env.DODO_API_KEY and env.DODO_WEBHOOK_SECRET to be set in Pages environment.
//
// NOTE: endpoint base may be test vs live. Use env.DODO_BASE_URL to override (default: https://api.dodopayments.com)

export async function createDodoCheckout({ env, submissionId, amount_cents, currency = 'USD', customer = {}, return_url }) {
  const apiKey = env.DODO_API_KEY;
  if (!apiKey) throw new Error('DODO_API_KEY missing in environment');

  const base = env.DODO_BASE_URL || 'https://api.dodopayments.com';
  const url = `${base.replace(/\/$/, '')}/checkout-sessions`;

  // Build payload following the example from docs
  const payload = {
    product_cart: [
      {
        // We include submissionId as product_id so Dodo will relay it back in metadata,
        // if Dodo supports metadata you can add metadata instead — adapt if necessary.
        product_id: submissionId,
        quantity: 1,
        price_cents: amount_cents,
      },
    ],
    customer: {
      email: customer.email || null,
      name: customer.name || null,
    },
    metadata: {
      submissionId,
    },
    return_url,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = text || `${res.status} ${res.statusText}`;
    throw new Error(`Dodo createCheckout failed: ${err}`);
  }

  // Parse JSON response
  const json = JSON.parse(text);
  // Expected fields (per docs): session_id, checkout_url, status, expires_at
  return {
    session_id: json.session_id || json.id || json.sessionId || null,
    checkout_url: json.checkout_url || json.checkoutUrl || json.url || null,
    raw: json,
  };
}

export async function verifyDodoWebhook({ rawBody, signatureHeader, webhookSecret }) {
  // signatureHeader expected from header 'dodo-signature'
  if (!webhookSecret) {
    return { verified: false, reason: 'no_webhook_secret', event: null };
  }
  try {
    // compute HMAC-SHA256(rawBody, webhookSecret) -> hex
    const enc = new TextEncoder();
    const keyData = enc.encode(webhookSecret);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(rawBody));
    const sigArray = Array.from(new Uint8Array(sigBuffer));
    const sigHex = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const header = (signatureHeader || '').trim();

    // Accept either raw hex or 'sha256=<hex>'
    const headerHex = header.startsWith('sha256=') ? header.slice(7) : header;
    const verified = headerHex && headerHex === sigHex;

    let event = null;
    try { event = JSON.parse(rawBody); } catch (e) { event = null; }

    return { verified, event, computed_signature: sigHex, header_signature: headerHex };
  } catch (err) {
    return { verified: false, reason: err.message, event: null };
  }
}