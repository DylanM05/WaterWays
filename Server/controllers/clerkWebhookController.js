const { verifyWebhook } = require('@clerk/express/webhooks');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Admin = require('../models/Admin');
const AppleSubscription = require('../models/AppleSubscription');
const AppleSubscriptionAccount = require('../models/AppleSubscriptionAccount');
const CustomerMap = require('../models/CustomerMap');
const Favorite = require('../models/Favorite');
const InviteLink = require('../models/InviteLink');
const LifetimePremium = require('../models/LifetimePremium');
const UserSettings = require('../models/UserSettings');
const UserVisit = require('../models/UserVisits');

const BILLABLE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'];

// Removes everything stored for a deleted Clerk user. Safe to run more than once, since Svix retries.
async function deleteUserData(userId) {
  const customerMap = await CustomerMap.findOne({ userId }).lean();
  if (customerMap?.subscriptionId && BILLABLE_STATUSES.includes(customerMap.subscriptionStatus)) {
    try {
      await stripe.subscriptions.cancel(customerMap.subscriptionId);
    } catch (error) {
      // Already cancelled in Stripe; anything else should fail the delivery so Svix retries.
      if (error.code !== 'resource_missing') throw error;
    }
  }

  // The Stripe customer itself is kept: its invoices are financial records.
  await Promise.all([
    CustomerMap.deleteMany({ userId }),
    Favorite.deleteMany({ userId }),
    UserSettings.deleteMany({ userId }),
    UserVisit.deleteMany({ userId }),
    LifetimePremium.deleteMany({ userId }),
    Admin.deleteMany({ userId }),
    AppleSubscription.deleteMany({ userId }),
    AppleSubscriptionAccount.deleteMany({ userId }),
    InviteLink.deleteMany({ createdBy: userId }),
    InviteLink.updateMany({ redeemedBy: userId }, { $set: { redeemedBy: null } })
  ]);
}

exports.handleClerkWebhook = async (req, res) => {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    console.error('CLERK_WEBHOOK_SIGNING_SECRET is not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event;
  try {
    // Checks the Svix signature and timestamp against the raw body (see the route in server.js).
    event = await verifyWebhook(req);
  } catch {
    return res.status(400).json({ error: 'Webhook validation failed' });
  }

  if (event.type !== 'user.deleted') return res.json({ received: true });

  const userId = event.data?.id;
  if (typeof userId !== 'string' || !userId) {
    return res.status(400).json({ error: 'Deleted user ID missing' });
  }

  try {
    await deleteUserData(userId);
    console.log(`Deleted stored data for Clerk user ${userId}`);
    return res.json({ received: true });
  } catch (error) {
    console.error(`Failed to delete data for Clerk user ${userId}:`, error);
    return res.status(500).json({ error: 'Failed to delete user data' });
  }
};

exports.deleteUserData = deleteUserData;
