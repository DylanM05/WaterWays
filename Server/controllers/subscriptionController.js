const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const CustomerMap = require('../models/CustomerMap');
const LifetimePremium = require('../models/LifetimePremium');
const AppleSubscription = require('../models/AppleSubscription');
const { hasActiveStripeMembership } = require('../middleware/premiumMiddleware');
const cron = require('node-cron');
const { clerkClient } = require('@clerk/express');


// The signed-in user's primary email from Clerk, so Stripe sends receipts to them. Clerk's session token
// doesn't carry the email; if the lookup fails, Stripe Checkout asks the customer for it instead.
async function primaryEmail(userId) {
  try {
    const user = await clerkClient.users.getUser(userId);
    return user.primaryEmailAddress?.emailAddress || null;
  } catch (error) {
    console.error('Could not look up the user\'s email in Clerk:', error.message);
    return null;
  }
}

// Subscriptions that can still be charged or cancelled, best first: active/trialing, then past_due.
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];
const statusRank = status => (['active', 'trialing'].includes(status) ? 0 : status === 'past_due' ? 1 : 2);

// Only the two Premium prices grant premium. If either price setting is missing, every subscription
// counts, as before, rather than locking out subscribers on a misconfigured server.
function isPremiumSubscription(subscription) {
  const prices = [process.env.STRIPE_PRICE_ID, process.env.STRIPE_ANUAL_PRICE_ID];
  if (!prices.every(Boolean)) return true;
  return (subscription.items?.data || []).some(item => prices.includes(item.price?.id));
}

// The customer's Premium subscription that decides membership, or null. A newer incomplete subscription
// (an abandoned second checkout) must not hide an older active one, so all of them are ranked.
async function bestSubscription(customerId) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 100,
    status: 'all',
    expand: ['data.default_payment_method'],
  });
  const premium = (subscriptions?.data || []).filter(subscription => {
    if (isPremiumSubscription(subscription)) return true;
    console.warn(`Ignoring subscription ${subscription.id} (${subscription.status}): not a Premium price`);
    return false;
  });
  premium.sort((a, b) => statusRank(a.status) - statusRank(b.status) || (b.created || 0) - (a.created || 0));
  return premium[0] || null;
}

// Stripe rejects metadata values over 500 characters, which would make cancelling fail.
const cancellationReason = reason => (reason == null ? '' : String(reason)).slice(0, 500);

// One handler per plan; priceSetting names the env variable holding the Stripe price ID.
const checkoutSession = (priceSetting) => async (req, res) => {
  try {
    const userId = req.userId;

    // Find or create a Stripe customer for this user
    let customerMap = await CustomerMap.findOne({ userId });
    let stripeCustomerId;

    if (!customerMap || !customerMap.stripeCustomerId) {
      const email = await primaryEmail(userId);
      const customer = await stripe.customers.create({
        ...(email && { email }),
        metadata: {
          userId: userId,
        },
      });

      stripeCustomerId = customer.id;

      // Save customer mapping
      if (customerMap) {
        customerMap.stripeCustomerId = stripeCustomerId;
        await customerMap.save();
      } else {
        customerMap = new CustomerMap({
          userId,
          stripeCustomerId,
        });
        await customerMap.save();
      }
    } else {
      stripeCustomerId = customerMap.stripeCustomerId;

      // A second checkout would bill the user twice.
      const current = await bestSubscription(stripeCustomerId);
      if (current && ['active', 'trialing'].includes(current.status)) {
        return res.status(409).json({
          error: 'You already have Premium. Manage it from Settings.',
          code: 'already_subscribed'
        });
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId, // Use the customer ID explicitly
      line_items: [{ price: process.env[priceSetting], quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${process.env.FRONTEND_URL}/settings?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      client_reference_id: userId,
      metadata: {
        userId: userId
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

exports.createMonthlyCheckoutSession = checkoutSession('STRIPE_PRICE_ID');
exports.createAnnualCheckoutSession = checkoutSession('STRIPE_ANUAL_PRICE_ID');

exports.checkSubscriptionStatus = async (req, res) => {
  try {
    const { userId } = req;
    
    // Check for lifetime premium access first
    const lifetimePremium = await LifetimePremium.findOne({ userId });
    
    if (lifetimePremium) {
      return res.json({
        subscribed: true,
        plan: 'lifetime',
        source: 'lifetime',
      });
    }

    const appleSubscription = await AppleSubscription.findOne(AppleSubscription.activeFilter(userId))
      .sort({ expiresAt: -1 });

    if (appleSubscription) {
      const productId = appleSubscription.productId.toLowerCase();
      const plan = productId.includes('annual') || productId.includes('year') ? 'apple-annual' : 'apple-monthly';
      return res.json({
        subscribed: true,
        plan,
        source: 'apple',
        expiresAt: appleSubscription.expiresAt.toISOString(),
        cancelAtPeriodEnd: appleSubscription.autoRenewEnabled === false
      });
    }
    
    // Find customer mapping
    const customerMap = await CustomerMap.findOne({ userId });
    
    // If no customer mapping exists or there's no Stripe customer ID, return free plan immediately
    if (!customerMap || !customerMap.stripeCustomerId) {
      return res.json({
        subscribed: false,
        plan: 'free',
        source: 'none'
      });
    }
    
    // Refresh from Stripe, but answer from the stored membership with the same rule premium checks use,
    // so the app agrees with what the server grants. If Stripe is unreachable, the stored state stands.
    let membership = customerMap;
    try {
      membership = (await exports.syncStripeDataToDB(customerMap.stripeCustomerId)) || customerMap;
    } catch (stripeError) {
      console.error('Stripe sync failed; answering from the stored membership:', stripeError.message);
    }

    if (hasActiveStripeMembership(membership)) {
      return res.json({
        subscribed: true,
        plan: membership.plan || 'paid',
        source: 'stripe',
        expiresAt: membership.currentPeriodEnd ? new Date(membership.currentPeriodEnd).toISOString() : null,
        cancelAtPeriodEnd: Boolean(membership.cancelAtPeriodEnd)
      });
    }

    return res.json({
      subscribed: false,
      plan: 'free',
      source: 'none'
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
};

// A chargeback: Stripe keeps the subscription running, so cancel it now and sync. An inquiry
// (status warning_*) isn't a chargeback yet and may be resolved, so it is only logged.
async function handleDispute(dispute) {
  if (String(dispute.status || '').startsWith('warning_')) {
    console.log(`Dispute ${dispute.id} is an inquiry (${dispute.status}); subscription left as it is`);
    return true;
  }
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
  if (!chargeId) {
    console.error(`❌ Dispute ${dispute.id} has no charge`);
    return true;
  }
  const charge = await stripe.charges.retrieve(chargeId);
  const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
  if (!customerId) {
    console.log(`Dispute ${dispute.id}: charge ${chargeId} has no customer; nothing to cancel`);
    return true;
  }

  const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  for (const subscription of subscriptions.data.filter(candidate => LIVE_STATUSES.includes(candidate.status))) {
    await stripe.subscriptions.cancel(subscription.id);
    console.log(`Cancelled subscription ${subscription.id} after dispute ${dispute.id}`);
  }
  await exports.syncStripeDataToDB(customerId);
  return true;
}

// A checkout may only bind a Stripe customer to the user it was created for: the customer this server
// created for them (metadata.userId), or the one already stored for them. Payment Links and pricing
// tables let the buyer choose client_reference_id, so that alone proves nothing.
async function customerBelongsToUser(customerId, userId) {
  const existing = await CustomerMap.findOne({ userId });
  if (existing && existing.stripeCustomerId === customerId) return true;
  const customer = await stripe.customers.retrieve(customerId);
  return Boolean(customer && !customer.deleted && customer.metadata?.userId === userId);
}

exports.processWebhookEvent = async (event) => {
  const allowedEvents = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
    'customer.subscription.pending_update_applied',
    'customer.subscription.trial_will_end',
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.payment_action_required',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.dispute.created',
  ];

  console.log(`📝 Processing webhook event: ${event.type}`);

  // Skip processing if the event isn't one we're tracking
  if (!allowedEvents.includes(event.type)) {
    console.log(`⏭️ Skipping event type: ${event.type} (not in allowed list)`);
    return true;
  }

  try {
    // A dispute names the charge, not the customer.
    if (event.type === 'charge.dispute.created') {
      return await handleDispute(event.data.object);
    }

    // Get customer ID from the event
    const { customer: customerId } = event.data.object;

    if (!customerId || typeof customerId !== 'string') {
      // Only the event's id and type: the object can hold emails and billing details.
      console.error(`❌ Missing or invalid customer ID in webhook event ${event.id} (${event.type})`);
      return false;
    }

    // For checkout.session.completed events, create customer mapping if it doesn't exist
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;

      if (userId && !(await customerBelongsToUser(customerId, userId))) {
        // Not retried; the sync below only touches whoever already owns this customer.
        console.error(`❌ Checkout ${session.id}: customer ${customerId} doesn't belong to user ${userId}; mapping left as it is`);
      } else if (userId) {
        console.log(`Creating or updating customer mapping for userId: ${userId}, stripeCustomerId: ${customerId}`);

        // Try to find existing mapping
        let customerMap = await CustomerMap.findOne({ userId });

        if (customerMap) {
          // Update existing mapping
          customerMap.stripeCustomerId = customerId;
          await customerMap.save();
          console.log(`Updated existing customer mapping for user: ${userId}`);
        } else {
          // Create new mapping
          customerMap = new CustomerMap({
            userId,
            stripeCustomerId: customerId
          });
          await customerMap.save();
          console.log(`Created new customer mapping for user: ${userId}`);
        }
      }
    }

    console.log(`🔄 Syncing data for customer: ${customerId}`);

    // Use our centralized sync function
    await exports.syncStripeDataToDB(customerId);

    console.log(`✅ Successfully processed webhook event: ${event.type} for customer: ${customerId}`);
    return true;
  } catch (err) {
    console.error(`❌ Error processing webhook ${event.type}:`, err.stack);
    return false;
  }
};

exports.syncStripeDataToDB = async (customerId) => {
  try {
    console.log(`Syncing data for Stripe customer: ${customerId}`);
    
    // Find the customer mapping first
    const customerMap = await CustomerMap.findOne({ stripeCustomerId: customerId });
    
    if (!customerMap) {
      console.error(`No customer mapping found for Stripe customer ID: ${customerId}`);
      return null;
    }

    // Fetch latest subscription data from Stripe with error handling
    let subscription;
    try {
      subscription = await bestSubscription(customerId);
    } catch (stripeError) {
      // Leave the stored membership as it is: a Stripe outage must not downgrade paying members.
      console.error('Error fetching subscriptions from Stripe:', stripeError);
      throw stripeError;
    }

    if (!subscription) {
      // No Premium subscription found
      console.log(`No subscriptions found for customer: ${customerId}`);
      customerMap.subscriptionStatus = "none";
      customerMap.subscriptionId = null;
      customerMap.currentPeriodEnd = null;
      customerMap.plan = "free";
      await customerMap.save();
      return customerMap;
    }

    console.log(`Found subscription: ${subscription.id}, status: ${subscription.status}`);
    
    // Update customer mapping with latest data - with safe property access
    try {
      customerMap.subscriptionId = subscription.id;
      customerMap.subscriptionStatus = subscription.status;
      
      // First check for the correct location of current_period_end
      let periodEnd;
      
      // Check in subscription.items.data[0].current_period_end (where it actually is)
      if (subscription.items?.data?.[0]?.current_period_end && 
          typeof subscription.items.data[0].current_period_end === 'number') {
        periodEnd = subscription.items.data[0].current_period_end;
      } 
      // Also check in subscription.current_period_end as fallback
      else if (subscription.current_period_end && 
               typeof subscription.current_period_end === 'number') {
        periodEnd = subscription.current_period_end;
      }
      
      // If we found a period end time, convert it to a Date object
      if (periodEnd) {
        customerMap.currentPeriodEnd = new Date(periodEnd * 1000);
        console.log(`Setting current period end: ${customerMap.currentPeriodEnd}`);
      } else {
        console.log('No valid current_period_end found in subscription data');
        customerMap.currentPeriodEnd = null;
      }
      
      // Track cancellation status
      customerMap.cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
      
      // Safely get plan name
      const priceId = subscription.items?.data[0]?.price?.id;
      const priceName = subscription.items?.data[0]?.price?.nickname;
      customerMap.plan = priceName || 'standard';
      
      await customerMap.save();
      console.log(`Successfully updated customer mapping for ${customerId}`);
      return customerMap;
    } catch (saveError) {
      console.error('Error saving customer mapping:', saveError);
      throw saveError;
    }
  } catch (error) {
    console.error('Error in syncStripeDataToDB:', error);
    throw error;
  }
};

exports.handleSubscriptionSuccess = async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`Processing subscription success for user: ${userId}`);
    
    // Find customer mapping to get Stripe customer ID
    const customerMap = await CustomerMap.findOne({ userId });
    
    if (!customerMap || !customerMap.stripeCustomerId) {
      console.log(`No customer mapping found for user: ${userId}`);
      return res.status(404).json({ 
        error: 'Customer mapping not found',
        details: 'Could not find a Stripe customer record for this user'
      });
    }
    
    console.log(`Found customer mapping, syncing data for Stripe ID: ${customerMap.stripeCustomerId}`);
    
    // Sync latest subscription data from Stripe
    try {
      const updatedCustomer = await exports.syncStripeDataToDB(customerMap.stripeCustomerId);

      // The period end of the subscription the sync picked
      const periodEndDate = updatedCustomer?.currentPeriodEnd ? new Date(updatedCustomer.currentPeriodEnd).toISOString() : null;

      // Return information about the subscription status
      return res.json({ 
        success: true,
        subscription: {
          status: updatedCustomer?.subscriptionStatus || 'unknown',
          plan: updatedCustomer?.plan || 'free',
          currentPeriodEnd: periodEndDate,
          cancelAtPeriodEnd: updatedCustomer?.cancelAtPeriodEnd || false
        }
      });
    } catch (syncError) {
      console.error('Error syncing subscription data:', syncError);
      return res.status(500).json({ 
        error: 'Failed to sync subscription data',
        details: 'Please check server logs for more information'
      });
    }
  } catch (error) {
    console.error('Error handling subscription success:', error);
    res.status(500).json({
      error: 'Failed to process subscription success'
    });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`Attempting to cancel subscription for user: ${userId}`);
    
    if (!userId) {
      console.error('Missing userId in cancel request');
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required'
      });
    }
    
    const reason = cancellationReason(req.body?.reason);
    console.log(`Cancellation reason: ${reason}`);
    
    // Find customer mapping to get Stripe customer ID
    const customerMap = await CustomerMap.findOne({ userId });
    console.log(`Found customer mapping:`, customerMap ? 'yes' : 'no');
    
    if (!customerMap || !customerMap.stripeCustomerId) {
      console.log(`No customer mapping or Stripe ID found for user: ${userId}`);
      return res.status(404).json({ 
        success: false,
        error: 'No active subscription found'
      });
    }
    
    console.log(`Fetching subscriptions for Stripe customer ID: ${customerMap.stripeCustomerId}`);
    
    // The same subscription the sync uses for membership
    try {
      const subscription = await bestSubscription(customerMap.stripeCustomerId);

      if (!subscription || !LIVE_STATUSES.includes(subscription.status)) {
        return res.status(404).json({
          success: false,
          error: 'No active subscription found'
        });
      }

      console.log(`Found subscription ID: ${subscription.id}`);
      
      // Cancel the subscription at period end instead of immediately
      console.log(`Updating subscription to cancel at period end`);
      const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
        metadata: { cancellation_reason: reason || 'Not provided' }
      });
      
      console.log(`Successfully updated subscription, cancel_at_period_end: ${updatedSubscription.cancel_at_period_end}`);
      
      // Update the local database
      await exports.syncStripeDataToDB(customerMap.stripeCustomerId);
      
      // Return success response
      console.log(`Cancellation successful, returning response`);
      let periodEndDate;
      try {
        // Safely convert the Unix timestamp to a JavaScript Date
        if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
          periodEndDate = new Date(subscription.current_period_end * 1000).toISOString();
        } else {
          periodEndDate = null;
        }
      } catch (dateError) {
        console.error('Error formatting date:', dateError);
        periodEndDate = null;
      }

      return res.json({
        success: true,
        message: 'Subscription cancelled successfully',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: periodEndDate
      });
    } catch (stripeError) {
      console.error('Stripe API error during cancellation:', stripeError);
      return res.status(500).json({
        success: false,
        error: 'Error from payment provider'
      });
    }
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription'
    });
  }
};

exports.reactivateSubscription = async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`Attempting to reactivate subscription for user: ${userId}`);
    
    if (!userId) {
      console.error('Missing userId in reactivate request');
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Find customer mapping to get Stripe customer ID
    const customerMap = await CustomerMap.findOne({ userId });
    console.log(`Found customer mapping:`, customerMap ? 'yes' : 'no');
    
    if (!customerMap || !customerMap.stripeCustomerId) {
      console.log(`No active subscription found for user: ${userId}`);
      return res.status(404).json({
        success: false,
        error: 'No subscription found to reactivate'
      });
    }

    try {
      // The same subscription the sync uses for membership
      const subscription = await bestSubscription(customerMap.stripeCustomerId);
      if (!subscription || !LIVE_STATUSES.includes(subscription.status)) {
        console.log(`No active subscription found for user: ${userId}`);
        return res.status(404).json({
          success: false,
          error: 'No subscription found to reactivate'
        });
      }

      // Reactivate the subscription by setting cancel_at_period_end to false
      console.log(`Reactivating subscription ID: ${subscription.id}`);
      const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false
      });
      
      console.log(`Successfully reactivated subscription, cancel_at_period_end: ${updatedSubscription.cancel_at_period_end}`);
      
      // Update the local database
      await exports.syncStripeDataToDB(customerMap.stripeCustomerId);
      
      // Return success response
      console.log(`Reactivation successful, returning response`);
      return res.json({
        success: true,
        message: 'Subscription reactivated successfully'
      });
    } catch (stripeError) {
      console.error('Stripe API error during reactivation:', stripeError);
      return res.status(500).json({
        success: false,
        error: 'Error from payment provider'
      });
    }
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reactivate subscription'
    });
  }
};

exports.createBillingPortalSession = async (req, res) => {
  try {
    const userId = req.userId;
    console.log(`Creating billing portal session for user: ${userId}`);
    
    if (!userId) {
      console.error('Missing userId in billing portal request');
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Instead of creating a session, return the temporary test link
    return res.json({ 
      success: true,
      url: 'https://billing.stripe.com/p/login/8x26oH3Mi5FzcLz5ML2kw00'
    });
    
    /* Commented out until you configure your Stripe Customer Portal
    // Find customer mapping to get Stripe customer ID
    const customerMap = await CustomerMap.findOne({ userId });
    
    if (!customerMap || !customerMap.stripeCustomerId) {
      return res.status(404).json({ 
        success: false,
        error: 'No customer record found'
      });
    }
    
    // Create a billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerMap.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/settings`,
    });
    
    // Return the URL to the client
    return res.json({ 
      success: true,
      url: session.url
    });
    */
  } catch (error) {
    console.error('Error creating billing portal session:', error);
    // The website shows a "not set up yet" message for this one Stripe error, so it keeps a fixed marker.
    const notConfigured = /No configuration provided|configuration has not been created/.test(error.message || '');
    res.status(500).json({
      success: false,
      error: 'Failed to create billing portal session',
      ...(notConfigured && { details: 'No configuration provided' })
    });
  }
};

// Add this function to manually sync all subscriptions

exports.syncAllSubscriptions = async () => {
  try {
    console.log('Starting manual sync of all subscriptions');
    const customerMaps = await CustomerMap.find({ stripeCustomerId: { $ne: null } });
    
    console.log(`Found ${customerMaps.length} customers to sync`);
    
    let syncCount = 0;
    let errorCount = 0;
    
    for (const customer of customerMaps) {
      try {
        await exports.syncStripeDataToDB(customer.stripeCustomerId);
        syncCount++;
      } catch (error) {
        console.error(`Error syncing customer ${customer.stripeCustomerId}:`, error);
        errorCount++;
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`Completed manual sync. Success: ${syncCount}, Errors: ${errorCount}`);
    return { success: syncCount, errors: errorCount };
  } catch (error) {
    console.error('Error in syncAllSubscriptions:', error);
    throw error;
  }
};

/** Syncs every Stripe customer now and then every 6 hours. server.js starts it once the database is connected. */
exports.startSubscriptionSync = () => {
  cron.schedule('0 */6 * * *', async () => {
    try {
      await exports.syncAllSubscriptions();
    } catch (error) {
      console.error('Error running scheduled subscription sync:', error);
    }
  });
  console.log('🔄 Running immediate subscription sync on server start...');
  exports.syncAllSubscriptions()
    .then(result => console.log('✅ Initial sync completed:', result))
    .catch(error => console.error('❌ Error running initial subscription sync:', error));
};
