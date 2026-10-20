const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  stationId: { type: String, required: true },
  favoriteType: { type: String, enum: ['station', 'river'], default: 'station' },
  stationName: { type: String, default: null },
  province: { type: String, default: null },
  riverName: { type: String, default: null },
  stations: [{
    stationId: { type: String, required: true },
    stationName: { type: String, default: null },
    province: { type: String, default: null },
    latitude: { type: String, default: null },
    longitude: { type: String, default: null },
    section: { type: String, default: null }
  }]
}, { timestamps: true });

favoriteSchema.index({ userId: 1, stationId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);