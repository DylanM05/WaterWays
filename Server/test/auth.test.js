// Sign-in checks and per-user data, using Clerk's real token verification (see clerkTestTokens).
const crypto = require('crypto');
const { bearer, clerkTestTokens, fakeModel, serve } = require('./helpers');

const sessionToken = clerkTestTokens();
// The subscription controller needs a Stripe key to load; these tests never reach Stripe.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_unused';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { getAuth } = require('@clerk/express');
const UserSettings = require('../models/UserSettings');
const { verifyAuth, requireAuth } = require('../middleware/authMiddleware');

let api;
let clerkApi;
let settings;

before(async () => {
  console.error = () => {};
  settings = fakeModel(UserSettings, [
    { userId: 'user_a', settings: { temperatureUnit: 'celsius' } },
    { userId: 'user_b', settings: { temperatureUnit: 'fahrenheit' } }
  ]);

  // Stands in for Clerk's API, which verifies opaque API keys, M2M and OAuth tokens: every one is valid,
  // and the API key and OAuth token belong to user_a. Read when Clerk's client is first used.
  const base = { id: 'tok_1', scopes: [], revoked: false, expired: false, expiration: null, created_at: 0, updated_at: 0 };
  const verified = {
    '/api_keys/verify': { ...base, object: 'api_key', type: 'api_key', subject: 'user_a' },
    '/oauth_applications/access_tokens/verify': { ...base, object: 'clerk_idp_oauth_access_token', type: 'oauth_token', client_id: 'client_1', subject: 'user_a' },
    '/m2m_tokens/verify': { ...base, object: 'machine_to_machine_token', subject: 'mch_1' }
  };
  const clerkApp = express();
  clerkApp.post('*', (req, res) => {
    const match = Object.keys(verified).find(suffix => req.path.endsWith(suffix));
    // Clerk parses the body only for exactly this content type; Express's helpers would add a charset.
    res.statusCode = match ? 200 : 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(match ? verified[match] : { errors: [{ code: 'resource_not_found' }] }));
  });
  clerkApi = await serve(clerkApp);
  process.env.CLERK_API_URL = clerkApi.base;

  const app = express();
  app.use(express.json());
  app.get('/optional', verifyAuth, (req, res) => res.json({ userId: req.userId ?? null }));
  app.get('/required', requireAuth, (req, res) => res.json({ userId: req.userId }));
  // What Clerk made of the token, whatever its type, next to what the app sees.
  app.get('/token-type', verifyAuth, (req, res) => {
    const { tokenType, isAuthenticated } = getAuth(req, { acceptsToken: 'any' });
    res.json({ userId: req.userId ?? null, tokenType, isAuthenticated });
  });
  app.use('/s', require('../routes/settingsRoutes'));
  api = await serve(app);
});

after(() => Promise.all([api.close(), clerkApi.close()]));

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

test('web tokens must come from our own sites; tokens without azp (the iOS app) still work', async () => {
  const userId = async headers => (await api.request('/optional', { headers })).body.userId;
  assert.equal(await userId(bearer(sessionToken())), 'user_a', 'no azp');
  assert.equal(await userId(bearer(sessionToken({ azp: 'https://water-ways.ca' }))), 'user_a');
  assert.equal(await userId(bearer(sessionToken({ azp: 'https://beta.water-ways.ca' }))), 'user_a');
  assert.equal(await userId(bearer(sessionToken({ azp: 'https://evil.example' }))), null);
  assert.equal(await userId(bearer(sessionToken({ azp: 'https://water-ways.ca.evil.example' }))), null);
  assert.equal((await api.request('/required', { headers: bearer(sessionToken({ azp: 'https://evil.example' })) })).status, 401);
});

test('only session tokens sign a user in; other token types are signed out, even when valid', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases = {
    'API key': ['ak_test_123', 'api_key'],
    'M2M token': ['mt_test_123', 'm2m_token'],
    'OAuth token': ['oat_test_123', 'oauth_token'],
    'M2M JWT': [sessionToken({ sub: 'mch_1', jti: 'mt_1' }, undefined, { cat: 'cl_B7d4PD333AAA' }), 'm2m_token'],
    'OAuth JWT': [sessionToken({ client_id: 'client_1', jti: 'oat_1' }, undefined, { typ: 'at+jwt', cat: undefined }), 'oauth_token'],
    // A JWT template, and a JWT with no category (such as an OIDC id_token signed by the same key).
    'JWT template': [sessionToken({}, undefined, { cat: 'cl_B7d4PD222AAA' }), 'session_token'],
    'no category': [sessionToken({ iat: now - 5 }, undefined, { cat: undefined }), 'session_token']
  };
  for (const [label, [token, tokenType]] of Object.entries(cases)) {
    const { body } = await api.request('/token-type', { headers: bearer(token) });
    assert.equal(body.userId, null, label);
    assert.equal(body.tokenType, tokenType, label);
    assert.equal((await api.request('/required', { headers: bearer(token) })).status, 401, label);
  }
  // The machine tokens above were accepted by Clerk; the app still treats them as signed out.
  for (const token of ['ak_test_123', 'mt_test_123', 'oat_test_123']) {
    assert.equal((await api.request('/token-type', { headers: bearer(token) })).body.isAuthenticated, true, token);
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
