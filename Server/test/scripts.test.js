// Operational scripts: dry run by default, and they say which database they write to without its credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const StationData = require('../models/StationData');
const { describeMongoTarget } = require('../utilities/mongoTarget');
const { cleanImplausibleReadings } = require('../scripts/cleanImplausibleReadings');

test('the database target shows hosts and database name, never credentials or options', () => {
  const cases = {
    'mongodb+srv://admin:s3cret@cluster0.abc.mongodb.net/waterways?retryWrites=true&w=majority': 'cluster0.abc.mongodb.net/waterways',
    'mongodb://user:p%40ss@db1.example.com:27017,db2.example.com:27017/prod?replicaSet=rs0&authSource=admin': 'db1.example.com:27017,db2.example.com:27017/prod',
    'mongodb://user:p@ss/word@host:27017/app': 'host:27017/app',
    'mongodb://localhost:27017': 'localhost:27017/test',
    'mongodb://localhost/?authSource=admin': 'localhost/test',
    'postgres://user:secret@host/db': 'an unrecognised MongoDB URI'
  };
  for (const [uri, expected] of Object.entries(cases)) {
    const target = describeMongoTarget(uri);
    assert.equal(target, expected, uri);
    assert.doesNotMatch(target, /secret|s3cret|p%40ss|word|admin:|user/);
  }
  assert.equal(describeMongoTarget(undefined), 'an unrecognised MongoDB URI');
});

test('the implausible-readings cleanup only counts unless told to apply', async () => {
  const updates = [];
  Object.assign(StationData, {
    countDocuments: async () => 3,
    distinct: async () => ['08MF005'],
    updateMany: async (filter, update) => { updates.push(update); return { modifiedCount: 3 }; }
  });
  const log = console.log;
  console.log = () => {};
  try {
    const dryRun = await cleanImplausibleReadings();
    assert.deepEqual(dryRun, { levelCount: 3, dischargeCount: 3, levelsCleared: 0, dischargesCleared: 0 });
    assert.equal(updates.length, 0);

    const applied = await cleanImplausibleReadings({ apply: true });
    assert.equal(applied.levelsCleared, 3);
    assert.deepEqual(updates, [{ $set: { water_level: null } }, { $set: { discharge: null } }]);
  } finally {
    console.log = log;
  }
});

// A stand-in for the driver's Db with just what the storage cleanup calls.
function fakeDb(collections) {
  const calls = [];
  const db = {
    listCollections: () => ({ toArray: async () => Object.keys(collections).map(name => ({ name })) }),
    collection: name => {
      const state = collections[name];
      return {
        indexes: async () => state.indexes.map(index => ({ name: index })),
        findOne: async () => state.timestamped ? { _id: 'reading' } : null,
        aggregate: () => ({ toArray: async () => [{ storageStats: { indexSizes: { date_time_1: 41 * 1024 * 1024 } } }] }),
        estimatedDocumentCount: async () => state.documents || 0,
        dropIndex: async index => { calls.push(`dropIndex ${name}.${index}`); state.indexes = state.indexes.filter(i => i !== index); },
        drop: async () => { calls.push(`drop ${name}`); delete collections[name]; }
      };
    }
  };
  return { db, calls };
}

const productionLayout = () => ({
  stationdatas: { indexes: ['_id_', 'station_id_1_date_time_1', 'timestamp_ttl', 'date_time_1'] },
  stationarchives: { indexes: ['_id_', 'station_id_1_period_1_date_time_1', 'period_1_date_time_1'] },
  stationdatas_archive_daily: { indexes: ['_id_'] },
  uservisits: { indexes: ['_id_'], documents: 6075 }
});

test('the storage cleanup only lists what it would drop unless told to apply', async () => {
  const { dropUnusedStorage } = require('../scripts/dropUnusedStorage');
  const { db, calls } = fakeDb(productionLayout());
  const found = await dropUnusedStorage(db);
  assert.deepEqual(calls, [], 'a dry run writes nothing');
  assert.deepEqual(found.map(item => item.index || item.collection),
    ['timestamp_ttl', 'date_time_1', 'period_1_date_time_1', 'stationdatas_archive_daily', 'uservisits']);
});

test('the storage cleanup drops the unused indexes and collections, keeps the ones in use, and can run again', async () => {
  const { dropUnusedStorage } = require('../scripts/dropUnusedStorage');
  const layout = productionLayout();
  const { db, calls } = fakeDb(layout);
  await dropUnusedStorage(db, { apply: true });
  assert.deepEqual(calls, [
    'dropIndex stationdatas.timestamp_ttl', 'dropIndex stationdatas.date_time_1',
    'dropIndex stationarchives.period_1_date_time_1', 'drop stationdatas_archive_daily', 'drop uservisits'
  ]);
  assert.deepEqual(layout.stationdatas.indexes, ['_id_', 'station_id_1_date_time_1'], 'the indexes in use stay');
  assert.deepEqual(await dropUnusedStorage(db, { apply: true }), [], 'a second run finds nothing');

  // A reading with a timestamp keeps the TTL index; an archive collection with data is kept.
  const guarded = productionLayout();
  guarded.stationdatas.timestamped = true;
  guarded.stationdatas_archive_daily.documents = 3;
  const second = fakeDb(guarded);
  await dropUnusedStorage(second.db, { apply: true });
  assert.equal(second.calls.includes('dropIndex stationdatas.timestamp_ttl'), false);
  assert.equal(second.calls.includes('drop stationdatas_archive_daily'), false);
});
