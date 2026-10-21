const axios = require('axios');
const StationData = require('../models/StationData');
const { plausibleDischarge, plausibleLevel } = require('./waterQuality');

const API_URL = 'https://api.weather.gc.ca/collections/hydrometric-realtime/items';
const PAGE_SIZE = 1000;

function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeRealtimeFeature(feature) {
    const properties = feature?.properties || {};
    const date_time = new Date(properties.DATETIME);

    if (!properties.STATION_NUMBER || Number.isNaN(date_time.getTime())) return null;

    return {
        station_id: properties.STATION_NUMBER,
        date_time,
        water_level: plausibleLevel(finiteNumber(properties.LEVEL)),
        discharge: plausibleDischarge(finiteNumber(properties.DISCHARGE))
    };
}

async function fetchRealtimeData(stationId, startDate, endDate) {
    const records = [];
    let offset = 0;

    while (true) {
        const response = await axios.get(API_URL, {
            params: {
                STATION_NUMBER: stationId,
                datetime: `${startDate.toISOString()}/${endDate.toISOString()}`,
                sortby: 'DATETIME',
                limit: PAGE_SIZE,
                offset,
                f: 'json'
            },
            timeout: 30000
        });
        const features = response.data?.features || [];
        records.push(...features.map(normalizeRealtimeFeature).filter(Boolean));

        if (features.length < PAGE_SIZE) break;
        offset += features.length;
    }

    return records;
}

async function upsertRealtimeData(records) {
    if (!records.length) return { inserted: 0, modified: 0 };

    const operations = records.map(record => ({
        updateOne: {
            filter: { station_id: record.station_id, date_time: record.date_time },
            update: { $set: record },
            upsert: true
        }
    }));

    const result = await StationData.bulkWrite(operations, { ordered: false });
    return {
        inserted: result.upsertedCount || 0,
        modified: result.modifiedCount || 0
    };
}

async function syncStationRealtime(stationId, lookbackHours = 36, endDate = new Date()) {
    const startDate = new Date(endDate.getTime() - lookbackHours * 60 * 60 * 1000);
    const records = await fetchRealtimeData(stationId, startDate, endDate);
    const writes = await upsertRealtimeData(records);
    return { records, ...writes };
}

// Stations report every 5–60 minutes; a longer silence means readings are missing.
const GAP_THRESHOLD_MS = 3 * 60 * 60 * 1000;
// Past this many gaps, one request across the whole span is cheaper than many small ones.
const MAX_GAP_REQUESTS = 5;

async function findMissingRanges(stationId, startDate, endDate) {
    const readings = await StationData.find({
        station_id: stationId,
        date_time: { $gte: startDate, $lte: endDate }
    })
        .select('-_id date_time')
        .sort({ date_time: 1 })
        .lean();

    const ranges = [];
    let previous = startDate;
    for (const { date_time } of readings) {
        if (date_time - previous > GAP_THRESHOLD_MS) ranges.push({ start: previous, end: date_time });
        previous = date_time;
    }
    if (endDate - previous > GAP_THRESHOLD_MS) ranges.push({ start: previous, end: endDate });

    return { ranges, storedCount: readings.length };
}

async function fillRecentGaps(stationId, lookbackHours = 30 * 24, endDate = new Date(), { dryRun = false } = {}) {
    const startDate = new Date(endDate.getTime() - lookbackHours * 60 * 60 * 1000);
    const { ranges, storedCount } = await findMissingRanges(stationId, startDate, endDate);
    const result = { gaps: ranges, storedCount, records: [], inserted: 0, modified: 0 };
    if (!ranges.length || dryRun) return result;

    const requests = ranges.length > MAX_GAP_REQUESTS
        ? [{ start: ranges[0].start, end: ranges[ranges.length - 1].end }]
        : ranges;
    for (const range of requests) {
        result.records.push(...await fetchRealtimeData(stationId, range.start, range.end));
    }

    return { ...result, ...await upsertRealtimeData(result.records) };
}

module.exports = {
    fetchRealtimeData,
    fillRecentGaps,
    normalizeRealtimeFeature,
    syncStationRealtime,
    upsertRealtimeData
};