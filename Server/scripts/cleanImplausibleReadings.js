require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const StationData = require('../models/StationData');
const { DISCHARGE_LIMIT, LEVEL_MAX, LEVEL_MIN } = require('../utilities/waterQuality');
const { logMongoTarget } = require('../utilities/mongoTarget');

// Nulls stored sentinel values (e.g. -99999) so charts, averages and archives ignore them.
// Prints the counts by default; pass --apply to clear them.
// Usage: node scripts/cleanImplausibleReadings.js [--apply]
const implausibleLevel = { $or: [{ water_level: { $lte: LEVEL_MIN } }, { water_level: { $gte: LEVEL_MAX } }] };
const implausibleDischarge = { $or: [{ discharge: { $lte: -DISCHARGE_LIMIT } }, { discharge: { $gte: DISCHARGE_LIMIT } }] };

/** Counts implausible readings and, with apply, clears them. Returns the counts and what was cleared. */
async function cleanImplausibleReadings({ apply = false } = {}) {
    const [levelCount, dischargeCount, levelStations, dischargeStations] = await Promise.all([
        StationData.countDocuments(implausibleLevel),
        StationData.countDocuments(implausibleDischarge),
        StationData.distinct('station_id', implausibleLevel),
        StationData.distinct('station_id', implausibleDischarge)
    ]);
    console.log(`Implausible water levels: ${levelCount} across ${levelStations.length} station(s).`);
    console.log(`Implausible discharges: ${dischargeCount} across ${dischargeStations.length} station(s).`);
    if (!apply) {
        console.log('Dry run; pass --apply to clear these readings.');
        return { levelCount, dischargeCount, levelsCleared: 0, dischargesCleared: 0 };
    }

    const levels = await StationData.updateMany(implausibleLevel, { $set: { water_level: null } });
    const discharges = await StationData.updateMany(implausibleDischarge, { $set: { discharge: null } });
    console.log(`Cleared ${levels.modifiedCount} water level(s) and ${discharges.modifiedCount} discharge(s).`);
    return { levelCount, dischargeCount, levelsCleared: levels.modifiedCount, dischargesCleared: discharges.modifiedCount };
}

async function main() {
    const apply = process.argv.includes('--apply');
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the cleanup.');

    logMongoTarget(mongoUri, { apply });
    await mongoose.connect(mongoUri);
    try {
        await cleanImplausibleReadings({ apply });
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch(async error => {
        console.error(error.message);
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        process.exitCode = 1;
    });
}

module.exports = { cleanImplausibleReadings, implausibleDischarge, implausibleLevel };
