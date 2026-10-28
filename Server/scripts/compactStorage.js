require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

// MongoDB reuses space freed by deleted readings for new data, but doesn't give it back to the drive on its
// own. compact rewrites a collection's files to release it. Run this once after the nightly roll-up has
// thinned the readings (and again only if a large deletion happens later), at a quiet time.
const COLLECTIONS = ['stationdatas', 'stationarchives'];
const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function onDisk(db, name) {
  const [stats] = await db.collection(name).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
  return (stats?.storageStats?.storageSize || 0) + (stats?.storageStats?.totalIndexSize || 0);
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before compacting.');
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  for (const name of COLLECTIONS) {
    const before = await onDisk(db, name);
    console.log(`Compacting ${name} (${megabytes(before)} on disk)...`);
    try {
      await db.command({ compact: name });
    } catch (error) {
      // Managed services (such as MongoDB Atlas shared tiers) don't allow compact; they reclaim space themselves.
      console.error(`  ${name} could not be compacted: ${error.message}`);
      continue;
    }
    const after = await onDisk(db, name);
    console.log(`  ${megabytes(before)} -> ${megabytes(after)} (${megabytes(Math.max(before - after, 0))} released)`);
  }
}

main()
  .catch(error => {
    console.error(`Compact failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
