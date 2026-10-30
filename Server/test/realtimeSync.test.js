// The 10-minute sync: one paged query for the whole network, stored for the stations the apps list.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const logger = require('../utilities/logger');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const { runRealtimeSync } = require('../utilities/scheduler');
const { fakeModel } = require('./helpers');

// Keep test runs out of the real log files.
const logged = [];
logger.info = message => logged.push(['info', message]);
logger.error = message => logged.push(['error', message]);

let stored;
let requests;
const now = Date.now();
const feature = (station, minutesAgo) => ({
  properties: { STATION_NUMBER: station, DATETIME: new Date(now - minutesAgo * 60 * 1000).toISOString(), LEVEL: 2.5, DISCHARGE: 40 }
});
// 10,005 readings: two listed stations and one the apps don't list, enough for two pages of 10,000.
const network = [
  ...Array.from({ length: 5000 }, (_, index) => feature('08MF005', index % 72 * 5 + index / 1e6)),
  ...Array.from({ length: 5000 }, (_, index) => feature('05BH004', index % 72 * 5 + index / 1e6)),
  ...Array.from({ length: 5 }, (_, index) => feature('99ZZ999', index * 5))
];

beforeEach(() => {
  logged.length = 0;
  requests = [];
  fakeModel(StationCoordinates, [{ station_id: '08MF005' }, { station_id: '05BH004' }]);
  stored = fakeModel(StationData);
  axios.get = async (url, { params }) => {
    requests.push(params);
    return { data: { features: network.slice(params.offset, params.offset + params.limit) } };
  };
});

test('fetches the whole network in a few pages and stores only listed stations', async () => {
  const result = await runRealtimeSync();
  assert.deepEqual(requests.map(params => params.offset), [0, 10000]);
  assert.equal(requests[0].STATION_NUMBER, undefined, 'not one request per station');
  assert.equal(requests[0].skipGeometry, true);
  assert.equal(result.stations, 2);
  assert.equal(result.readings, 10000);
  assert.ok(stored.every(reading => reading.station_id !== '99ZZ999'));
  const [from, to] = requests[0].datetime.split('/').map(value => Date.parse(value));
  assert.equal(Math.round((to - from) / 3600e3), 6, 'six-hour lookback, so late readings are caught');
});

test('a second run stores nothing new', async () => {
  await runRealtimeSync();
  const count = stored.length;
  const again = await runRealtimeSync();
  assert.equal(again.inserted, 0);
  assert.equal(stored.length, count);
});

test('a failed run is logged, and the next run works', async () => {
  axios.get = async () => { throw new Error('API unavailable'); };
  assert.equal(await runRealtimeSync(), undefined);
  assert.ok(logged.some(([level, message]) => level === 'error' && message.includes('API unavailable')));
  axios.get = async (url, { params }) => ({ data: { features: network.slice(params.offset, params.offset + params.limit) } });
  assert.equal((await runRealtimeSync()).stations, 2);
});
