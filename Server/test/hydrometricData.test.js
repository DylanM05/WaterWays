// Real-time data from the government API: parsing, paging, upserts, gap filling, and the water-data endpoint.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const {
  fetchRealtimeData,
  fillRecentGaps,
  normalizeRealtimeFeature,
  syncStationRealtime,
  upsertRealtimeData
} = require('../utilities/hydrometricData');
const { getWaterData } = require('../controllers/detailsController');
const { fakeModel } = require('./helpers');

const HOUR = 60 * 60 * 1000;
const feature = (properties) => ({ properties: { STATION_NUMBER: '08MF005', LEVEL: 3.5, DISCHARGE: 1200, ...properties } });

// Answers API requests from a list of features, honouring limit/offset like the real API.
let requests;
function fakeApi(features) {
  requests = [];
  axios.get = async (url, { params }) => {
    requests.push(params);
    return { data: { features: features.slice(params.offset, params.offset + params.limit) } };
  };
}

let stored;
let archive;
beforeEach(() => {
  stored = fakeModel(StationData);
  archive = fakeModel(StationArchive);
  console.error = () => {};
});

test('parses API features into UTC readings', () => {
  const reading = normalizeRealtimeFeature(feature({ DATETIME: '2026-10-28T15:05:00Z' }));
  assert.deepEqual(reading, {
    station_id: '08MF005',
    date_time: new Date(Date.UTC(2026, 9, 28, 15, 5)),
    water_level: 3.5,
    discharge: 1200
  });
});

test('drops sentinel values and features without a station or time', () => {
  assert.equal(normalizeRealtimeFeature(feature({ DATETIME: '2026-10-28T15:05:00Z', LEVEL: 99999 })).water_level, null);
  assert.equal(normalizeRealtimeFeature(feature({ DATETIME: '2026-10-28T15:05:00Z', DISCHARGE: 'n/a' })).discharge, null);
  assert.equal(normalizeRealtimeFeature(feature({ DATETIME: 'not a date' })), null);
  assert.equal(normalizeRealtimeFeature(feature({ DATETIME: '2026-10-28T15:05:00Z', STATION_NUMBER: '' })), null);
  assert.equal(normalizeRealtimeFeature(null), null);
});

test('follows pages until the API returns a short one', async () => {
  const start = Date.UTC(2026, 9, 1);
  fakeApi(Array.from({ length: 2003 }, (_, index) => feature({ DATETIME: new Date(start + index * 5 * 60 * 1000).toISOString() })));
  const records = await fetchRealtimeData('08MF005', new Date(start), new Date(start + 30 * 24 * HOUR));
  assert.equal(records.length, 2003);
  assert.deepEqual(requests.map(params => params.offset), [0, 1000, 2000]);
  assert.equal(requests[0].datetime, '2026-10-01T00:00:00.000Z/2026-10-31T00:00:00.000Z');
  assert.equal(requests[0].STATION_NUMBER, '08MF005');
});

test('storing the same readings twice does not duplicate them', async () => {
  const reading = { station_id: '08MF005', date_time: new Date(Date.UTC(2026, 9, 28, 15)), water_level: 3.5, discharge: 1200 };
  assert.deepEqual(await upsertRealtimeData([reading]), { inserted: 1, modified: 0 });
  // A corrected value for the same time updates the stored reading.
  assert.deepEqual(await upsertRealtimeData([{ ...reading, water_level: 3.6 }]), { inserted: 0, modified: 1 });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].water_level, 3.6);
  assert.deepEqual(await upsertRealtimeData([]), { inserted: 0, modified: 0 });
});

test('a sync fetches the lookback window and stores what it finds', async () => {
  const end = new Date(Date.UTC(2026, 9, 28, 12));
  fakeApi([feature({ DATETIME: '2026-10-28T11:00:00Z' }), feature({ DATETIME: '2026-10-28T11:05:00Z' })]);
  const result = await syncStationRealtime('08MF005', 6, end);
  assert.equal(requests[0].datetime, '2026-10-28T06:00:00.000Z/2026-10-28T12:00:00.000Z');
  assert.equal(result.inserted, 2);
  assert.equal(stored.length, 2);
});

test('gap filling only requests the missing stretches', async () => {
  const end = new Date(Date.UTC(2026, 9, 28));
  const start = new Date(end.getTime() - 24 * HOUR);
  // Readings every 5 minutes except for a 6-hour hole in the middle.
  for (let time = start.getTime(); time <= end.getTime(); time += 5 * 60 * 1000) {
    if (time > start.getTime() + 9 * HOUR && time < start.getTime() + 15 * HOUR) continue;
    stored.push({ station_id: '08MF005', date_time: new Date(time) });
  }
  fakeApi([]);
  const result = await fillRecentGaps('08MF005', 24, end);
  assert.equal(result.gaps.length, 1);
  assert.equal(requests.length, 1);
  const [from, to] = requests[0].datetime.split('/').map(value => new Date(value).getTime());
  assert.ok(from >= start.getTime() + 8 * HOUR && to <= start.getTime() + 16 * HOUR);
});

test('many gaps become one request across them, and a dry run requests nothing', async () => {
  const end = new Date(Date.UTC(2026, 9, 28));
  for (let hour = 0; hour < 48; hour += 4) stored.push({ station_id: '08MF005', date_time: new Date(end.getTime() - hour * HOUR) });
  fakeApi([]);
  assert.equal((await fillRecentGaps('08MF005', 48, end, { dryRun: true })).gaps.length > 5, true);
  assert.equal(requests.length, 0);
  await fillRecentGaps('08MF005', 48, end);
  assert.equal(requests.length, 1);
});

function callWaterData(stationId, days) {
  return new Promise(resolve => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      type() { return this; },
      json(body) { resolve({ status: this.statusCode, body }); },
      send(text) { resolve({ status: this.statusCode, body: JSON.parse(text) }); }
    };
    getWaterData({ params: { id: stationId, days: String(days) } }, res);
  });
}

test('water data is served from the database when it covers the range', async () => {
  const now = Date.now();
  for (let minutes = 0; minutes <= 24 * 60; minutes += 5) {
    stored.push({ station_id: 'COVERED1', date_time: new Date(now - minutes * 60 * 1000), water_level: 2, discharge: 50 });
  }
  fakeApi([]);
  const response = await callWaterData('COVERED1', 1);
  assert.equal(response.status, 200);
  assert.equal(requests.length, 0);
  assert.ok(response.body.length > 280);
  assert.match(response.body[0].date_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(response.body[0].date_time < response.body.at(-1).date_time, 'oldest first');
});

test('missing history is fetched from the API once, then not retried for hours', async () => {
  const now = Date.now();
  fakeApi(Array.from({ length: 300 }, (_, index) => feature({
    STATION_NUMBER: 'MISSING1',
    DATETIME: new Date(now - (300 - index) * 5 * 60 * 1000).toISOString()
  })));
  const first = await callWaterData('MISSING1', 1);
  assert.equal(requests.length, 1);
  assert.ok(first.body.length > 0);

  // The fetched readings are stored in the background.
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(stored.some(reading => reading.station_id === 'MISSING1'));

  stored.length = 0;
  await callWaterData('MISSING1', 7); // a different range, so not served from the response cache
  assert.equal(requests.length, 1, 'no second API request within the cooldown');
});

test('a repeat request within two minutes is served from the response cache', async () => {
  stored.push({ station_id: 'CACHED1', date_time: new Date(), water_level: 1, discharge: 10 });
  fakeApi([]);
  await callWaterData('CACHED1', 1);
  const findsBefore = StationData.find;
  let databaseQueries = 0;
  StationData.find = (...args) => { databaseQueries++; return findsBefore(...args); };
  await callWaterData('CACHED1', 1);
  StationData.find = findsBefore;
  assert.equal(databaseQueries, 0);
});

test('the requested range is clamped to 1–30 days', async () => {
  fakeApi([]);
  const response = await callWaterData('CLAMP1', 365);
  assert.equal(response.status, 200);
  const [from, to] = requests[0].datetime.split('/').map(value => new Date(value).getTime());
  assert.equal(Math.round((to - from) / (24 * HOUR)), 30);
});

test('a 30-day chart uses five-minute readings for the last week and hourly figures before that', async () => {
  const now = Date.now();
  const hourStart = time => Math.floor(time / HOUR) * HOUR;
  for (let minutes = 0; minutes <= 7 * 24 * 60; minutes += 5) {
    stored.push({ station_id: 'TIERED1', date_time: new Date(now - minutes * 60 * 1000), water_level: 2, discharge: 50 });
  }
  for (let hour = hourStart(now - 30 * 24 * HOUR); hour < now - 7 * 24 * HOUR; hour += HOUR) {
    archive.push({
      station_id: 'TIERED1', period: 'hourly', date_time: new Date(hour),
      water_level: 1.5, water_level_min: 1.2, water_level_max: 1.9, discharge: 40, discharge_min: 35, discharge_max: 48
    });
  }
  fakeApi([]);
  const response = await callWaterData('TIERED1', 30);
  assert.equal(requests.length, 0, 'the stored tiers cover the range, so the API is not asked');
  const levels = response.body.map(reading => reading.water_level);
  assert.ok(levels.includes(1.5) && levels.includes(2));
  const times = response.body.map(reading => reading.date_time);
  assert.deepEqual(times, [...times].sort(), 'one time-ordered series');
  const hourlyRow = response.body.find(reading => reading.water_level === 1.5);
  assert.deepEqual([hourlyRow.water_level_min, hourlyRow.water_level_max, hourlyRow.discharge_min, hourlyRow.discharge_max], [1.2, 1.9, 35, 48]);
  assert.ok(!('water_level_min' in response.body.at(-1)), 'five-minute rows are unchanged');
  const hourlyCount = levels.filter(level => level === 1.5).length;
  assert.ok(hourlyCount >= 23 * 24 - 2 && hourlyCount <= 23 * 24 + 2, `about 23 days of hours, got ${hourlyCount}`);
});
