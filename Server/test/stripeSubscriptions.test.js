// Website (Stripe) memberships: syncing from Stripe, /sub/status, and webhook events.
// Stripe is replaced before the controller loads, so nothing leaves the machine.
let stripeSubscriptions = [];
let stripeDown = false;
let createdCustomers = [];
let checkoutSessions = [];
const stripePath = require.resolve('stripe');
require.cache[stripePath] = {
  id: stripePath,
  filename: stripePath,
  loaded: true,
  exports: () => ({
    subscriptions: {
      list: async ({ customer }) => {
        if (stripeDown) throw new Error('Stripe is unavailable');
        return { data: stripeSubscriptions.filter(subscription => subscription.customer === customer) };
      }
    },
    customers: {
      create: async (params) => {
        createdCustomers.push(params);
        return { id: `cus_created_${createdCustomers.length}` };
      }
    },
    checkout: {
      sessions: {
        create: async (params) => {
          checkoutSessions.push(params);
          return { url: 'https://checkout.stripe.test/session' };
        }
      }
    }
  })
};
// Clerk's client keeps a stubbed method only once it has a key.
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_unused';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const CustomerMap = require('../models/CustomerMap');
const LifetimePremium = require('../models/LifetimePremium');
const AppleSubscription = require('../models/AppleSubscription');
const { hasPremiumAccess } = require('../middleware/premiumMiddleware');
const controller = require('../controllers/subscriptionController');
const { fakeModel } = require('./helpers');
const { clerkClient } = require('@clerk/express');

const DAY = 24 * 60 * 60;
const inDays = days => Math.floor(Date.now() / 1000) + days * DAY;
const subscription = (fields) => ({
  id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false,
  items: { data: [{ current_period_end: inDays(20), price: { id: 'price_1', nickname: 'monthly' } }] },
  ...fields
});

let customers;
beforeEach(() => {
  console.log = () => {};
  console.error = () => {};
  stripeDown = false;
  stripeSubscriptions = [];
  createdCustomers = [];
  checkoutSessions = [];
  clerkClient.users.getUser = async (userId) => ({ primaryEmailAddress: { emailAddress: `${userId}@example.com` } });
  fakeModel(LifetimePremium);
  fakeModel(AppleSubscription);
  customers = fakeModel(CustomerMap, [{
    userId: 'user_a', stripeCustomerId: 'cus_1', subscriptionId: 'sub_1', subscriptionStatus: 'active',
    plan: 'monthly', currentPeriodEnd: new Date(Date.now() + 20 * DAY * 1000), cancelAtPeriodEnd: false
  }]);
});

const call = (handler, userId) => new Promise(resolve => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
  handler({ userId }, res);
});
const status = (userId) => call(controller.checkSubscriptionStatus, userId);

test('an active website subscription is reported with its renewal date', async () => {
  stripeSubscriptions = [subscription({ cancel_at_period_end: true })];
  const { body } = await status('user_a');
  assert.equal(body.subscribed, true);
  assert.equal(body.source, 'stripe');
  assert.equal(body.plan, 'monthly');
  assert.equal(body.cancelAtPeriodEnd, true);
  assert.ok(Date.parse(body.expiresAt) > Date.now());
});

test('a Stripe outage does not downgrade a paying member', async () => {
  stripeDown = true;
  const { status: code, body } = await status('user_a');
  assert.equal(code, 200);
  assert.equal(body.subscribed, true, 'answered from the stored membership');
  assert.equal(customers[0].subscriptionStatus, 'active', 'the stored membership is untouched');
  assert.equal(customers[0].plan, 'monthly');
  assert.equal(await hasPremiumAccess('user_a'), true);
});

test('a cancelled subscription ends premium once Stripe says so', async () => {
  stripeSubscriptions = [subscription({ status: 'canceled' })];
  const { body } = await status('user_a');
  assert.equal(body.subscribed, false);
  assert.equal(customers[0].subscriptionStatus, 'canceled');
  assert.equal(await hasPremiumAccess('user_a'), false);
});

test('status and server-side premium agree when a stored period has ended', async () => {
  stripeDown = true;
  customers[0].currentPeriodEnd = new Date(Date.now() - DAY * 1000);
  const { body } = await status('user_a');
  assert.equal(body.subscribed, false);
  assert.equal(await hasPremiumAccess('user_a'), false);
});

test('users without a Stripe customer are on the free plan', async () => {
  assert.deepEqual((await status('user_b')).body, { subscribed: false, plan: 'free', source: 'none' });
});

test('a customer with no subscriptions at all is set to free', async () => {
  const updated = await controller.syncStripeDataToDB('cus_1');
  assert.equal(updated.subscriptionStatus, 'none');
  assert.equal(updated.plan, 'free');
});

test('a subscription-deleted webhook updates the membership straight away', async () => {
  stripeSubscriptions = [subscription({ status: 'canceled' })];
  const handled = await controller.processWebhookEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } });
  assert.equal(handled, true);
  assert.equal(customers[0].subscriptionStatus, 'canceled');
});

test('a completed checkout links the Stripe customer to the user', async () => {
  stripeSubscriptions = [subscription({ customer: 'cus_new', id: 'sub_new' })];
  const handled = await controller.processWebhookEvent({
    type: 'checkout.session.completed',
    data: { object: { customer: 'cus_new', client_reference_id: 'user_new' } }
  });
  assert.equal(handled, true);
  const linked = customers.find(customer => customer.userId === 'user_new');
  assert.equal(linked.stripeCustomerId, 'cus_new');
  assert.equal(linked.subscriptionStatus, 'active');
  assert.equal(await hasPremiumAccess('user_new'), true);
});

test('untracked webhook events are acknowledged without changes', async () => {
  const before = JSON.stringify(customers);
  assert.equal(await controller.processWebhookEvent({ type: 'customer.created', data: { object: { customer: 'cus_1' } } }), true);
  assert.equal(JSON.stringify(customers), before);
});

test('a lifetime grant or an Apple subscription is reported before Stripe is asked', async () => {
  stripeDown = true;
  fakeModel(AppleSubscription, [{
    userId: 'user_a', productId: 'waterways.premium.annual', environment: 'Production',
    expiresAt: new Date(Date.now() + 300 * DAY * 1000), revocationDate: null, autoRenewEnabled: true
  }]);
  const apple = (await status('user_a')).body;
  assert.equal(apple.source, 'apple');
  assert.equal(apple.plan, 'apple-annual');

  fakeModel(LifetimePremium, [{ userId: 'user_a' }]);
  assert.equal((await status('user_a')).body.source, 'lifetime');
});

test('checkout creates the Stripe customer with the user\'s own email, for either plan', async () => {
  process.env.STRIPE_PRICE_ID = 'price_monthly';
  process.env.STRIPE_ANUAL_PRICE_ID = 'price_annual';
  const monthly = await call(controller.createMonthlyCheckoutSession, 'user_m');
  const annual = await call(controller.createAnnualCheckoutSession, 'user_y');
  assert.equal(monthly.body.url, 'https://checkout.stripe.test/session');
  assert.equal(annual.status, 200);
  assert.deepEqual(createdCustomers.map(customer => customer.email), ['user_m@example.com', 'user_y@example.com']);
  assert.deepEqual(checkoutSessions.map(session => session.line_items[0].price), ['price_monthly', 'price_annual']);
  assert.deepEqual(checkoutSessions.map(session => session.client_reference_id), ['user_m', 'user_y']);
  assert.equal(customers.find(customer => customer.userId === 'user_y').stripeCustomerId, 'cus_created_2');
});

test('checkout still works when Clerk can\'t be reached; Stripe asks for the email', async () => {
  clerkClient.users.getUser = async () => { throw new Error('Clerk is unavailable'); };
  const { status: code } = await call(controller.createAnnualCheckoutSession, 'user_y');
  assert.equal(code, 200);
  assert.equal('email' in createdCustomers[0], false);
});

test('checkout reuses an existing Stripe customer', async () => {
  await call(controller.createMonthlyCheckoutSession, 'user_a');
  assert.equal(createdCustomers.length, 0);
  assert.equal(checkoutSessions[0].customer, 'cus_1');
});
