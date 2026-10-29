const mongoose = require('mongoose');

const stationCoordinatesSchema = new mongoose.Schema({
    stationName: String,
    station_id: String,
    province: String,
    latitude: String,
    longitude: String,
    // From Environment Canada's station catalogue (scripts/syncStationCatalogue.js): whether the station has
    // a real-time feed, and its status (Active or Discontinued). Unset until the catalogue sync has run.
    realtime: Boolean,
    catalogueStatus: String
});

// Weather, coordinates and river-list lookups query by these.
stationCoordinatesSchema.index({ station_id: 1 });
stationCoordinatesSchema.index({ province: 1 });

module.exports = mongoose.model('StationCoordinates', stationCoordinatesSchema);