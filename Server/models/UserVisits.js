const mongoose = require('mongoose');

const userVisitSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true 
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('UserVisit', userVisitSchema);