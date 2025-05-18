const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const CustomerMap = require('../models/CustomerMap');
const LifetimePremium = require('../models/LifetimePremium');
const cron = require('node-cron');


exports.createMonthlyCheckoutSession = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    const userEmail = req.user?.email || "dylan.mcmullen@live.com";
    
    // Find or create a Stripe customer for this user
    let customerMap = await CustomerMap.findOne({ userId });
    let stripeCustomerId;
    
    if (!customerMap || !customerMap.stripeCustomerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
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
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId, // Use the customer ID explicitly
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
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

exports.createAnnualCheckoutSession = async (req, res) => {
   try {
    const userId = req.auth?.userId || req.session?.userId;
    const userEmail = req.user?.email || "dylan.mcmullen@live.com";
    
    // Find or create a Stripe customer for this user
    let customerMap = await CustomerMap.findOne({ userId });
    let stripeCustomerId;
    
    if (!customerMap || !customerMap.stripeCustomerId) {
      // Create a new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
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
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId, // Use the customer ID explicitly
      line_items: [{ price: process.env.STRIPE_ANUAL_PRICE_ID, quantity: 1 }],
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

exports.checkSubscriptionStatus = async (req, res) => {
  try {
    const { userId } = req;
    
    // Check for lifetime premium access first
    const lifetimePremium = await LifetimePremium.findOne({ userId });
    
    if (lifetimePremium) {
      return res.json({
        subscribed: true,
        plan: 'lifetime',
      });
    }
    
    // Find customer mapping
    const customerMap = await CustomerMap.findOne({ userId });
    
    // If no customer mapping exists or there's no Stripe customer ID, return free plan immediately
    if (!customerMap || !customerMap.stripeCustomerId) {
      return res.json({
        subscribed: false,
        plan: 'free'
      });
    }
    
    // At this point, we know customerMap and customerMap.stripeCustomerId exist
    await exports.syncStripeDataToDB(customerMap.stripeCustomerId);
    
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerMap.stripeCustomerId,
        status: 'active',
        limit: 1
      });
      
      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];

        let expiresAt;
        try {
          // First look in subscription.items.data[0].current_period_end
          let periodEnd;
          if (subscription.items?.data?.[0]?.current_period_end) {
            periodEnd = subscription.items.data[0].current_period_end;
          } 
          // Fallback to subscription.current_period_end
          else if (subscription.current_period_end) {
            periodEnd = subscription.current_period_end;
          }
          
          if (periodEnd && typeof periodEnd === 'number') {
            expiresAt = new Date(periodEnd * 1000).toISOString();
          } else {
            expiresAt = null;
          }
        } catch (dateError) {
          console.error('Error converting date:', dateError);
          expiresAt = null;
        }
        
        return res.json({
          subscribed: true,
          plan: customerMap.plan || 'paid',
          expiresAt: expiresAt,
          cancelAtPeriodEnd: subscription.cancel_at_period_end || false
        });
      }
    } catch (stripeError) {
      console.error('Stripe API error:', stripeError);
    }
    
    // If we get here, either there was no active subscription or there was an API error
    return res.json({
      subscribed: false,
      plan: 'free'
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
};

exports.handleWebhook = async (req, res) => {
  console.log('⭐ Webhook received!', req.headers['stripe-signature']);
  
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    console.error('❌ No Stripe signature found in webhook request');
    return res.status(400).send('Webhook Error: Missing Stripe signature');
  }
  
  let event;
  
  try {
    if (!Buffer.isBuffer(req.body)) {
      console.error('❌ Request body is not a Buffer! Type:', typeof req.body);
      console.error('Request body preview:', typeof req.body === 'string' ? req.body.substring(0, 100) : 'Not a string');
      return res.status(400).send('Webhook Error: Request body is not raw');
    }
    
    console.log('🔍 Attempting to construct event with signature:', signature.substring(0, 20) + '...');
    
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log('✅ Successfully constructed event of type:', event.type);
    console.log('📦 Event data summary:', JSON.stringify({
      id: event.id,
      type: event.type,
      object_id: event.data.object.id,
      customer: event.data.object.customer
    }));

  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    console.error('Webhook secret being used:', process.env.STRIPE_WEBHOOK_SECRET ? '(set)' : '(not set)');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const success = await exports.processWebhookEvent(event);
    if (!success) {
      console.error('❌ Error processing webhook event');
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('❌ Unhandled error in webhook processing:', err);
    return res.status(500).send('Webhook processing error');
  }
};

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
  ];
  
  console.log(`📝 Processing webhook event: ${event.type}`);
  
  // Skip processing if the event isn't one we're tracking
  if (!allowedEvents.includes(event.type)) {
    console.log(`⏭️ Skipping event type: ${event.type} (not in allowed list)`);
    return true;
  }
  
  try {
    // For subscription creations, ensure we process and save the current_period_end
    if (event.type === 'customer.subscription.created') {
      console.log('Processing new subscription creation');
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      if (customerId) {
        // Ensure customer mapping exists
        const customerMap = await CustomerMap.findOne({ stripeCustomerId: customerId });
        
        if (customerMap) {
          console.log(`Found customer mapping for new subscription, updating details`);
          
          // Update subscription details including current period end
          customerMap.subscriptionId = subscription.id;
          customerMap.subscriptionStatus = subscription.status;
          customerMap.cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
          
          // Get plan info
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const priceName = subscription.items?.data?.[0]?.price?.nickname;
          customerMap.plan = priceName || 'standard';
          
          // Save current period end
          let periodEnd;
          if (subscription.items?.data?.[0]?.current_period_end) {
            periodEnd = subscription.items.data[0].current_period_end;
          } else if (subscription.current_period_end) {
            periodEnd = subscription.current_period_end;
          }
          
          if (periodEnd) {
            customerMap.currentPeriodEnd = new Date(periodEnd * 1000);
            console.log(`Setting current period end for new subscription: ${customerMap.currentPeriodEnd}`);
          }
          
          await customerMap.save();
          console.log(`Successfully updated subscription details for new subscription`);
        }
      }
    }
    
    // Get customer ID from the event
    const { customer: customerId } = event.data.object;
    
    if (!customerId || typeof customerId !== 'string') {
      console.error(`❌ Missing or invalid customer ID in webhook event type: ${event.type}`);
      console.error('Event data object:', JSON.stringify(event.data.object, null, 2));
      return false;
    }
    
    // For checkout.session.completed events, create customer mapping if it doesn't exist
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.client_reference_id || session.metadata?.userId;
      
      if (userId) {
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
    let subscriptions;
    try {
      subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
        status: "all",
        expand: ["data.default_payment_method"],
      });
    } catch (stripeError) {
      console.error('Error fetching subscriptions from Stripe:', stripeError);
      // Instead of failing, just mark as no subscription
      customerMap.subscriptionStatus = "none";
      customerMap.subscriptionId = null;
      customerMap.currentPeriodEnd = null;
      customerMap.plan = "free";
      await customerMap.save();
      return customerMap;
    }

    if (!subscriptions || subscriptions.data.length === 0) {
      // No subscription found
      console.log(`No subscriptions found for customer: ${customerId}`);
      customerMap.subscriptionStatus = "none";
      customerMap.subscriptionId = null;
      customerMap.currentPeriodEnd = null;
      customerMap.plan = "free";
      await customerMap.save();
      return customerMap;
    }

    // Get the latest subscription
    const subscription = subscriptions.data[0];
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
    const userId = req.auth?.userId || req.session?.userId;
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
      // Get subscriptions directly to access period_end
      const subscriptions = await stripe.subscriptions.list({
        customer: customerMap.stripeCustomerId,
        status: 'active',
        limit: 1,
        expand: ['data.default_payment_method']
      });
      
      const updatedCustomer = await exports.syncStripeDataToDB(customerMap.stripeCustomerId);
      
      // Extract and format the current period end date for the response
      let periodEndDate = null;
      
      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];
        
        try {
          // First look in subscription.items.data[0].current_period_end
          let periodEnd;
          if (subscription.items?.data?.[0]?.current_period_end) {
            periodEnd = subscription.items.data[0].current_period_end;
          } 
          // Fallback to subscription.current_period_end
          else if (subscription.current_period_end) {
            periodEnd = subscription.current_period_end;
          }
          
          if (periodEnd && typeof periodEnd === 'number') {
            periodEndDate = new Date(periodEnd * 1000).toISOString();
          }
        } catch (dateError) {
          console.error('Error formatting subscription period end date:', dateError);
        }
      }
      
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
      error: 'Failed to process subscription success',
      details: error.message
    });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
    console.log(`Attempting to cancel subscription for user: ${userId}`);
    
    if (!userId) {
      console.error('Missing userId in cancel request');
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required'
      });
    }
    
    const { reason } = req.body;
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
    
    // Find active subscriptions for this customer
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerMap.stripeCustomerId,
        status: 'active',
        limit: 1
      });
      
      console.log(`Found ${subscriptions.data.length} active subscriptions`);
      
      if (subscriptions.data.length === 0) {
        return res.status(404).json({ 
          success: false,
          error: 'No active subscription found'
        });
      }
      
      const subscription = subscriptions.data[0];
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
        error: 'Error from payment provider',
        details: stripeError.message
      });
    }
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cancel subscription',
      details: error.message
    });
  }
};

exports.reactivateSubscription = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
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
    
    if (!customerMap || !customerMap.stripeCustomerId || !customerMap.subscriptionId) {
      console.log(`No active subscription found for user: ${userId}`);
      return res.status(404).json({ 
        success: false,
        error: 'No subscription found to reactivate'
      });
    }
    
    // Reactivate the subscription by setting cancel_at_period_end to false
    console.log(`Reactivating subscription ID: ${customerMap.subscriptionId}`);
    
    try {
      const updatedSubscription = await stripe.subscriptions.update(customerMap.subscriptionId, {
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
        error: 'Error from payment provider',
        details: stripeError.message
      });
    }
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reactivate subscription',
      details: error.message
    });
  }
};

exports.createBillingPortalSession = async (req, res) => {
  try {
    const userId = req.auth?.userId || req.session?.userId;
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
      url: 'https://billing.stripe.com/p/login/test_bJe7sE121cIn4Th9dG67S00'
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
    res.status(500).json({ 
      success: false,
      error: 'Failed to create billing portal session',
      details: error.message
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

cron.schedule('0 */6 * * *', async () => { 
  try {
    await exports.syncAllSubscriptions();
  } catch (error) {
    console.error('Error running scheduled subscription sync:', error);
  }
});
(async () => {
  console.log('🔄 Running immediate subscription sync on server start...');
  try {
    const result = await exports.syncAllSubscriptions();
    console.log('✅ Initial sync completed:', result);
  } catch (error) {
    console.error('❌ Error running initial subscription sync:', error);
  }
})();