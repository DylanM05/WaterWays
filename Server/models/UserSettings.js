const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  settings: {
    temperatureUnit: {
      type: String,
      enum: ['celsius', 'fahrenheit'],
      default: 'celsius'
    },
    distanceUnit: {
      type: String,
      enum: ['metric', 'imperial'],
      default: 'metric'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '24h'
    },
    defaultTab: {
      type: String,
      enum: ['water', 'pressure', 'weather', 'hourlyforecast', 'weeklyforecast', 'map'],
      default: 'water'
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('UserSettings', userSettingsSchema);