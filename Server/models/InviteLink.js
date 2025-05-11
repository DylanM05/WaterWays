const mongoose = require('mongoose');

const inviteLinkSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  createdBy: {
    type: String,
    required: true
  },
  isRedeemed: {
    type: Boolean,
    default: false
  },
  redeemedBy: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '30d' 
  }
});

module.exports = mongoose.model('InviteLink', inviteLinkSchema);