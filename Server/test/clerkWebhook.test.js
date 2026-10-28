// Account deletion: Clerk's user.deleted webhook removes the user's data and stops website billing.
const crypto = require('crypto');

const SIGNING_SECRET = `whsec_${crypto.randomBytes(24).toString('base64')}`;
process.env.CLERK_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;

// Replace Stripe before the controller loads, so no request leaves the machine.
const cancelled = [];
let cancelError = null;
const stripePath = require.resolve('stripe');
require.cache[stripePath] = {
  id: stripePath,
  filename: stripePath,
  loaded: true,
  exports: () => ({
    subscriptions: {
      cancel: async (id) => {
        if (cancelError) throw cancelError;
        cancelled.push(id);
      }
    }
  })
};

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { fakeModel, serve } = require('./helpers');
const { handleClerkWebhook } = require('../controllers/clerkWebhookController');

const MODELS = ['Admin', 'AppleSubscription', 'AppleSubscriptionAccount', 'CustomerMap', 'Favorite', 'LifetimePremium', 'UserSettings', 'UserVisits'];
let stores;
let invites;
let api;

before(async () => {
  console.log = () => {};
  console.error = () => {};
  const app = express();
  app.post('/clerk/webhook', express.raw({ type: 'application/json' }), handleClerkWebhook);
  api = await serve(app);
});

after(() => api.close());

beforeEach(() => {
  cancelled.length = 0;
  cancelError = null;
  stores = Object.fromEntries(MODELS.map(name => [name, fakeModel(require(`../models/${name}`), [
    { userId: 'user_gone' },
    { userId: 'user_kept' }
  ])]));
  stores.CustomerMap[0] = { userId: 'user_gone', subscriptionId: 'sub_123', subscriptionStatus: 'active' };
  invites = fakeModel(require('../models/InviteLink'), [
    { code: 'made-by-gone', createdBy: 'user_gone', redeemedBy: null },
    { code: 'used-by-gone', createdBy: 'user_kept', redeemedBy: 'user_gone' }
  ]);
});

function deliver(event, { secret = SIGNING_SECRET, timestamp = Math.floor(Date.now() / 1000), tamper = false } = {}) {
  const id = `msg_${crypto.randomBytes(6).toString('hex')}`;
  const body = JSON.stringify(event);
  const signature = crypto
    .createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  return api.request('/clerk/webhook', {
    method: 'POST',
    headers: { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}` },
    body: tamper ? body.replace('user_gone', 'user_kept') : body
  });
}

const deletedEvent = { type: 'user.deleted', data: { id: 'user_gone', deleted: true } };
const remainingUsers = () => Object.values(stores).flat().map(doc => doc.userId);

test('deletes the user\'s data in every collection and cancels their website subscription', async () => {
  const response = await deliver(deletedEvent);
  assert.equal(response.status, 200);
  assert.ok(!remainingUsers().includes('user_gone'));
  assert.equal(remainingUsers().filter(user => user === 'user_kept').length, MODELS.length);
  assert.deepEqual(cancelled, ['sub_123']);
  assert.deepEqual(invites.map(invite => [invite.code, invite.redeemedBy]), [['used-by-gone', null]]);
});

test('does not cancel a website subscription that already ended', async () => {
  stores.CustomerMap[0].subscriptionStatus = 'canceled';
  assert.equal((await deliver(deletedEvent)).status, 200);
  assert.deepEqual(cancelled, []);
});

test('a subscription Stripe no longer has still lets the deletion finish', async () => {
  cancelError = Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
  assert.equal((await deliver(deletedEvent)).status, 200);
  assert.ok(!remainingUsers().includes('user_gone'));
});

test('other Stripe failures answer 500 and keep the data, so Clerk retries', async () => {
  cancelError = new Error('Stripe is down');
  assert.equal((await deliver(deletedEvent)).status, 500);
  assert.ok(remainingUsers().includes('user_gone'));
});

test('rejects a tampered delivery', async () => {
  assert.equal((await deliver(deletedEvent, { tamper: true })).status, 400);
  assert.ok(remainingUsers().includes('user_gone'));
  assert.ok(remainingUsers().includes('user_kept'));
});

test('rejects a delivery signed with a different secret', async () => {
  const otherSecret = `whsec_${crypto.randomBytes(24).toString('base64')}`;
  assert.equal((await deliver(deletedEvent, { secret: otherSecret })).status, 400);
  assert.ok(remainingUsers().includes('user_gone'));
});

test('rejects a replayed delivery from more than five minutes ago', async () => {
  assert.equal((await deliver(deletedEvent, { timestamp: Math.floor(Date.now() / 1000) - 10 * 60 })).status, 400);
  assert.ok(remainingUsers().includes('user_gone'));
});

test('acknowledges other events without deleting anything', async () => {
  assert.equal((await deliver({ type: 'user.updated', data: { id: 'user_gone' } })).status, 200);
  assert.ok(remainingUsers().includes('user_gone'));
});

test('answers 500 when the signing secret is not configured', async () => {
  delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  try {
    assert.equal((await deliver(deletedEvent)).status, 500);
    assert.ok(remainingUsers().includes('user_gone'));
  } finally {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SIGNING_SECRET;
  }
});
