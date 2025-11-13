// Cloudflare Pages Function: /api/create-checkout
// Expects JSON body: { submissionId, amount_cents, currency, email, name }
// Calls Dodo REST to create a checkout session and returns { checkoutUrl, sessionId }

import { createDodoCheckout } from '../../src/lib/dodo.js';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const body = await request.json().catch(() => ({}));
    const { submissionId, amount_cents, currency = 'USD', email, name } = body;
    if (!submissionId || !amount_cents) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const return_url = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/thank-you?submissionId=${encodeURIComponent(submissionId)}`;

    try {
      const checkout = await createDodoCheckout({
        env,
        submissionId,
        amount_cents,
        currency,
        customer: { email, name },
        return_url,
      });

      const checkoutUrl = checkout.checkout_url;
      const sessionId = checkout.session_id || (checkout.raw && (checkout.raw.session_id || checkout.raw.id));

      // create a payments record (pending) in DB
      const paymentId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO payments (id, provider, provider_payment_id, submission_id, status, amount_cents, currency, metadata_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(paymentId, 'dodo', sessionId || '', submissionId, 'pending', amount_cents, currency, JSON.stringify({ checkout: checkout.raw })).run();

      return new Response(JSON.stringify({ checkoutUrl, sessionId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }
};