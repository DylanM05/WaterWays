require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const { logMongoTarget } = require('../utilities/mongoTarget');

// Drops indexes and collections nothing uses any more, to give their space back:
// - stationdatas `timestamp_ttl` expires a `timestamp` field no reading has (kept if any reading has one);
// - stationdatas `date_time_1` and stationarchives `period_1_date_time_1` only served the nightly roll-up's
//   network-wide queries. It now goes station by station, so run this once that version is deployed;
// - `stationdatas_archive_daily` is an old design's collection (kept unless empty), and `uservisits` is the
//   visit log PostHog replaced (run once the server without it is deployed).
// Prints what it would drop by default; pass --apply to drop it.
// Usage: node scripts/dropUnusedStorage.js [--apply]
const UNUSED_INDEXES = [
    // A TTL index only acts on dates, so this is what "a reading still uses it" means.
    { collection: 'stationdatas', index: 'timestamp_ttl', keepIfAny: { timestamp: { $type: 'date' } } },
    { collection: 'stationdatas', index: 'date_time_1' },
    { collection: 'stationarchives', index: 'period_1_date_time_1' }
];
const UNUSED_COLLECTIONS = [
    { collection: 'stationdatas_archive_daily', onlyIfEmpty: true },
    { collection: 'uservisits' }
];
const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function indexSizes(db, collection) {
    const [stats] = await db.collection(collection).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
    return stats?.storageStats?.indexSizes || {};
}

/** Drops the unused indexes and collections; without apply, only says what it would drop. Returns them. */
async function dropUnusedStorage(db, { apply = false } = {}) {
    const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
    const dropped = [];

    for (const { collection, index, keepIfAny } of UNUSED_INDEXES) {
        if (!existing.has(collection)) continue;
        const names = (await db.collection(collection).indexes()).map(({ name }) => name);
        if (!names.includes(index)) continue;
        if (keepIfAny && await db.collection(collection).findOne(keepIfAny, { projection: { _id: 1 } })) {
            console.log(`Keeping index ${index} on ${collection}: some documents still use it.`);
            continue;
        }
        const size = (await indexSizes(db, collection))[index] || 0;
        console.log(`${apply ? 'Dropping' : 'Would drop'} index ${index} on ${collection} (${megabytes(size)}).`);
        if (apply) await db.collection(collection).dropIndex(index);
        dropped.push({ collection, index, size });
    }

    for (const { collection, onlyIfEmpty } of UNUSED_COLLECTIONS) {
        if (!existing.has(collection)) continue;
        const documents = await db.collection(collection).estimatedDocumentCount();
        if (onlyIfEmpty && documents > 0) {
            console.log(`Keeping ${collection}: it has ${documents} document(s).`);
            continue;
        }
        console.log(`${apply ? 'Dropping' : 'Would drop'} collection ${collection} (${documents} document(s)).`);
        if (apply) await db.collection(collection).drop();
        dropped.push({ collection, documents });
    }

    if (!dropped.length) console.log('Nothing to drop.');
    else if (!apply) console.log('Dry run; pass --apply to drop these.');
    return dropped;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the cleanup.');

    logMongoTarget(mongoUri, { apply });
    await mongoose.connect(mongoUri);
    try {
        await dropUnusedStorage(mongoose.connection.db, { apply });
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

module.exports = { dropUnusedStorage, UNUSED_COLLECTIONS, UNUSED_INDEXES };
