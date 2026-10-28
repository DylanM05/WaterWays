require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const { fillRecentGaps, syncStationRealtime } = require('../utilities/hydrometricData');

// The API keeps 30 days; readings older than a week are rolled into hourly figures each night.
const DEFAULT_HOURS = 7 * 24;
const MAX_HOURS = 30 * 24;
const STATION_CONCURRENCY = 2;
const USAGE = 'Usage: node scripts/backfillRecentRealtime.js <stationId|--all> [--full] [--dry-run] [--hours N]\n'
    + '  default    fetch only time ranges missing from the window\n'
    + '  --full     refetch the whole window for each station\n'
    + '  --dry-run  report missing ranges without fetching or writing\n'
    + '  --hours N  window size in hours (default 168, i.e. 7 days; at most 720)';

function hours(milliseconds) {
    return Math.round(milliseconds / (60 * 60 * 1000));
}

async function main() {
    const args = process.argv.slice(2);
    const full = args.includes('--full');
    const dryRun = args.includes('--dry-run');
    const hoursIndex = args.indexOf('--hours');
    const lookbackHours = hoursIndex === -1 ? DEFAULT_HOURS : Number.parseInt(args[hoursIndex + 1], 10);
    const target = args.find((arg, index) => !['--full', '--dry-run', '--hours'].includes(arg) && index !== hoursIndex + 1);
    if (!target || (target !== '--all' && !/^[A-Za-z0-9]+$/.test(target)) || (full && dryRun)
        || !(lookbackHours > 0 && lookbackHours <= MAX_HOURS)) {
        throw new Error(USAGE);
    }

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the backfill.');

    await mongoose.connect(mongoUri);
    await StationData.init();

    const stationIds = target === '--all'
        ? [...new Set((await StationCoordinates.find({ station_id: { $exists: true, $ne: '' } })
            .select('station_id')
            .lean()).map(station => station.station_id))]
        : [target];
    const endDate = new Date();
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(STATION_CONCURRENCY);
    let complete = 0;
    let withGaps = 0;
    let missingHours = 0;
    let fetched = 0;
    let inserted = 0;
    let modified = 0;
    let failures = 0;

    try {
        await Promise.all(stationIds.map(stationId => limit(async () => {
            try {
                if (full) {
                    const result = await syncStationRealtime(stationId, lookbackHours, endDate);
                    fetched += result.records.length;
                    inserted += result.inserted;
                    modified += result.modified;
                    console.log(`${stationId}: fetched ${result.records.length}, inserted ${result.inserted}, modified ${result.modified}.`);
                    return;
                }

                const result = await fillRecentGaps(stationId, lookbackHours, endDate, { dryRun });
                if (!result.gaps.length) {
                    complete += 1;
                    return;
                }

                const stationMissingHours = result.gaps.reduce((total, gap) => total + hours(gap.end - gap.start), 0);
                withGaps += 1;
                missingHours += stationMissingHours;
                fetched += result.records.length;
                inserted += result.inserted;
                modified += result.modified;
                const summary = `${stationId}: ${result.storedCount} stored, ${result.gaps.length} gap(s), ~${stationMissingHours}h missing`;
                console.log(dryRun ? summary : `${summary}; fetched ${result.records.length}, inserted ${result.inserted}.`);
            } catch (error) {
                failures += 1;
                console.error(`${stationId}: backfill failed: ${error.message}`);
            }
        })));

        if (full) {
            console.log(`Full backfill complete for ${stationIds.length} station(s): ${fetched} fetched, ${inserted} inserted, ${modified} modified, ${failures} failed.`);
        } else {
            console.log(`${dryRun ? 'Dry run' : 'Gap fill'} complete for ${stationIds.length} station(s): ${complete} complete, ${withGaps} with gaps (~${missingHours}h missing in total)`
                + `${dryRun ? '' : `, ${fetched} fetched, ${inserted} inserted`}, ${failures} failed.`);
        }
        if (failures) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

main().catch(async error => {
    console.error(error.message);
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    process.exitCode = 1;
});
