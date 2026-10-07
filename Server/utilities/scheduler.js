const cron = require('node-cron');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const { syncStationRealtime } = require('./hydrometricData');
const logger = require('./logger');

const REALTIME_LOOKBACK_HOURS = 1;
const RAW_RETENTION_DAYS = 90;
const DAILY_RETENTION_MONTHS = 12;
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

async function rollupRawToDaily(rawCutoff) {
    const cursor = StationData.aggregate([
        { $match: { date_time: { $type: 'date', $lt: rawCutoff } } },
        {
            $group: {
                _id: {
                    station_id: '$station_id',
                    date_time: { $dateTrunc: { date: '$date_time', unit: 'day', timezone: 'UTC' } }
                },
                water_level: { $avg: '$water_level' },
                water_level_min: { $min: '$water_level' },
                water_level_max: { $max: '$water_level' },
                discharge: { $avg: '$discharge' },
                discharge_min: { $min: '$discharge' },
                discharge_max: { $max: '$discharge' },
                sample_count: { $sum: 1 }
            }
        }
    ], { allowDiskUse: true }).cursor({ batchSize: BULK_SIZE });

    await writeArchiveGroups(cursor, 'daily', 'realtime-rollup');
    await StationData.deleteMany({ date_time: { $type: 'date', $lt: rawCutoff } });
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

        await rollupRawToDaily(rawCutoff);

        const monthlyCutoff = new Date(Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth() - DAILY_RETENTION_MONTHS,
            1
        ));
        await rollupDailyToMonthly(monthlyCutoff);

        logger.info(`Archive maintenance completed. Raw cutoff: ${rawCutoff.toISOString()}, daily cutoff: ${monthlyCutoff.toISOString()}.`);
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

    logger.info('Hydrometric realtime sync scheduled every ten minutes with a one-hour overlap; archive maintenance scheduled daily.');
    runRealtimeSync();
    runArchiveMaintenance();
}

module.exports = { runArchiveMaintenance, runRealtimeSync, startScheduler };