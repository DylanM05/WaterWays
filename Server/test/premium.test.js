// Who counts as a premium member: lifetime grants, Apple subscriptions and website (Stripe) subscriptions.
process.env.NODE_ENV = 'test';
delete process.env.APPLE_ALLOW_UNSIGNED_TESTING;

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const LifetimePremium = require('../models/LifetimePremium');
const AppleSubscription = require('../models/AppleSubscription');
const CustomerMap = require('../models/CustomerMap');
const { hasPremiumAccess, requirePremium } = require('../middleware/premiumMiddleware');
const { fakeModel } = require('./helpers');

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + DAY);
const past = () => new Date(Date.now() - DAY);

let lifetime;
let apple;
let stripe;

beforeEach(() => {
  lifetime = fakeModel(LifetimePremium);
  apple = fakeModel(AppleSubscription);
  stripe = fakeModel(CustomerMap);
});

test('a user with nothing is not premium', async () => {
  assert.equal(await hasPremiumAccess('user_a'), false);
});

test('a lifetime grant is premium', async () => {
  lifetime.push({ userId: 'user_a' });
  assert.equal(await hasPremiumAccess('user_a'), true);
  assert.equal(await hasPremiumAccess('user_b'), false);
});

test('an unexpired Apple subscription is premium', async () => {
  apple.push({ userId: 'user_a', expiresAt: future(), revocationDate: null, environment: 'Production' });
  assert.equal(await hasPremiumAccess('user_a'), true);
});

test('expired or refunded Apple subscriptions are not premium', async () => {
  apple.push({ userId: 'user_a', expiresAt: past(), revocationDate: null, environment: 'Production' });
  apple.push({ userId: 'user_b', expiresAt: future(), revocationDate: past(), environment: 'Production' });
  assert.equal(await hasPremiumAccess('user_a'), false);
  assert.equal(await hasPremiumAccess('user_b'), false);
});

test('Xcode test purchases are not premium unless unsigned testing is on', async () => {
  apple.push({ userId: 'user_a', expiresAt: future(), revocationDate: null, environment: 'Xcode' });
  assert.equal(await hasPremiumAccess('user_a'), false);
  process.env.APPLE_ALLOW_UNSIGNED_TESTING = 'true';
  try {
    assert.equal(await hasPremiumAccess('user_a'), true);
  } finally {
    delete process.env.APPLE_ALLOW_UNSIGNED_TESTING;
  }
});

test('an active website subscription is premium until its period ends', async () => {
  stripe.push({ userId: 'user_a', subscriptionStatus: 'active', currentPeriodEnd: future() });
  stripe.push({ userId: 'user_b', subscriptionStatus: 'active', currentPeriodEnd: past() });
  assert.equal(await hasPremiumAccess('user_a'), true);
  assert.equal(await hasPremiumAccess('user_b'), false);
});

test('cancelled or unpaid website subscriptions are not premium', async () => {
  stripe.push({ userId: 'user_a', subscriptionStatus: 'canceled', currentPeriodEnd: future() });
  stripe.push({ userId: 'user_b', subscriptionStatus: 'past_due', currentPeriodEnd: future() });
  assert.equal(await hasPremiumAccess('user_a'), false);
  assert.equal(await hasPremiumAccess('user_b'), false);
});

function runRequirePremium(userId) {
  return new Promise(resolve => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, nextCalled: false }); }
    };
    requirePremium({ userId }, res, () => resolve({ status: 200, nextCalled: true }));
  });
}

test('requirePremium lets members through and answers 403 for everyone else', async () => {
  lifetime.push({ userId: 'user_a' });
  assert.deepEqual(await runRequirePremium('user_a'), { status: 200, nextCalled: true });
  const denied = await runRequirePremium('user_b');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'premium_required');
});
