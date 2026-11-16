// The Stripe webhook route: signature checks, the body size cap, and when Stripe is asked to retry.
// Uses Stripe's real signature code with a local secret; the events used never reach Stripe or MongoDB.
const crypto = require('crypto');

const WEBHOOK_SECRET = `whsec_${crypto.randomBytes(24).toString('hex')}`;
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_unused';
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_unused';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Stripe = require('stripe');
const stripe = new Stripe('sk_test_unused');
const subscriptionController = require('../controllers/subscriptionController');
const { readBody, handleStripeWebhook } = require('../controllers/stripeWebhookController');
const { errorHandler } = require('../middleware/errorHandler');
const { serve } = require('./helpers');

let api;

before(async () => {
  console.log = () => {};
  console.error = () => {};
  const app = express();
  app.post('/subscription/webhook', readBody, handleStripeWebhook);
  app.use(errorHandler);
  api = await serve(app);
});

after(() => api.close());

function deliver(body, { secret = WEBHOOK_SECRET } = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return api.request('/subscription/webhook', { method: 'POST', headers: { 'stripe-signature': signature }, body: payload });
}

test('an event type the server does not track is acknowledged with 200', async () => {
  const response = await deliver({ id: 'evt_1', type: 'customer.created', data: { object: { customer: 'cus_1' } } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { received: true });
});

test('a tracked event without a customer answers 200: a retry couldn\'t change anything', async () => {
  assert.equal((await deliver({ id: 'evt_2', type: 'invoice.paid', data: { object: {} } })).status, 200);
});

test('a tracked event that fails to process answers 500, so Stripe retries', async () => {
  const original = subscriptionController.processWebhookEvent;
  subscriptionController.processWebhookEvent = async () => false;
  try {
    const response = await deliver({ id: 'evt_2b', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
    assert.equal(response.status, 500);
    assert.equal(response.text.includes('at '), false, 'no stack trace');
  } finally {
    subscriptionController.processWebhookEvent = original;
  }
});

test('an error thrown while processing also answers 500', async () => {
  const original = subscriptionController.processWebhookEvent;
  subscriptionController.processWebhookEvent = async () => { throw new Error('database down'); };
  try {
    assert.equal((await deliver({ id: 'evt_3', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } })).status, 500);
  } finally {
    subscriptionController.processWebhookEvent = original;
  }
});

test('a delivery with a bad signature answers 400', async () => {
  const otherSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  assert.equal((await deliver({ id: 'evt_4', type: 'customer.created', data: { object: {} } }, { secret: otherSecret })).status, 400);
});

test('the server\'s Stripe client sends the pinned API version, not the package default', async () => {
  const { stripe: client, STRIPE_API_VERSION } = require('../utilities/stripe');
  assert.equal(STRIPE_API_VERSION, '2025-04-30.basil');
  assert.equal(client.getApiField('version'), STRIPE_API_VERSION);
  assert.notEqual(Stripe.API_VERSION, STRIPE_API_VERSION, 'the package default differs, so the pin matters');

  // The same configuration with a local HTTP client, to see the header that would go to Stripe.
  let sent;
  class CaptureClient extends Stripe.HttpClient {
    getClientName() { return 'capture'; }
    async makeRequest(host, port, path, method, headers) {
      sent = headers;
      const response = new Stripe.HttpClientResponse(200, {});
      response.toJSON = async () => ({ object: 'list', data: [], has_more: false });
      response.getRawResponse = () => ({});
      return response;
    }
  }
  const local = new Stripe('sk_test_unused', { apiVersion: STRIPE_API_VERSION, httpClient: new CaptureClient(), maxNetworkRetries: 0 });
  await local.subscriptions.list({ limit: 1 });
  assert.equal(sent['Stripe-Version'], '2025-04-30.basil');
});

test('a body over 1 MB is rejected with 413 before the signature is checked', async () => {
  const response = await deliver({ id: 'evt_5', type: 'customer.created', data: { object: { padding: 'x'.repeat(1024 * 1024) } } });
  assert.equal(response.status, 413);
  assert.deepEqual(response.body, { error: 'Payload Too Large' });
});
