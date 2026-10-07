const axios = require('axios');
const StationData = require('../models/StationData');

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
        water_level: finiteNumber(properties.LEVEL),
        discharge: finiteNumber(properties.DISCHARGE)
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

async function syncStationRealtime(stationId, lookbackHours = 36) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - lookbackHours * 60 * 60 * 1000);
    const records = await fetchRealtimeData(stationId, startDate, endDate);
    const writes = await upsertRealtimeData(records);
    return { records, ...writes };
}

module.exports = {
    fetchRealtimeData,
    normalizeRealtimeFeature,
    syncStationRealtime,
    upsertRealtimeData
};