const mongoose = require('mongoose');

const CustomerMapSchema = new mongoose.Schema({
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
    type: String,
    default: null
  },
  subscriptionStatus: {
    type: String,
    default: 'none'
  },
  plan: {
    type: String,
    default: 'free'
  },
  currentPeriodEnd: {
    type: Date,
    default: null
  },
  cancelAtPeriodEnd: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('CustomerMap', CustomerMapSchema);