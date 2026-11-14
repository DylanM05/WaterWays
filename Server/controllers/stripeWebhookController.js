const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const subscriptionController = require('./subscriptionController');

// Stripe signs the exact request body, so it is read raw (as a Buffer), capped at 1 MB; larger bodies get 413.
exports.readBody = express.raw({ type: 'application/json', limit: '1mb' });

exports.handleStripeWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook Error:', err.message);
    return res.status(400).json({
      error: 'Webhook validation failed'
    });
  }

  // Every event goes through processWebhookEvent, which ignores types it doesn't track, so cancellations,
  // renewals and failed payments update memberships right away instead of at the next 6-hourly sync.
  // Ignored types count as handled (200); a real failure answers 500 so Stripe retries the delivery.
  let success = false;
  try {
    success = await subscriptionController.processWebhookEvent(event);
  } catch (err) {
    console.error(`❌ Error processing webhook ${event.type}:`, err);
  }
  if (!success) {
    console.error(`❌ Failed to process webhook ${event.type}`);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  return res.json({ received: true });
};
