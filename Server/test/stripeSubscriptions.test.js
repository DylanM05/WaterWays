// Website (Stripe) memberships: syncing from Stripe, /sub/status, and webhook events.
// Stripe is replaced before the controller loads, so nothing leaves the machine.
let stripeSubscriptions = [];
let stripeDown = false;
let createdCustomers = [];
let checkoutSessions = [];
let stripeCustomers = {};
let charges = {};
let updates = [];
let cancelled = [];
let stripeConfig = null;
let stripePrices = {};
const fakeStripe = {
  prices: {
    retrieve: async (id) => {
      if (stripeDown) throw new Error('Stripe is unavailable');
      if (!stripePrices[id]) throw new Error(`No such price: ${id}`);
      return stripePrices[id];
    }
  },
  subscriptions: {
    list: async ({ customer }) => {
      if (stripeDown) throw new Error('Stripe is unavailable');
      return { data: stripeSubscriptions.filter(subscription => subscription.customer === customer) };
    },
    update: async (id, params) => {
      updates.push({ id, ...params });
      return { id, ...params };
    },
    cancel: async (id) => {
      cancelled.push(id);
      const found = stripeSubscriptions.find(subscription => subscription.id === id);
      found.status = 'canceled';
      return found;
    }
  },
  charges: {
    retrieve: async (id) => charges[id]
  },
  customers: {
    create: async (params) => {
      createdCustomers.push(params);
      return { id: `cus_created_${createdCustomers.length}` };
    },
    retrieve: async (id) => stripeCustomers[id] || { id, deleted: true }
  },
  checkout: {
    sessions: {
      create: async (params) => {
        checkoutSessions.push(params);
        return { url: 'https://checkout.stripe.test/session' };
      }
    }
  }
};
const stripePath = require.resolve('stripe');
require.cache[stripePath] = {
  id: stripePath,
  filename: stripePath,
  loaded: true,
  // A constructor, like the real package (`new Stripe(key, config)`).
  exports: function FakeStripe(key, config) {
    stripeConfig = config;
    return fakeStripe;
  }
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
// The shape API version 2025-04-30.basil returns: the billing period is on the item, not the subscription.
const subscription = (fields) => ({
  id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'active', cancel_at_period_end: false,
  items: { object: 'list', data: [{
    id: 'si_1', object: 'subscription_item', current_period_start: inDays(-10), current_period_end: inDays(20),
    price: { id: 'price_1', nickname: 'monthly' }
  }] },
  ...fields
});

let customers;
beforeEach(() => {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  stripeDown = false;
  stripeSubscriptions = [];
  createdCustomers = [];
  checkoutSessions = [];
  stripeCustomers = {};
  charges = {};
  updates = [];
  cancelled = [];
  stripePrices = {
    price_monthly: { id: 'price_monthly', product: 'prod_premium' },
    price_annual: { id: 'price_annual', product: 'prod_premium' }
  };
  delete process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_ANUAL_PRICE_ID;
  clerkClient.users.getUser = async (userId) => ({ primaryEmailAddress: { emailAddress: `${userId}@example.com` } });
  fakeModel(LifetimePremium);
  fakeModel(AppleSubscription);
  customers = fakeModel(CustomerMap, [{
    userId: 'user_a', stripeCustomerId: 'cus_1', subscriptionId: 'sub_1', subscriptionStatus: 'active',
    plan: 'monthly', currentPeriodEnd: new Date(Date.now() + 20 * DAY * 1000), cancelAtPeriodEnd: false
  }]);
});

const call = (handler, userId, body) => new Promise(resolve => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
  handler({ userId, body }, res);
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
  stripeCustomers.cus_new = { id: 'cus_new', metadata: { userId: 'user_new' } };
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

test('a checkout naming someone else\'s user id cannot take over their mapping', async () => {
  // A Payment Link lets the buyer set client_reference_id; their customer carries their own user id.
  stripeCustomers.cus_evil = { id: 'cus_evil', metadata: { userId: 'user_evil' } };
  stripeSubscriptions = [subscription({ customer: 'cus_evil', id: 'sub_evil' })];
  const handled = await controller.processWebhookEvent({
    id: 'evt_evil', type: 'checkout.session.completed',
    data: { object: { id: 'cs_evil', customer: 'cus_evil', client_reference_id: 'user_a' } }
  });
  assert.equal(handled, true, 'acknowledged, not retried');
  assert.equal(customers.find(customer => customer.userId === 'user_a').stripeCustomerId, 'cus_1');
  assert.equal(customers.some(customer => customer.stripeCustomerId === 'cus_evil'), false);
});

test('a checkout for the customer already stored for the user is accepted', async () => {
  stripeSubscriptions = [subscription()];
  // cus_1 has no metadata in Stripe (an older customer), but the stored mapping already points at it.
  const handled = await controller.processWebhookEvent({
    type: 'checkout.session.completed', data: { object: { customer: 'cus_1', client_reference_id: 'user_a' } }
  });
  assert.equal(handled, true);
  assert.equal(customers[0].stripeCustomerId, 'cus_1');
  assert.equal(customers[0].subscriptionStatus, 'active');
});

test('only the configured Premium prices grant premium', async () => {
  process.env.STRIPE_PRICE_ID = 'price_monthly';
  process.env.STRIPE_ANUAL_PRICE_ID = 'price_annual';
  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: inDays(20), price: { id: 'price_other' } }] } })];
  assert.equal((await status('user_a')).body.subscribed, false);
  assert.equal(await hasPremiumAccess('user_a'), false);

  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: inDays(300), price: { id: 'price_annual', nickname: 'annual' } }] } })];
  const { body } = await status('user_a');
  assert.equal(body.subscribed, true);
  assert.equal(body.plan, 'annual');
});

test('a replaced price of the Premium product still grants premium', async () => {
  process.env.STRIPE_PRICE_ID = 'price_monthly';
  process.env.STRIPE_ANUAL_PRICE_ID = 'price_annual';
  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: inDays(20), price: { id: 'price_2024', product: 'prod_premium' } }] } })];
  assert.equal((await status('user_a')).body.subscribed, true);

  // Expanded products are objects; another product still doesn't count.
  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: inDays(20), price: { id: 'price_x', product: { id: 'prod_other' } } }] } })];
  assert.equal((await status('user_a')).body.subscribed, false);
});

test('a subscriber on an older Premium price can\'t check out a second time', async () => {
  process.env.STRIPE_PRICE_ID = 'price_monthly';
  process.env.STRIPE_ANUAL_PRICE_ID = 'price_annual';
  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: inDays(20), price: { id: 'price_2024', product: 'prod_premium' } }] } })];
  const { status: code, body } = await call(controller.createMonthlyCheckoutSession, 'user_a');
  assert.equal(code, 409);
  assert.equal(body.code, 'already_subscribed');
  assert.equal(checkoutSessions.length, 0);
});

test('if the Premium products can\'t be looked up, every subscription counts until they can', async () => {
  process.env.STRIPE_PRICE_ID = 'price_new_monthly';
  process.env.STRIPE_ANUAL_PRICE_ID = 'price_new_annual';
  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: inDays(20), price: { id: 'price_other', product: 'prod_other' } }] } })];
  assert.equal((await status('user_a')).body.subscribed, true, 'unknown prices: not locked out');

  stripePrices.price_new_monthly = { id: 'price_new_monthly', product: 'prod_premium' };
  stripePrices.price_new_annual = { id: 'price_new_annual', product: 'prod_premium' };
  assert.equal((await status('user_a')).body.subscribed, false, 'asked again, and now the rule applies');
});

test('a webhook event without a customer is acknowledged, not retried', async () => {
  const handled = await controller.processWebhookEvent({
    id: 'evt_guest', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', customer: null } }
  });
  assert.equal(handled, true);
});

test('without the price settings, any active subscription still counts', async () => {
  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: inDays(20), price: { id: 'price_other' } }] } })];
  assert.equal((await status('user_a')).body.subscribed, true);
});

test('a newer abandoned checkout does not hide an older active subscription', async () => {
  stripeSubscriptions = [
    subscription({ id: 'sub_new', status: 'incomplete', created: inDays(0) }),
    subscription({ id: 'sub_old', status: 'active', created: inDays(-40) })
  ];
  assert.equal((await status('user_a')).body.subscribed, true);
  assert.equal(customers[0].subscriptionId, 'sub_old');

  await call(controller.cancelSubscription, 'user_a', {});
  assert.equal(updates[0].id, 'sub_old', 'cancel acts on the subscription that grants premium');
  await call(controller.reactivateSubscription, 'user_a');
  assert.equal(updates[1].id, 'sub_old', 'so does reactivate');
});

test('past_due is preferred over a newer cancelled subscription, and the newest wins a tie', async () => {
  stripeSubscriptions = [
    subscription({ id: 'sub_cancelled', status: 'canceled', created: inDays(0) }),
    subscription({ id: 'sub_due', status: 'past_due', created: inDays(-40) })
  ];
  await controller.syncStripeDataToDB('cus_1');
  assert.equal(customers[0].subscriptionId, 'sub_due');

  stripeSubscriptions = [
    subscription({ id: 'sub_a', status: 'canceled', created: inDays(-40) }),
    subscription({ id: 'sub_b', status: 'canceled', created: inDays(-1) })
  ];
  await controller.syncStripeDataToDB('cus_1');
  assert.equal(customers[0].subscriptionId, 'sub_b');
});

test('a second checkout is refused while a subscription is active', async () => {
  stripeSubscriptions = [subscription({ cancel_at_period_end: true })];
  const { status: code, body } = await call(controller.createMonthlyCheckoutSession, 'user_a');
  assert.equal(code, 409);
  assert.equal(body.code, 'already_subscribed');
  assert.equal(checkoutSessions.length, 0);

  stripeSubscriptions = [subscription({ status: 'canceled' })];
  assert.equal((await call(controller.createAnnualCheckoutSession, 'user_a')).status, 200, 'a lapsed member can subscribe again');
});

test('a chargeback cancels the subscription straight away', async () => {
  stripeSubscriptions = [subscription()];
  charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };
  const handled = await controller.processWebhookEvent({
    id: 'evt_dispute', type: 'charge.dispute.created',
    data: { object: { id: 'dp_1', charge: 'ch_1', status: 'needs_response' } }
  });
  assert.equal(handled, true);
  assert.deepEqual(cancelled, ['sub_1']);
  assert.equal(customers[0].subscriptionStatus, 'canceled');
  assert.equal(await hasPremiumAccess('user_a'), false);
});

test('a dispute inquiry and a refund leave the subscription running', async () => {
  stripeSubscriptions = [subscription()];
  charges.ch_1 = { id: 'ch_1', customer: 'cus_1' };
  assert.equal(await controller.processWebhookEvent({
    type: 'charge.dispute.created', data: { object: { id: 'dp_1', charge: 'ch_1', status: 'warning_needs_response' } }
  }), true);
  assert.equal(await controller.processWebhookEvent({
    type: 'charge.refunded', data: { object: { id: 'ch_1', customer: 'cus_1' } }
  }), true);
  assert.deepEqual(cancelled, []);
  assert.equal(customers[0].subscriptionStatus, 'active');
});

test('a long or non-text cancellation reason still cancels', async () => {
  stripeSubscriptions = [subscription()];
  assert.equal((await call(controller.cancelSubscription, 'user_a', { reason: 'x'.repeat(600) })).status, 200);
  assert.equal(updates[0].metadata.cancellation_reason.length, 500);
  assert.equal((await call(controller.cancelSubscription, 'user_a', { reason: 42 })).status, 200);
  assert.equal(updates[1].metadata.cancellation_reason, '42');
  assert.equal((await call(controller.cancelSubscription, 'user_a', undefined)).status, 200);
  assert.equal(updates[2].metadata.cancellation_reason, 'Not provided');
});

test('the Stripe client is pinned to the API version the code reads', () => {
  assert.equal(stripeConfig.apiVersion, '2025-04-30.basil');
});

test('cancelling reports the period end from the subscription item', async () => {
  const end = inDays(12);
  stripeSubscriptions = [subscription({ items: { data: [{ current_period_end: end, price: { id: 'price_1' } }] } })];
  const { status: code, body } = await call(controller.cancelSubscription, 'user_a', {});
  assert.equal(code, 200);
  assert.equal(body.currentPeriodEnd, new Date(end * 1000).toISOString());
  assert.equal(customers[0].currentPeriodEnd.getTime(), end * 1000);
});

test('a period end on the subscription itself (API versions before basil) is still read', async () => {
  const end = inDays(15);
  stripeSubscriptions = [subscription({ current_period_end: end, items: { data: [{ price: { id: 'price_1' } }] } })];
  await controller.syncStripeDataToDB('cus_1');
  assert.equal(customers[0].currentPeriodEnd.getTime(), end * 1000);
  assert.equal((await status('user_a')).body.subscribed, true);

  // When both are present, the item's wins.
  stripeSubscriptions = [subscription({ current_period_end: inDays(-5) })];
  await controller.syncStripeDataToDB('cus_1');
  assert.ok(customers[0].currentPeriodEnd.getTime() > Date.now());
});

test('a Stripe error during cancellation is logged, not sent to the client', async () => {
  stripeDown = true;
  const { status: code, body } = await call(controller.cancelSubscription, 'user_a', {});
  assert.equal(code, 500);
  assert.equal('details' in body, false);
  assert.equal(JSON.stringify(body).includes('unavailable'), false);
});
