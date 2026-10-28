require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');
const mongoose = require('mongoose');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const { cleanReadings } = require('../utilities/waterQuality');

// The historical archive (HYDAT) lags by over a year and the real-time API keeps only 30 days, so
// the months in between were missing from History. Water Office serves provisional five-minute data
// for the last 18 months; this rolls it up into daily means. Nightly maintenance later rolls days
// older than 12 months into monthly means, as it does for collected readings.
const WATER_OFFICE_URL = 'https://wateroffice.ec.gc.ca/services/real_time_data/csv/inline';
const LEVEL_PARAMETER = '46';
const DISCHARGE_PARAMETER = '47';
const AVAILABLE_MONTHS = 17; // whole months inside Water Office's 18-month window
const STATION_CONCURRENCY = 2;
const SOURCE = 'wateroffice-provisional';
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE = 'Usage: node scripts/backfillProvisionalDaily.js <stationId|--all> [--dry-run]';

const monthStart = (date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
const dayStart = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const formatTime = date => date.toISOString().slice(0, 19).replace('T', ' ');

async function fetchReadings(stationId, start, end) {
    for (let attempt = 1; ; attempt++) {
        try {
            // Built by hand: the service needs repeated "parameters[]" keys, which axios rewrites.
            const query = [
                ['stations[]', stationId],
                ['parameters[]', LEVEL_PARAMETER],
                ['parameters[]', DISCHARGE_PARAMETER],
                ['start_date', formatTime(start)],
                ['end_date', formatTime(end)]
            ].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
            const response = await axios.get(`${WATER_OFFICE_URL}?${query}`, {
                responseType: 'text',
                timeout: 60000
            });
            return parseReadings(response.data, start, end);
        } catch (error) {
            if (attempt === 3) throw error;
            await new Promise(resolve => setTimeout(resolve, attempt * 5000));
        }
    }
}

// Rows look like: 08MF005,2025-11-01T00:05:00Z,46,3.660,,,Provisional/Provisoire,,
function parseReadings(csv, start, end) {
    const readings = new Map();
    for (const line of csv.split('\n').slice(1)) {
        const [, time, parameter, rawValue] = line.split(',');
        const value = Number.parseFloat(rawValue);
        const date_time = new Date(time);
        if (!Number.isFinite(value) || Number.isNaN(date_time.getTime())) continue;
        if (date_time < start || date_time >= end) continue;

        const key = date_time.getTime();
        if (!readings.has(key)) readings.set(key, { date_time, water_level: null, discharge: null });
        if (parameter === LEVEL_PARAMETER) readings.get(key).water_level = value;
        if (parameter === DISCHARGE_PARAMETER) readings.get(key).discharge = value;
    }
    return [...readings.values()].sort((a, b) => a.date_time - b.date_time);
}

function summarizeMetric(values) {
    if (!values.length) return { mean: null, min: null, max: null };
    return {
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
    };
}

// Same shape as the nightly roll-up of collected readings (UTC days, mean/min/max per metric).
function dailyMeans(readings) {
    const days = new Map();
    for (const reading of cleanReadings(readings)) {
        const key = dayStart(reading.date_time).getTime();
        if (!days.has(key)) days.set(key, []);
        days.get(key).push(reading);
    }
    return [...days.entries()].map(([key, members]) => {
        const level = summarizeMetric(members.map(member => member.water_level).filter(value => value !== null));
        const discharge = summarizeMetric(members.map(member => member.discharge).filter(value => value !== null));
        return {
            date_time: new Date(key),
            water_level: level.mean,
            water_level_min: level.min,
            water_level_max: level.max,
            discharge: discharge.mean,
            discharge_min: discharge.min,
            discharge_max: discharge.max,
            sample_count: members.length
        };
    });
}

async function backfillStation(stationId, dryRun) {
    const now = new Date();
    const [latestMonthly, earliestRaw, earliestHourly] = await Promise.all([
        StationArchive.findOne({ station_id: stationId, period: 'monthly' }).sort({ date_time: -1 }).select('date_time').lean(),
        StationData.findOne({ station_id: stationId }).sort({ date_time: 1 }).select('date_time').lean(),
        StationArchive.findOne({ station_id: stationId, period: 'hourly' }).sort({ date_time: 1 }).select('date_time').lean()
    ]);

    // Start at the first whole month Water Office still has, or after the newest monthly mean.
    let month = monthStart(now, -AVAILABLE_MONTHS);
    if (latestMonthly && latestMonthly.date_time >= month) month = monthStart(latestMonthly.date_time, 1);
    // Collected readings (raw, or already rolled into hours) take over from here.
    const collectedFrom = [earliestRaw, earliestHourly].filter(Boolean).map(record => record.date_time);
    const end = collectedFrom.length ? dayStart(new Date(Math.min(...collectedFrom))) : dayStart(now);

    let written = 0;
    let days = 0;
    for (; month < end; month = monthStart(month, 1)) {
        const monthEnd = new Date(Math.min(monthStart(month, 1).getTime(), end.getTime()));
        const expectedDays = Math.round((monthEnd - month) / DAY_MS);
        const existing = await StationArchive.countDocuments({
            station_id: stationId,
            period: 'daily',
            date_time: { $gte: month, $lt: monthEnd }
        });
        if (existing >= expectedDays) continue; // already backfilled or rolled up from collected readings

        const means = dailyMeans(await fetchReadings(stationId, month, monthEnd));
        days += means.length;
        if (dryRun || !means.length) continue;

        const result = await StationArchive.bulkWrite(means.map(mean => ({
            updateOne: {
                filter: { station_id: stationId, period: 'daily', date_time: mean.date_time },
                // Never replace a day rolled up from readings this server collected.
                update: { $setOnInsert: { station_id: stationId, period: 'daily', source: SOURCE, ...mean } },
                upsert: true
            }
        })), { ordered: false });
        written += result.upsertedCount || 0;
    }
    return { days, written };
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const target = args.find(arg => arg !== '--dry-run');
    if (!target || (target !== '--all' && !/^[A-Za-z0-9]+$/.test(target))) throw new Error(USAGE);

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the backfill.');
    await mongoose.connect(mongoUri);

    const stationIds = target === '--all'
        ? [...new Set((await StationCoordinates.find({ station_id: { $exists: true, $ne: '' } }).select('station_id').lean())
            .map(station => station.station_id))]
        : [target.toUpperCase()];

    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(STATION_CONCURRENCY);
    let finished = 0;
    let totalWritten = 0;
    let failures = 0;

    await Promise.all(stationIds.map(stationId => limit(async () => {
        try {
            const { days, written } = await backfillStation(stationId, dryRun);
            totalWritten += written;
            console.log(`[${++finished}/${stationIds.length}] ${stationId}: ${days} days found${dryRun ? '' : `, ${written} written`}`);
        } catch (error) {
            failures++;
            console.error(`[${++finished}/${stationIds.length}] ${stationId} failed: ${error.message}`);
        }
    })));

    console.log(dryRun
        ? `Dry run finished; nothing was written. ${failures} station(s) failed.`
        : `Provisional daily backfill finished: ${totalWritten} days written, ${failures} station(s) failed. Rerun to retry failures.`);
}

if (require.main === module) {
    main()
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        })
        .finally(() => mongoose.disconnect());
}

module.exports = { backfillStation, dailyMeans, parseReadings };
