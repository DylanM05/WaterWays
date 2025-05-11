const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  stationId: { type: String, required: true }
});

favoriteSchema.index({ userId: 1, stationId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);