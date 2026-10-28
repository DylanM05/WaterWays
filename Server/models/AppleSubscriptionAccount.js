const mongoose = require('mongoose');

const appleSubscriptionAccountSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  appAccountToken: { type: String, required: true, unique: true }
}, { timestamps: true });

module.exports = mongoose.model('AppleSubscriptionAccount', appleSubscriptionAccountSchema);
