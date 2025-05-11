const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const CustomerMap = require('../models/CustomerMap');
const LifetimePremium = require('../models/LifetimePremium');

// Create a checkout session
exports.createMonthlyCheckoutSession = async (req, res) => {
  try {

    const userId = req.auth?.userId || req.session?.userId;
    
    // Get user details from Clerk or your database
    const userEmail = req.user?.email || "customer@example.com";
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: userEmail,
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
      
      // Get user details from Clerk or your database
      const userEmail = req.user?.email || "customer@example.com";
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: userEmail,
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
    
    // First check if user has lifetime premium access
    const lifetimePremium = await LifetimePremium.findOne({ userId });
    
    if (lifetimePremium) {
      return res.json({
        subscribed: true,
        plan: 'lifetime',
      });
    }
    
    // Look up the customer mapping
    const customerMapping = await CustomerMap.findOne({ userId });
    
    if (!customerMapping || !customerMapping.stripeCustomerId) {
      return res.json({
        subscribed: false,
        plan: 'free'
      });
    }
    // OPTION 2: OR Query Stripe for active subscriptions (with proper error handling)
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerMapping.stripeCustomerId,
        status: 'active',
        limit: 1
      });
      
      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];
        
        // Add safe date conversion
        let expiresAt;
        try {
          if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
            expiresAt = new Date(subscription.current_period_end * 1000).toISOString();
          } else {
            expiresAt = null;
          }
        } catch (dateError) {
          console.error('Error converting date:', dateError);
          expiresAt = null;
        }
        
        return res.json({
          subscribed: true,
          plan: 'paid',
          expiresAt: expiresAt
        });
      }
    } catch (stripeError) {
      console.error('Stripe API error:', stripeError);
    }
    
    // Default to not subscribed if we get here
    return res.json({
      subscribed: false,
      plan: 'free'
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
};


// Handle webhook events
exports.handleWebhook = async (req, res) => {
    console.log('⭐ Webhook received!');
    
    const signature = req.headers['stripe-signature'];
    console.log('Signature header:', signature ? 'Present' : 'Missing');
    console.log (signature);
    
    let event;
    
    try {
      // Make sure req.body is a Buffer
      if (!Buffer.isBuffer(req.body)) {
        console.error('❌ Request body is not a Buffer!');
        return res.status(400).send('Webhook Error: Request body is not raw');
      }
      
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      
      console.log('✅ Event successfully constructed:', event.type);
      

    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  
    // Process the webhook event
    const success = await exports.processWebhookEvent(event);
    if (!success) {
      console.error('❌ Error processing webhook event');
    }

    // Always return success to Stripe
    return res.status(200).json({ received: true });
};

// Create this new function for in-line webhook handling
exports.processWebhookEvent = async (event) => {
  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object;
      
      // Get the userId from metadata
      const userId = session.metadata?.userId || session.client_reference_id;
      
      // Get the customer and subscription IDs
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      
      console.log(`🔑 User ID: ${userId}, Customer ID: ${customerId}, Subscription: ${subscriptionId}`);
      
      if (!userId || !customerId) {
        console.error('❌ Missing required data in webhook');
        return false;
      }
      
      // Get subscription details to save status and expiration
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      // Log the subscription data for debugging
      console.log('Subscription data:', {
        status: subscription.status,
        current_period_end: subscription.current_period_end,
        valid_timestamp: typeof subscription.current_period_end === 'number'
      });
      
      // Calculate expiration date with validation
      let currentPeriodEnd = null;
      if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
        currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      }
      
      // Only include valid date in the update
      const updateData = { 
        userId, 
        stripeCustomerId: customerId,
        subscriptionId: subscriptionId,
        subscriptionStatus: subscription.status,
        plan: subscription.items.data[0]?.price.nickname || 'standard'
      };
      
      // Only add currentPeriodEnd if it's valid
      if (currentPeriodEnd && !isNaN(currentPeriodEnd.getTime())) {
        updateData.currentPeriodEnd = currentPeriodEnd;
      }
      
      // Save complete customer mapping with subscription details
      const result = await CustomerMap.findOneAndUpdate(
        { userId },
        updateData,
        { upsert: true, new: true }
      );
      
      console.log(`✅ Customer mapping saved: ${JSON.stringify(result)}`);
      return true;
    } catch (err) {
      console.error('❌ Error processing webhook:', err.stack);
      return false;
    }
  }
  
  // Also handle subscription updates
  if (event.type === 'customer.subscription.updated') {
    try {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      // Find the customer mapping by Stripe customer ID
      const customerMap = await CustomerMap.findOne({ stripeCustomerId: customerId });
      
      if (customerMap) {
        // Update subscription details
        customerMap.subscriptionStatus = subscription.status;
        customerMap.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        await customerMap.save();
        console.log('✅ Subscription status updated:', subscription.status);
      }
      
      return true;
    } catch (err) {
      console.error('❌ Error updating subscription:', err.stack);
      return false;
    }
  }
  
  return true; // Default success for other event types
};

exports.testWebhook = async (req, res) => {
    try {
      const { userId } = req;
      const result = await CustomerMap.findOneAndUpdate(
        { userId },
        { userId, stripeCustomerId: "test_customer_id" },
        { upsert: true, new: true }
      );
      res.json({ success: true, result });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Test webhook failed' });
    }
  };