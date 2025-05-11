const mongoose = require('mongoose');

const lifetimePremiumSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  grantedBy: {
    type: String,
    required: true
  },
  grantedAt: {
    type: Date,
    default: Date.now
  },
  inviteCode: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('LifetimePremium', lifetimePremiumSchema);