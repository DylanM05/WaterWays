const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const CustomerMap = require('../models/CustomerMap');
const LifetimePremium = require('../models/LifetimePremium');


exports.createMonthlyCheckoutSession = async (req, res) => {
  try {

    const userId = req.auth?.userId || req.session?.userId;
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
    const lifetimePremium = await LifetimePremium.findOne({ userId });
    
    if (lifetimePremium) {
      return res.json({
        subscribed: true,
        plan: 'lifetime',
      });
    }
    const customerMapping = await CustomerMap.findOne({ userId });
    
    if (!customerMapping || !customerMapping.stripeCustomerId) {
      return res.json({
        subscribed: false,
        plan: 'free'
      });
    }
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerMapping.stripeCustomerId,
        status: 'active',
        limit: 1
      });
      
      if (subscriptions.data.length > 0) {
        const subscription = subscriptions.data[0];

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
    console.log('⭐ Webhook received!');
    
    const signature = req.headers['stripe-signature'];
    
    let event;
    
    try {
      if (!Buffer.isBuffer(req.body)) {
        console.error('❌ Request body is not a Buffer!');
        return res.status(400).send('Webhook Error: Request body is not raw');
      }
      
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      


    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error`);
    }
    const success = await exports.processWebhookEvent(event);
    if (!success) {
      console.error('❌ Error processing webhook event');
    }

    return res.status(200).json({ received: true });
};

exports.processWebhookEvent = async (event) => {
  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!userId || !customerId) {
        console.error('❌ Missing required data in webhook');
        return false;
      }
      
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      let currentPeriodEnd = null;
      if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
        currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      }
      
      const updateData = { 
        userId, 
        stripeCustomerId: customerId,
        subscriptionId: subscriptionId,
        subscriptionStatus: subscription.status,
        plan: subscription.items.data[0]?.price.nickname || 'standard'
      };
      
      if (currentPeriodEnd && !isNaN(currentPeriodEnd.getTime())) {
        updateData.currentPeriodEnd = currentPeriodEnd;
      }
      
      const result = await CustomerMap.findOneAndUpdate(
        { userId },
        updateData,
        { upsert: true, new: true }
      );
      
      return true;
    } catch (err) {
      console.error('❌ Error processing webhook:', err.stack);
      return false;
    }
  }
  
  if (event.type === 'customer.subscription.updated') {
    try {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const customerMap = await CustomerMap.findOne({ stripeCustomerId: customerId });
      
      if (customerMap) {
        customerMap.subscriptionStatus = subscription.status;
        customerMap.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        await customerMap.save();
      }
      
      return true;
    } catch (err) {
      console.error('❌ Error updating subscription:', err.stack);
      return false;
    }
  }
  
  return true;
};
