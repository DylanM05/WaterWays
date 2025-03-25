const mongoose = require('mongoose');

const stationCoordinatesSchema = new mongoose.Schema({
    stationName: String,
    station_id: String,
    province: String,
    latitude: String,
    longitude: String
});

module.exports = mongoose.model('StationCoordinates', stationCoordinatesSchema);