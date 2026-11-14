const mongoose = require('mongoose');

const userVisitSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true 
  },
  // Visits are kept for 400 days (a TTL index), so "all time" in the stats means roughly the last year.
  timestamp: {
    type: Date,
    default: Date.now,
    index: { expires: 400 * 24 * 60 * 60 }
  },
  // The server's local date of the visit; one record per device per day (older records don't have it).
  day: {
    type: String
  }
});

userVisitSchema.index({ userId: 1, day: 1 }, { unique: true, partialFilterExpression: { day: { $exists: true } } });

module.exports = mongoose.model('UserVisit', userVisitSchema);