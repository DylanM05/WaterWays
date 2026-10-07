const mongoose = require('mongoose');

const stationArchiveSchema = new mongoose.Schema({
    station_id: { type: String, required: true },
    period: { type: String, enum: ['daily', 'monthly'], required: true },
    date_time: { type: Date, required: true },
    water_level: Number,
    water_level_min: Number,
    water_level_max: Number,
    discharge: Number,
    discharge_min: Number,
    discharge_max: Number,
    sample_count: Number,
    source: { type: String, required: true }
}, { timestamps: true });

stationArchiveSchema.index(
    { station_id: 1, period: 1, date_time: 1 },
    { unique: true }
);

module.exports = mongoose.model('StationArchive', stationArchiveSchema);