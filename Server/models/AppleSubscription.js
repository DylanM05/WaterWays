const mongoose = require('mongoose');

const appleSubscriptionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  originalTransactionId: { type: String, required: true, unique: true },
  transactionId: { type: String, required: true, unique: true },
  productId: { type: String, required: true },
  // Purchase date of the stored transaction; the newest purchase for an original transaction decides access.
  purchaseDate: { type: Date, default: null },
  appAccountToken: { type: String, required: true },
  expiresAt: { type: Date, default: null },
  revocationDate: { type: Date, default: null },
  // From App Store Server Notifications; null until Apple reports it.
  autoRenewEnabled: { type: Boolean, default: null },
  environment: { type: String, required: true }
}, { timestamps: true });

appleSubscriptionSchema.index({ userId: 1, expiresAt: -1 });

// Xcode StoreKit test purchases are unsigned, so they only count on a local server that allows them.
const UNSIGNED_TEST_ENVIRONMENTS = ['Xcode', 'LocalTesting'];

appleSubscriptionSchema.statics.allowsUnsignedTesting = function () {
  return process.env.APPLE_ALLOW_UNSIGNED_TESTING === 'true' && process.env.NODE_ENV !== 'production';
};

/** Query for a user's subscriptions that currently grant premium. */
appleSubscriptionSchema.statics.activeFilter = function (userId) {
  const filter = { userId, expiresAt: { $gt: new Date() }, revocationDate: null };
  if (!this.allowsUnsignedTesting()) filter.environment = { $nin: UNSIGNED_TEST_ENVIRONMENTS };
  return filter;
};

module.exports = mongoose.model('AppleSubscription', appleSubscriptionSchema);
