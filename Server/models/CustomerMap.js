const mongoose = require('mongoose');

const customerMapSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  stripeCustomerId: {
    type: String,
    required: true
  },
  subscriptionId: {
    type: String
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'trialing']
  },
  currentPeriodEnd: {
    type: Date
  },
  plan: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('CustomerMap', customerMapSchema);