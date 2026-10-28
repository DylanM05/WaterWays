// Apple purchase ownership rules. Uses Xcode transactions, which Apple's library decodes without a
// signature when unsigned testing is enabled; appleSignatures.test.js covers the signed path.
process.env.NODE_ENV = 'test';
process.env.APPLE_ALLOW_UNSIGNED_TESTING = 'true';
delete process.env.APPLE_APP_ID;

const { test, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const AppleSubscription = require('../models/AppleSubscription');
const AppleSubscriptionAccount = require('../models/AppleSubscriptionAccount');
const controller = require('../controllers/appleSubscriptionController');
const { fakeModel, serve } = require('./helpers');

const MONTHLY = 'ca.waterways.native.premium.monthly';
const TOKEN_A = '11111111-1111-4111-8111-111111111111';
const TOKEN_B = '22222222-2222-4222-8222-222222222222';
const DAY = 24 * 60 * 60 * 1000;

function xcodeTransaction(fields) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {
    bundleId: 'ca.waterways.native',
    environment: 'Xcode',
    productId: MONTHLY,
    type: 'Auto-Renewable Subscription',
    inAppOwnershipType: 'PURCHASED',
    signedDate: Date.now(),
    purchaseDate: Date.now() - DAY,
    expiresDate: Date.now() + 29 * DAY,
    ...fields
  };
  return `${encode({ alg: 'ES256', x5c: [] })}.${encode(payload)}.unsigned`;
}

let subscriptions;
let api;

before(async () => {
  // The controller logs each rejected transaction.
  console.warn = () => {};
  console.error = () => {};
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userId = req.headers['x-test-user'];
    next();
  });
  app.post('/verify', controller.verifyTransaction);
  app.get('/account-token', controller.getAccountToken);
  api = await serve(app);
});

after(() => api.close());

beforeEach(() => {
  subscriptions = fakeModel(AppleSubscription);
  fakeModel(AppleSubscriptionAccount, [
    { userId: 'user_a', appAccountToken: TOKEN_A },
    { userId: 'user_b', appAccountToken: TOKEN_B }
  ]);
});

const verify = (user, fields) => api.request('/verify', {
  method: 'POST',
  headers: { 'x-test-user': user },
  body: { signedTransaction: xcodeTransaction(fields) }
});

test('stores a purchase made with the buyer\'s own app account token', async () => {
  const response = await verify('user_a', { transactionId: 't1', originalTransactionId: 'o1', appAccountToken: TOKEN_A });
  assert.equal(response.status, 200);
  assert.equal(subscriptions.length, 1);
  assert.equal(subscriptions[0].userId, 'user_a');
  assert.equal(subscriptions[0].productId, MONTHLY);
  assert.ok(subscriptions[0].expiresAt > new Date());
});

test('rejects a purchase made under another account\'s app account token', async () => {
  const response = await verify('user_a', { transactionId: 't1', originalTransactionId: 'o1', appAccountToken: TOKEN_B });
  assert.equal(response.status, 403);
  assert.equal(subscriptions.length, 0);
});

test('rejects a purchase without an app account token', async () => {
  const response = await verify('user_a', { transactionId: 't1', originalTransactionId: 'o1' });
  assert.equal(response.status, 403);
  assert.equal(subscriptions.length, 0);
});

test('rejects products that are not WaterWays subscriptions', async () => {
  const response = await verify('user_a', {
    transactionId: 't1', originalTransactionId: 'o1', appAccountToken: TOKEN_A, productId: 'com.example.other'
  });
  assert.equal(response.status, 400);
  assert.equal(subscriptions.length, 0);
});

test('rejects transactions for another app', async () => {
  const response = await verify('user_a', {
    transactionId: 't1', originalTransactionId: 'o1', appAccountToken: TOKEN_A, bundleId: 'com.example.app'
  });
  assert.equal(response.status, 400);
  assert.equal(subscriptions.length, 0);
});

test('refuses a subscription that is already linked to another account', async () => {
  subscriptions.push({ userId: 'user_b', originalTransactionId: 'o1', transactionId: 't1', purchaseDate: new Date(Date.now() - DAY) });
  const response = await verify('user_a', { transactionId: 't2', originalTransactionId: 'o1', appAccountToken: TOKEN_A });
  assert.equal(response.status, 409);
  assert.equal(subscriptions[0].userId, 'user_b');
});

test('ignores an older purchase that arrives after a newer one', async () => {
  subscriptions.push({
    userId: 'user_a', originalTransactionId: 'o1', transactionId: 't2', purchaseDate: new Date(Date.now() - DAY)
  });
  const response = await verify('user_a', {
    transactionId: 't1', originalTransactionId: 'o1', appAccountToken: TOKEN_A, purchaseDate: Date.now() - 40 * DAY
  });
  assert.equal(response.status, 200);
  assert.equal(subscriptions[0].transactionId, 't2');
});

test('a newer purchase (renewal or plan change) replaces the stored one', async () => {
  subscriptions.push({
    userId: 'user_a', originalTransactionId: 'o1', transactionId: 't1', purchaseDate: new Date(Date.now() - 40 * DAY)
  });
  const response = await verify('user_a', {
    transactionId: 't2', originalTransactionId: 'o1', appAccountToken: TOKEN_A, productId: 'ca.waterways.native.premium.annual'
  });
  assert.equal(response.status, 200);
  assert.equal(subscriptions[0].transactionId, 't2');
  assert.equal(subscriptions[0].productId, 'ca.waterways.native.premium.annual');
});

test('applies a refund to the buyer\'s own subscription even without an app account token', async () => {
  subscriptions.push({ userId: 'user_a', originalTransactionId: 'o1', transactionId: 't1', revocationDate: null });
  const response = await verify('user_a', { transactionId: 't1', originalTransactionId: 'o1', revocationDate: Date.now() });
  assert.equal(response.status, 200);
  assert.equal(response.body.revoked, true);
  assert.ok(subscriptions[0].revocationDate instanceof Date);
});

test('a refund cannot touch another account\'s subscription', async () => {
  subscriptions.push({ userId: 'user_b', originalTransactionId: 'o1', transactionId: 't1', revocationDate: null });
  const response = await verify('user_a', { transactionId: 't1', originalTransactionId: 'o1', revocationDate: Date.now() });
  assert.equal(response.status, 403);
  assert.equal(subscriptions[0].revocationDate, null);
});

test('verifying a purchase requires sign-in', async () => {
  const response = await api.request('/verify', { method: 'POST', body: { signedTransaction: xcodeTransaction({}) } });
  assert.equal(response.status, 401);
});

test('each account gets one stable app account token', async () => {
  const accounts = fakeModel(AppleSubscriptionAccount);
  const first = await api.request('/account-token', { headers: { 'x-test-user': 'user_new' } });
  const second = await api.request('/account-token', { headers: { 'x-test-user': 'user_new' } });
  assert.equal(first.status, 200);
  assert.match(first.body.appAccountToken, /^[0-9a-f-]{36}$/);
  assert.equal(second.body.appAccountToken, first.body.appAccountToken);
  assert.equal(accounts.length, 1);
});
