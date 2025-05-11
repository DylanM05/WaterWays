const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  status: { type: Boolean, required: true, default: false },
});

// Create a compound index for userId and stationId to ensure uniqueness
adminSchema.index({ userId: 1, status: 1 }, { unique: true });

module.exports = mongoose.model('Admin', adminSchema);