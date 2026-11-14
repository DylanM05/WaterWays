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
