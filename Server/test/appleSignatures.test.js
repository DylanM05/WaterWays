// In production, every Apple transaction must be signed by Apple, even if unsigned testing was left on.
process.env.NODE_ENV = 'production';
process.env.APPLE_ALLOW_UNSIGNED_TESTING = 'true';
delete process.env.APPLE_APP_ID;

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const AppleSubscription = require('../models/AppleSubscription');
const AppleSubscriptionAccount = require('../models/AppleSubscriptionAccount');
const controller = require('../controllers/appleSubscriptionController');
const { fakeModel, serve } = require('./helpers');

const TOKEN = '11111111-1111-4111-8111-111111111111';
let api;
let subscriptions;

before(async () => {
  console.error = () => {}; // logs the missing APPLE_APP_ID and each failed verification
  console.warn = () => {};
  subscriptions = fakeModel(AppleSubscription);
  fakeModel(AppleSubscriptionAccount, [{ userId: 'user_a', appAccountToken: TOKEN }]);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userId = 'user_a';
    next();
  });
  app.post('/verify', controller.verifyTransaction);
  app.post('/notifications', controller.handleServerNotification);
  api = await serve(app);
});

after(() => api.close());

function forgedTransaction(environment, header = { alg: 'ES256', x5c: [] }) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode(header)}.${encode({
    bundleId: 'ca.waterways.native',
    environment,
    productId: 'ca.waterways.native.premium.annual',
    transactionId: 't1',
    originalTransactionId: 'o1',
    appAccountToken: TOKEN,
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 365 * 24 * 60 * 60 * 1000
  })}.forged`;
}

for (const environment of ['Xcode', 'LocalTesting', 'Sandbox', 'Production']) {
  test(`rejects an unsigned ${environment} transaction`, async () => {
    const response = await api.request('/verify', { method: 'POST', body: { signedTransaction: forgedTransaction(environment) } });
    assert.equal(response.status, 400);
    assert.equal(subscriptions.length, 0);
  });
}

test('rejects a transaction with a made-up certificate chain', async () => {
  const fakeCertificate = Buffer.from('not a certificate').toString('base64');
  const signedTransaction = forgedTransaction('Sandbox', { alg: 'ES256', x5c: [fakeCertificate, fakeCertificate, fakeCertificate] });
  const response = await api.request('/verify', { method: 'POST', body: { signedTransaction } });
  assert.equal(response.status, 400);
  assert.equal(subscriptions.length, 0);
});

test('rejects a forged server notification', async () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signedPayload = `${encode({ alg: 'ES256', x5c: [] })}.${encode({
    notificationType: 'DID_RENEW',
    data: { bundleId: 'ca.waterways.native', environment: 'Sandbox', signedTransactionInfo: forgedTransaction('Sandbox') }
  })}.forged`;
  const response = await api.request('/notifications', { method: 'POST', body: { signedPayload } });
  assert.equal(response.status, 400);
  assert.equal(subscriptions.length, 0);
});

test('stored Xcode test purchases never count as premium in production', () => {
  const filter = AppleSubscription.activeFilter('user_a');
  assert.deepEqual(filter.environment, { $nin: ['Xcode', 'LocalTesting'] });
});
