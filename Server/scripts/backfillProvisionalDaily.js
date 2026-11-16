require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const axios = require('axios');
const mongoose = require('mongoose');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const { cleanReadings } = require('../utilities/waterQuality');
const { dailyFromHourly, hourlyFromReadings } = require('../utilities/rollups');
const { logMongoTarget } = require('../utilities/mongoTarget');

// The historical archive (HYDAT) lags by over a year and the real-time API keeps only 30 days, so
// the months in between were missing from History. Water Office serves five-minute data (provisional,
// and final once approved) for about the last 19 months; this rolls it up into daily means. Nightly
// maintenance later rolls days older than 12 months into monthly means, as it does for collected
// readings. The window moves forward every day, so days that fall out of it before this runs are gone
// until HYDAT catches up (rerun backfillHydrometricHistory.js after each HYDAT release).
const WATER_OFFICE_URL = 'https://wateroffice.ec.gc.ca/services/real_time_data/csv/inline';
const LEVEL_PARAMETER = '46';
const DISCHARGE_PARAMETER = '47';
// Water Office answered from about 578 days back (checked Nov 2026); asking a little earlier costs one
// mostly empty request per station.
const WINDOW_DAYS = 590;
// Water Office handled 8 stations at a time with no pause (240 requests in 6s, none dropped, Nov 2026).
// When it does drop connections, requests are retried with a growing wait. --concurrency and --pause
// override these; tests set pauseMs to 0.
const settings = { concurrency: 8, pauseMs: 0, retryWaitsMs: [5000, 10000, 20000, 40000, 60000] };
const SOURCE = 'wateroffice-provisional';
const DAY_MS = 24 * 60 * 60 * 1000;
const USAGE = 'Usage: node scripts/backfillProvisionalDaily.js <stationId|--all> [--dry-run] [--concurrency N] [--pause MS]';

const monthStart = (date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
const dayStart = date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const formatTime = date => date.toISOString().slice(0, 19).replace('T', ' ');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchReadings(stationId, start, end) {
    for (let attempt = 0; ; attempt++) {
        try {
            // Built by hand: the service needs repeated "parameters[]" keys, which axios rewrites.
            const query = [
                ['stations[]', stationId],
                ['parameters[]', LEVEL_PARAMETER],
                ['parameters[]', DISCHARGE_PARAMETER],
                ['start_date', formatTime(start)],
                ['end_date', formatTime(end)]
            ].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
            if (settings.pauseMs) await wait(settings.pauseMs);
            // Compressed, a station's month is about 75 KB instead of 1 MB (axios asks for gzip and unpacks it).
            const response = await axios.get(`${WATER_OFFICE_URL}?${query}`, {
                responseType: 'text',
                timeout: 60000
            });
            return parseReadings(response.data, start, end);
        } catch (error) {
            if (attempt >= settings.retryWaitsMs.length) throw error;
            await wait(settings.retryWaitsMs[attempt]);
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

// Thinned the same way as readings this server collects: cleaned, rolled into hours, then into days, so a
// backfilled day has the same mean, range and per-metric counts as one built by nightly maintenance.
function dailyMeans(readings) {
    return dailyFromHourly(hourlyFromReadings(cleanReadings(readings)));
}

async function backfillStation(stationId, dryRun) {
    const now = new Date();
    const [recentMonths, earliestRaw, earliestHourly] = await Promise.all([
        StationArchive.find({ station_id: stationId, period: 'monthly' }).sort({ date_time: -1 }).limit(36)
            .select('date_time water_level discharge').lean(),
        StationData.findOne({ station_id: stationId }).sort({ date_time: 1 }).select('date_time').lean(),
        StationArchive.findOne({ station_id: stationId, period: 'hourly' }).sort({ date_time: 1 }).select('date_time').lean()
    ]);

    // Start at the first day Water Office still has, or after the newest monthly mean with a value. HYDAT
    // lists some months it hasn't filled in yet (no level or flow); those don't count.
    let from = dayStart(new Date(now.getTime() - WINDOW_DAYS * DAY_MS));
    const latestMonthly = recentMonths.find(record => record.water_level != null || record.discharge != null);
    if (latestMonthly && monthStart(latestMonthly.date_time, 1) > from) from = monthStart(latestMonthly.date_time, 1);
    // Collected readings (raw, or already rolled into hours) take over from here.
    const collectedFrom = [earliestRaw, earliestHourly].filter(Boolean).map(record => record.date_time);
    const end = collectedFrom.length ? dayStart(new Date(Math.min(...collectedFrom))) : dayStart(now);

    let written = 0;
    let days = 0;
    // A month at a time (the first may start mid-month).
    for (; from < end; from = monthStart(from, 1)) {
        const chunkEnd = new Date(Math.min(monthStart(from, 1).getTime(), end.getTime()));
        const expectedDays = Math.round((chunkEnd - from) / DAY_MS);
        const existing = await StationArchive.countDocuments({
            station_id: stationId,
            period: 'daily',
            date_time: { $gte: from, $lt: chunkEnd }
        });
        if (existing >= expectedDays) continue; // already backfilled or rolled up from collected readings

        const means = dailyMeans(await fetchReadings(stationId, from, chunkEnd));
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
    const option = name => {
        const index = args.indexOf(name);
        if (index === -1) return undefined;
        const value = Number(args[index + 1]);
        if (!Number.isInteger(value) || value < 0) throw new Error(USAGE);
        args.splice(index, 2);
        return value;
    };
    settings.concurrency = option('--concurrency') || settings.concurrency;
    settings.pauseMs = option('--pause') ?? settings.pauseMs;
    const target = args.find(arg => arg !== '--dry-run');
    if (!target || (target !== '--all' && !/^[A-Za-z0-9]+$/.test(target))) throw new Error(USAGE);

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the backfill.');
    logMongoTarget(mongoUri, { apply: !dryRun });
    await mongoose.connect(mongoUri);

    // Water Office only has stations with a real-time feed; the catalogue marks the others realtime: false.
    const stationIds = target === '--all'
        ? [...new Set((await StationCoordinates.find({ station_id: { $exists: true, $ne: '' }, realtime: { $ne: false } }).select('station_id').lean())
            .map(station => station.station_id))]
        : [target.toUpperCase()];

    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(settings.concurrency);
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

module.exports = { backfillStation, dailyMeans, parseReadings, settings, WINDOW_DAYS };
