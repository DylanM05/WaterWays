const LifetimePremium = require('../models/LifetimePremium');
const AppleSubscription = require('../models/AppleSubscription');
const CustomerMap = require('../models/CustomerMap');

// Reads stored entitlements only. Stripe state in CustomerMap is kept current by webhooks and
// /sub/status, so this avoids a Stripe API call on every premium request.
async function hasPremiumAccess(userId) {
  if (await LifetimePremium.exists({ userId })) return true;

  if (await AppleSubscription.exists(AppleSubscription.activeFilter(userId))) return true;

  const customerMap = await CustomerMap.findOne({ userId }).lean();
  return Boolean(
    customerMap &&
    customerMap.subscriptionStatus === 'active' &&
    (!customerMap.currentPeriodEnd || customerMap.currentPeriodEnd > new Date())
  );
}

// Use after requireAuth.
const requirePremium = async (req, res, next) => {
  try {
    if (await hasPremiumAccess(req.userId)) return next();
    return res.status(403).json({
      error: 'Premium membership required',
      code: 'premium_required'
    });
  } catch (error) {
    console.error('Error checking premium access:', error);
    return res.status(500).json({ error: 'Failed to check membership' });
  }
};

module.exports = { hasPremiumAccess, requirePremium };
