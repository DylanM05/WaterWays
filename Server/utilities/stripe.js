const Stripe = require('stripe');

// The Stripe API version every request uses. It is pinned, so upgrading the stripe package doesn't change
// what Stripe returns: this is the version stripe 18.1.0 sent, which the membership code was written against.
// Webhook payloads use the version set on the endpoint in the Stripe dashboard instead (see README).
const STRIPE_API_VERSION = '2025-04-30.basil';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });

module.exports = { stripe, STRIPE_API_VERSION };
