// Cloudflare Pages Function: /api/webhook
// - Verifies dodo-signature (HMAC-SHA256)
// - Logs raw webhook to webhook_logs
// - Updates payments and submissions on successful payments

import { verifyDodoWebhook } from '../../src/lib/dodo.js';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const rawBody = await request.text();
    const signatureHeader = request.headers.get('dodo-signature') || request.headers.get('Dodo-Signature') || '';

    // 1) Verify webhook
    const { verified, event, reason, computed_signature } = await verifyDodoWebhook({
      rawBody,
      signatureHeader,
      webhookSecret: env.DODO_WEBHOOK_SECRET,
    });

    // 2) Insert raw webhook log for audit
    const logId = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO webhook_logs (id, provider, event_type, raw_payload, headers_json, verified, processed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
      ).bind(
        logId,
        'dodo',
        (event && event.type) || null,
        rawBody,
        JSON.stringify(Object.fromEntries(request.headers.entries())),
        verified ? 1 : 0,
        0
      ).run();
    } catch (err) {
      console.error('Failed to write webhook_log', err);
    }

    if (!verified) {
      console.warn('Webhook signature verification failed:', reason);
      return new Response('Invalid signature', { status: 400 });
    }

    // 3) Process event
    try {
      const eventType = event.type || event.event || null;
      // Typical event: { type: 'checkout.session.completed', data: { id, amount, currency, metadata: { submissionId }, customer: { email } } }
      if (eventType === 'checkout.session.completed' || eventType === 'payment.succeeded' || eventType === 'payment.completed') {
        const data = event.data || event.object || {};
        const providerPaymentId = data.id || data.session_id || data.payment_id || null;
        const submissionId = (data.metadata && (data.metadata.submissionId || data.metadata.submission_id)) || null;
        const amount_cents = data.amount || data.amount_cents || null;
        const currency = data.currency || 'USD';
        const customer_email = (data.customer && data.customer.email) || data.customer_email || null;

        // Upsert payments record (mark completed)
        const paymentId = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO payments (id, provider, provider_payment_id, submission_id, status, amount_cents, currency, customer_email, metadata_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        ).bind(
          paymentId,
          'dodo',
          providerPaymentId,
          submissionId,
          'completed',
          amount_cents,
          currency,
          customer_email,
          JSON.stringify(data)
        ).run();

        // Update submission status if present
        if (submissionId) {
          await env.DB.prepare(
            `UPDATE submissions SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
          ).bind(submissionId).run();
        }

        // Optionally: auto-publish product here if you want automated acceptance.
      }

      // mark webhook log processed
      await env.DB.prepare(`UPDATE webhook_logs SET processed = 1 WHERE id = ?`).bind(logId).run();

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('Webhook processing error', err);
      return new Response('Processing error', { status: 500 });
    }
  }
};