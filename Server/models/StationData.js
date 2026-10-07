const mongoose = require('mongoose');

const stationDataSchema = new mongoose.Schema({
    date_time: Date,
    water_level: Number,
    discharge: Number,
    station_id: String
});

stationDataSchema.index({ station_id: 1, date_time: 1 }, { unique: true });

module.exports = mongoose.model('StationData', stationDataSchema);