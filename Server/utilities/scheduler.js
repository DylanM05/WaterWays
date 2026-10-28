const cron = require('node-cron');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const { syncStationRealtime } = require('./hydrometricData');
const { dailyFromHourly, hourlyFromReadings } = require('./rollups');
const { cleanReadings } = require('./waterQuality');
const logger = require('./logger');

// Environment Canada often publishes readings an hour or more late, in batches; a short window never sees them.
const REALTIME_LOOKBACK_HOURS = 6;
// Five-minute readings for a week, hourly figures to 30 days, daily to 12 months, then monthly.
// Charts over 30 days show about 500 points, so hourly figures past a week look the same.
const RAW_RETENTION_DAYS = 7;
const HOURLY_RETENTION_DAYS = 30;
const DAILY_RETENTION_MONTHS = 12;
const ROLLUP_CONCURRENCY = 4;
const BULK_SIZE = 1000;
let realtimeRunActive = false;
let archiveRunActive = false;

function utcDayStart(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function processInBatches(items, concurrency, task) {
    const { default: pLimit } = await import('p-limit');
    const limit = pLimit(concurrency);
    await Promise.all(items.map(item => limit(() => task(item))));
}

async function runRealtimeSync() {
    if (realtimeRunActive) {
        logger.info('Skipping realtime sync because a previous run is still active.');
        return;
    }

    realtimeRunActive = true;
    const startedAt = Date.now();

    try {
        const stations = await StationCoordinates.find({ station_id: { $exists: true, $ne: '' } })
            .select('station_id')
            .lean();
        const stationIds = [...new Set(stations.map(station => station.station_id))];
        let completed = 0;
        let fetched = 0;
        let inserted = 0;
        let modified = 0;

        await processInBatches(stationIds, 8, async stationId => {
            try {
                const result = await syncStationRealtime(stationId, REALTIME_LOOKBACK_HOURS);
                fetched += result.records.length;
                inserted += result.inserted;
                modified += result.modified;
            } catch (error) {
                logger.error(`Realtime sync failed for station ${stationId}: ${error.message}`);
            } finally {
                completed += 1;
                if (completed % 100 === 0) logger.info(`Realtime sync processed ${completed}/${stationIds.length} stations.`);
            }
        });

        logger.info(`Realtime sync completed for ${stationIds.length} stations: ${fetched} fetched, ${inserted} inserted, ${modified} changed; ${Math.round((Date.now() - startedAt) / 1000)} seconds.`);
    } catch (error) {
        logger.error(`Realtime sync failed: ${error.message}`);
    } finally {
        realtimeRunActive = false;
    }
}

async function writeArchiveGroups(cursor, period, source) {
    let operations = [];
    let written = 0;

    for await (const group of cursor) {
        operations.push({
            updateOne: {
                filter: {
                    station_id: group._id.station_id,
                    period,
                    date_time: group._id.date_time
                },
                update: {
                    $setOnInsert: {
                        station_id: group._id.station_id,
                        period,
                        date_time: group._id.date_time,
                        water_level: group.water_level,
                        water_level_min: group.water_level_min,
                        water_level_max: group.water_level_max,
                        discharge: group.discharge,
                        discharge_min: group.discharge_min,
                        discharge_max: group.discharge_max,
                        sample_count: group.sample_count,
                        source
                    }
                },
                upsert: true
            }
        });

        if (operations.length === BULK_SIZE) {
            const result = await StationArchive.bulkWrite(operations, { ordered: false });
            written += result.upsertedCount || 0;
            operations = [];
        }
    }

    if (operations.length) {
        const result = await StationArchive.bulkWrite(operations, { ordered: false });
        written += result.upsertedCount || 0;
    }

    return written;
}

// Never replaces an existing figure, so a rerun (or readings fetched again later) can't change it.
function insertFigures(figures, stationId, period, source) {
    if (!figures.length) return { upsertedCount: 0 };
    return StationArchive.bulkWrite(figures.map(figure => ({
        updateOne: {
            filter: { station_id: stationId, period, date_time: figure.date_time },
            update: { $setOnInsert: { station_id: stationId, period, source, ...figure } },
            upsert: true
        }
    })), { ordered: false });
}

/** Rolls each station's five-minute readings before the cutoff into hourly figures, then deletes them. */
async function rollupRawToHourly(rawCutoff) {
    const olderThanCutoff = { date_time: { $type: 'date', $lt: rawCutoff } };
    const stationIds = await StationData.distinct('station_id', olderThanCutoff);
    let written = 0;
    await processInBatches(stationIds, ROLLUP_CONCURRENCY, async stationId => {
        const readings = await StationData.find({ station_id: stationId, ...olderThanCutoff })
            .sort({ date_time: 1 })
            .select('-_id date_time water_level discharge')
            .lean();
        // Spikes are dropped first, as they are when charts read raw readings, so they can't skew an hour's max.
        const result = await insertFigures(hourlyFromReadings(cleanReadings(readings)), stationId, 'hourly', 'realtime-rollup');
        written += result.upsertedCount || 0;
        // Only after this station's hours are stored.
        await StationData.deleteMany({ station_id: stationId, ...olderThanCutoff });
    });
    return { stations: stationIds.length, written };
}

/** Rolls each station's hourly figures before the cutoff into daily ones, then deletes them. */
async function rollupHourlyToDaily(hourlyCutoff) {
    const olderThanCutoff = { period: 'hourly', date_time: { $lt: hourlyCutoff } };
    const stationIds = await StationArchive.distinct('station_id', olderThanCutoff);
    let written = 0;
    await processInBatches(stationIds, ROLLUP_CONCURRENCY, async stationId => {
        const hours = await StationArchive.find({ station_id: stationId, ...olderThanCutoff })
            .sort({ date_time: 1 })
            .lean();
        const result = await insertFigures(dailyFromHourly(hours), stationId, 'daily', 'hourly-rollup');
        written += result.upsertedCount || 0;
        await StationArchive.deleteMany({ station_id: stationId, ...olderThanCutoff });
    });
    return { stations: stationIds.length, written };
}

async function rollupDailyToMonthly(monthCutoff) {
    const cursor = StationArchive.aggregate([
        { $match: { period: 'daily', date_time: { $lt: monthCutoff } } },
        {
            $group: {
                _id: {
                    station_id: '$station_id',
                    date_time: { $dateTrunc: { date: '$date_time', unit: 'month', timezone: 'UTC' } }
                },
                water_level: { $avg: '$water_level' },
                water_level_min: { $min: '$water_level_min' },
                water_level_max: { $max: '$water_level_max' },
                discharge: { $avg: '$discharge' },
                discharge_min: { $min: '$discharge_min' },
                discharge_max: { $max: '$discharge_max' },
                sample_count: { $sum: '$sample_count' }
            }
        }
    ], { allowDiskUse: true }).cursor({ batchSize: BULK_SIZE });

    await writeArchiveGroups(cursor, 'monthly', 'daily-rollup');
    await StationArchive.deleteMany({ period: 'daily', date_time: { $lt: monthCutoff } });
}

async function runArchiveMaintenance() {
    if (archiveRunActive) {
        logger.info('Skipping archive maintenance because a previous run is still active.');
        return;
    }

    archiveRunActive = true;
    try {
        const today = utcDayStart(new Date());
        const rawCutoff = new Date(today);
        rawCutoff.setUTCDate(rawCutoff.getUTCDate() - RAW_RETENTION_DAYS);
        const hourlyCutoff = new Date(today);
        hourlyCutoff.setUTCDate(hourlyCutoff.getUTCDate() - HOURLY_RETENTION_DAYS);

        const hourly = await rollupRawToHourly(rawCutoff);
        const daily = await rollupHourlyToDaily(hourlyCutoff);

        const monthlyCutoff = new Date(Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth() - DAILY_RETENTION_MONTHS,
            1
        ));
        await rollupDailyToMonthly(monthlyCutoff);

        logger.info(`Archive maintenance completed: ${hourly.written} hourly figures from ${hourly.stations} stations (readings before ${rawCutoff.toISOString()}), `
            + `${daily.written} daily figures from ${daily.stations} stations (hours before ${hourlyCutoff.toISOString()}), daily before ${monthlyCutoff.toISOString()} rolled into months.`);
    } catch (error) {
        logger.error(`Archive maintenance failed: ${error.message}`);
    } finally {
        archiveRunActive = false;
    }
}

async function startScheduler() {
    await Promise.all([StationData.init(), StationArchive.init()]);
    cron.schedule('*/10 * * * *', runRealtimeSync);
    cron.schedule('15 3 * * *', runArchiveMaintenance);

    logger.info(`Hydrometric realtime sync scheduled every ten minutes with a ${REALTIME_LOOKBACK_HOURS}-hour lookback; archive maintenance scheduled daily.`);
    runRealtimeSync();
    runArchiveMaintenance();
}

module.exports = { rollupHourlyToDaily, rollupRawToHourly, runArchiveMaintenance, runRealtimeSync, startScheduler };