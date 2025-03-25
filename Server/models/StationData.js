const mongoose = require('mongoose');

const stationDataSchema = new mongoose.Schema({
    date_time: Date,
    water_level: Number,
    discharge: Number,
    station_id: String
});

module.exports = mongoose.model('StationData', stationDataSchema);