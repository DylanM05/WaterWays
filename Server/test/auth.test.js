// Sign-in checks and per-user data, using Clerk's real token verification (see clerkTestTokens).
const crypto = require('crypto');
const { bearer, clerkTestTokens, fakeModel, serve } = require('./helpers');

const sessionToken = clerkTestTokens();
// The subscription controller needs a Stripe key to load; these tests never reach Stripe.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_unused';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const UserSettings = require('../models/UserSettings');
const { verifyAuth, requireAuth } = require('../middleware/authMiddleware');

let api;
let settings;

before(async () => {
  console.error = () => {};
  settings = fakeModel(UserSettings, [
    { userId: 'user_a', settings: { temperatureUnit: 'celsius' } },
    { userId: 'user_b', settings: { temperatureUnit: 'fahrenheit' } }
  ]);
  const app = express();
  app.use(express.json());
  app.get('/optional', verifyAuth, (req, res) => res.json({ userId: req.userId ?? null }));
  app.get('/required', requireAuth, (req, res) => res.json({ userId: req.userId }));
  app.use('/s', require('../routes/settingsRoutes'));
  api = await serve(app);
});

after(() => api.close());

test('signed-out requests continue on optional routes', async () => {
  assert.deepEqual((await api.request('/optional')).body, { userId: null });
});

test('a valid session token identifies the user', async () => {
  assert.deepEqual((await api.request('/optional', { headers: bearer(sessionToken()) })).body, { userId: 'user_a' });
  assert.deepEqual((await api.request('/required', { headers: bearer(sessionToken()) })).body, { userId: 'user_a' });
});

test('protected routes answer 401 without a valid token', async () => {
  const now = Math.floor(Date.now() / 1000);
  const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const cases = {
    'no token': {},
    'garbage token': bearer('not.a.token'),
    'expired token': bearer(sessionToken({ iat: now - 600, nbf: now - 600, exp: now - 120 })),
    'token signed with another key': bearer(sessionToken({}, otherKey))
  };
  for (const [label, headers] of Object.entries(cases)) {
    assert.equal((await api.request('/required', { headers })).status, 401, label);
  }
});

test('users can read their own settings but not anyone else\'s', async () => {
  const own = await api.request('/s/user_a', { headers: bearer(sessionToken()) });
  assert.equal(own.status, 200);
  assert.equal(own.body.settings.temperatureUnit, 'celsius');
  assert.equal((await api.request('/s/user_b', { headers: bearer(sessionToken()) })).status, 403);
  assert.equal((await api.request('/s/user_a')).status, 401);
});

test('users can save their own settings but not anyone else\'s', async () => {
  const body = { settings: { temperatureUnit: 'fahrenheit' } };
  assert.equal((await api.request('/s/user_b', { method: 'POST', headers: bearer(sessionToken()), body })).status, 403);
  assert.equal((await api.request('/s/user_b', { method: 'POST', body })).status, 401);
  assert.equal(settings.find(doc => doc.userId === 'user_b').settings.temperatureUnit, 'fahrenheit');

  const saved = await api.request('/s/user_a', { method: 'POST', headers: bearer(sessionToken()), body });
  assert.equal(saved.status, 200);
  assert.equal(settings.find(doc => doc.userId === 'user_a').settings.temperatureUnit, 'fahrenheit');
});

test('settings values are validated', async () => {
  const body = { settings: { temperatureUnit: 'kelvin' } };
  assert.equal((await api.request('/s/user_a', { method: 'POST', headers: bearer(sessionToken()), body })).status, 400);
});

test('subscription routes need sign-in, except Apple\'s server notifications', async () => {
  const subscriptionApp = express();
  subscriptionApp.use(express.json());
  subscriptionApp.use('/sub', require('../routes/subscriptionRoutes'));
  const sub = await serve(subscriptionApp);
  try {
    for (const [method, path] of [['POST', '/sub/cmcs'], ['POST', '/sub/cacs'], ['GET', '/sub/status'], ['GET', '/sub/success'],
      ['POST', '/sub/cancel'], ['POST', '/sub/reactivate'], ['GET', '/sub/billing-portal'],
      ['GET', '/sub/apple/account-token'], ['POST', '/sub/apple/verify-transaction']]) {
      assert.equal((await sub.request(path, { method })).status, 401, `${method} ${path}`);
    }
    // Apple's notifications are verified by their own signature instead (rejected here as unsigned).
    assert.equal((await sub.request('/sub/apple/notifications', { method: 'POST', body: {} })).status, 400);
  } finally {
    await sub.close();
  }
});
