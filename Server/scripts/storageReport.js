require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

// Read-only: prints each collection's size and projects where the water data settles under the current
// retention (7 days of five-minute readings, hourly figures to 30 days, daily means to 12 months, then monthly).
const RAW_RETENTION_DAYS = 7;
const HOURLY_DAYS = 23;
const DAILY_RETENTION_DAYS = 365;

const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function collectionStats(db, name) {
  const [stats] = await db.collection(name).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
  const { count = 0, size = 0, storageSize = 0, totalIndexSize = 0, avgObjSize = 0 } = stats?.storageStats || {};
  return { name, count, size, storageSize, totalIndexSize, avgObjSize };
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the report.');
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(collection => collection.name).sort();
  const stats = await Promise.all(names.map(name => collectionStats(db, name)));

  console.log('Collection                 Documents        Data        Disk     Indexes   Avg doc');
  for (const s of stats.sort((a, b) => (b.storageSize + b.totalIndexSize) - (a.storageSize + a.totalIndexSize))) {
    console.log(`${s.name.padEnd(24)} ${String(s.count).padStart(11)} ${megabytes(s.size).padStart(11)} ${megabytes(s.storageSize).padStart(11)} ${megabytes(s.totalIndexSize).padStart(11)} ${String(Math.round(s.avgObjSize)).padStart(7)} B`);
  }
  const total = stats.reduce((sum, s) => sum + s.storageSize + s.totalIndexSize, 0);
  console.log(`\nTotal on disk, including indexes: ${megabytes(total)}`);

  // Projections use size on disk (compressed data plus indexes) per document.
  const onDiskPerDocument = s => (s.storageSize + s.totalIndexSize) / Math.max(s.count, 1);
  const raw = stats.find(s => s.name === 'stationdatas');
  const archive = stats.find(s => s.name === 'stationarchives');
  const stations = await db.collection('stationdatas').distinct('station_id');
  if (raw && stations.length) {
    const fullRaw = stations.length * 288 * RAW_RETENTION_DAYS;
    console.log(`\n${stations.length} stations with readings, up to 288 readings per station per day:`);
    const rawNow = `five-minute readings: ${megabytes(raw.storageSize + raw.totalIndexSize)} now, about ${megabytes(fullRaw * onDiskPerDocument(raw))} once only ${RAW_RETENTION_DAYS} days are kept`;
    // Well over a week of readings means the nightly roll-up hasn't thinned them yet (new code not deployed).
    console.log(raw.count > fullRaw * 1.1
      ? `  ${rawNow}. Holding about ${Math.round(raw.count / (stations.length * 288))} days, so they haven't been thinned yet.`
      : `  ${rawNow} (${Math.round((raw.count / fullRaw) * 100)}% of that)`);
    if (archive) {
      const perDocument = onDiskPerDocument(archive);
      console.log(`  hourly figures: about ${megabytes(stations.length * HOURLY_DAYS * 24 * perDocument)} for days 8–30`);
      console.log(`  daily means: about ${megabytes(stations.length * DAILY_RETENTION_DAYS * perDocument)} once 12 months are kept`);
      console.log(`  monthly means: grow by about ${megabytes(stations.length * 12 * perDocument)} a year`);
    }
  }
}

main()
  .catch(error => {
    console.error(`Storage report failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
