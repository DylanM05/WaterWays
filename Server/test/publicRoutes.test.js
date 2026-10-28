// Public data routes: cache headers, search and batch readings, with the database replaced by fakes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const StationCoordinates = require('../models/StationCoordinates');
const StationData = require('../models/StationData');
const { cacheFor } = require('../middleware/cacheControl');
const { fakeModel, serve } = require('./helpers');

let api;

before(async () => {
  console.error = () => {};
  fakeModel(StationCoordinates, [
    { stationName: 'FRASER RIVER AT HOPE', station_id: '08MF005', province: 'BC' },
    { stationName: 'FRASER RIVER NEAR MARGUERITE', station_id: '08MC018', province: 'BC' },
    { stationName: 'RED RIVER AT EMERSON', station_id: '05OC001', province: 'MB' },
    { stationName: 'RED RIVER NEAR NORTH BAY', station_id: '02DD999', province: 'ON' }
  ]);
  const now = Date.now();
  // Stored out of order, rising 1 cm every 5 minutes; the latest reading is 3.61 m.
  fakeModel(StationData, Array.from({ length: 12 }, (_, index) => ({
    station_id: '08MF005',
    date_time: new Date(now - (11 - index) * 5 * 60 * 1000),
    water_level: Math.round((3.5 + index * 0.01) * 100) / 100,
    discharge: 1200
  })).reverse());

  const app = express();
  app.get('/ok', cacheFor(60), (req, res) => res.json({ ok: true }));
  app.get('/missing', cacheFor(60), (req, res) => res.status(404).json({ error: 'not found' }));
  app.get('/broken', cacheFor(60), (req, res) => res.status(500).json({ error: 'failed' }));
  app.use('/details', require('../routes/DetailsRoute'));
  app.use('/search', require('../routes/SearchRoute'));
  api = await serve(app);
});

after(() => api.close());

test('successful public responses are cacheable; errors are not', async () => {
  assert.equal((await api.request('/ok')).headers['cache-control'], 'public, max-age=60');
  assert.equal((await api.request('/missing')).headers['cache-control'], undefined);
  assert.equal((await api.request('/broken')).headers['cache-control'], undefined);
});

test('a revalidated response keeps its cache header', async () => {
  const first = await api.request('/ok');
  const second = await api.request('/ok', { headers: { 'If-None-Match': first.headers.etag } });
  assert.equal(second.status, 304);
  assert.equal(second.headers['cache-control'], 'public, max-age=60');
});

test('premium history is never publicly cacheable', async () => {
  const response = await api.request('/details/water-history/08MF005');
  assert.equal(response.status, 401);
  assert.equal(response.headers['cache-control'], undefined);
});

test('search groups stations by river, keeping same-named rivers in different provinces apart', async () => {
  const fraser = await api.request('/search/search-all-rivers?query=fraser');
  assert.deepEqual(fraser.body, [{ stationName: 'FRASER RIVER', station_id: '08MF005', province: 'BC' }]);
  const red = await api.request('/search/search-all-rivers?query=red%20river');
  assert.deepEqual(red.body.map(result => result.province).sort(), ['MB', 'ON']);
});

test('search treats regular-expression characters as plain text', async () => {
  const response = await api.request(`/search/search-all-rivers?query=${encodeURIComponent('(a+)+$')}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
});

test('search answers 400 without a query and an empty list for a blank one', async () => {
  assert.equal((await api.request('/search/search-all-rivers')).status, 400);
  assert.deepEqual((await api.request('/search/search-all-rivers?query=%20%20')).body, []);
});

test('river lists use the same river names as search', async () => {
  const response = await api.request('/details/rivers/bc');
  assert.deepEqual(Object.keys(response.body), ['FRASER RIVER']);
  assert.deepEqual(response.body['FRASER RIVER'].map(station => station.section).sort(), ['AT HOPE', 'NEAR MARGUERITE']);
});

test('batch readings return one entry per station that has data', async () => {
  const response = await api.request('/details/latest-water-data?ids=08MF005,08MC018,08MF005');
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body), ['08MF005']);
  assert.equal(response.body['08MF005'].water_level, 3.61);
  assert.match(response.body['08MF005'].date_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(response.headers['cache-control'], 'public, max-age=300');
});

test('batch readings reject empty and oversized requests', async () => {
  assert.equal((await api.request('/details/latest-water-data')).status, 400);
  const ids = Array.from({ length: 101 }, (_, index) => `S${index}`).join(',');
  assert.equal((await api.request(`/details/latest-water-data?ids=${ids}`)).status, 400);
});
