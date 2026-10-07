require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');
const mongoose = require('mongoose');
const StationCoordinates = require('../models/StationCoordinates');
const StationArchive = require('../models/StationArchive');

const COLLECTION_URL = 'https://api.weather.gc.ca/collections/hydrometric-monthly-mean/items';
const PAGE_SIZE = 1000;

function startOfMonth(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function importStationMonthlyMeans(stationId, cutoff) {
    let offset = 0;
    let imported = 0;

    while (true) {
        const response = await axios.get(COLLECTION_URL, {
            params: {
                STATION_NUMBER: stationId,
                sortby: '-DATE',
                limit: PAGE_SIZE,
                offset,
                f: 'json'
            },
            timeout: 30000
        });
        const features = response.data?.features || [];
        if (!features.length) break;

        const operations = features.flatMap(feature => {
            const properties = feature.properties || {};
            const date_time = new Date(`${properties.DATE}-01T00:00:00.000Z`);
            if (!properties.STATION_NUMBER || Number.isNaN(date_time.getTime()) || date_time >= cutoff) return [];

            return [{
                updateOne: {
                    filter: { station_id: stationId, period: 'monthly', date_time },
                    update: {
                        $set: {
                            station_id: stationId,
                            period: 'monthly',
                            date_time,
                            water_level: typeof properties.MONTHLY_MEAN_LEVEL === 'number' ? properties.MONTHLY_MEAN_LEVEL : null,
                            water_level_min: null,
                            water_level_max: null,
                            discharge: typeof properties.MONTHLY_MEAN_DISCHARGE === 'number' ? properties.MONTHLY_MEAN_DISCHARGE : null,
                            discharge_min: null,
                            discharge_max: null,
                            sample_count: null,
                            source: 'hydat-monthly-mean'
                        }
                    },
                    upsert: true
                }
            }];
        });

        if (operations.length) {
            const result = await StationArchive.bulkWrite(operations, { ordered: false });
            imported += (result.upsertedCount || 0) + (result.modifiedCount || 0);
        }

        if (features.length < PAGE_SIZE) break;
        offset += features.length;
    }

    return imported;
}

async function main() {
    const target = process.argv[2];
    if (!target || (target !== '--all' && !/^[A-Za-z0-9]+$/.test(target))) {
        throw new Error('Usage: node scripts/backfillHydrometricHistory.js <stationId|--all>');
    }

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the backfill.');

    await mongoose.connect(mongoUri);
    const cutoff = startOfMonth(new Date());
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);

    const stationIds = target === '--all'
        ? [...new Set((await StationCoordinates.find({ station_id: { $exists: true, $ne: '' } }).select('station_id').lean()).map(station => station.station_id))]
        : [target];
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(2);
    let imported = 0;

    await Promise.all(stationIds.map(stationId => limit(async () => {
        try {
            const count = await importStationMonthlyMeans(stationId, cutoff);
            imported += count;
            console.log(`Imported ${count} monthly archive records for ${stationId}.`);
        } catch (error) {
            console.error(`Historical backfill failed for ${stationId}: ${error.message}`);
        }
    })));

    console.log(`Historical monthly backfill finished: ${imported} records across ${stationIds.length} station(s).`);
    await mongoose.disconnect();
}

main().catch(async error => {
    console.error(error.message);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    process.exitCode = 1;
});