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

test('visits are logged once per device per day, and only for real visitor IDs', async () => {
  const UserVisit = require('../models/UserVisits');
  const visits = fakeModel(UserVisit);
  const app = express();
  app.use(express.json());
  app.use('/l', require('../routes/LoggingRoute'));
  const logging = await serve(app);
  try {
    const id = '3b241101-e2bb-4255-8caf-4136c566a962';
    for (let visit = 0; visit < 3; visit++) {
      assert.equal((await logging.request('/l/u', { method: 'POST', body: { userId: id } })).status, 200);
    }
    assert.equal(visits.length, 1);
    assert.equal(visits[0].userId, id);
    assert.match(visits[0].day, /^\d{4}-\d{2}-\d{2}$/);

    for (const userId of [undefined, '', 'not-a-uuid', { $gt: '' }, 'x'.repeat(5000)]) {
      assert.equal((await logging.request('/l/u', { method: 'POST', body: { userId } })).status, 400, JSON.stringify(userId)?.slice(0, 20));
    }
    assert.equal(visits.length, 1);
  } finally {
    await logging.close();
  }
});

test('official records are premium, like History', async () => {
  const response = await api.request('/details/water-records/08MF005');
  assert.equal(response.status, 401);
  assert.equal(response.headers['cache-control'], undefined);
});

test('alerts for a station are public and briefly cacheable', async () => {
  const { resetAlertCache } = require('../utilities/weatherAlerts');
  resetAlertCache();
  const axios = require('axios');
  axios.get = async () => ({ data: { features: [{
    geometry: { type: 'Polygon', coordinates: [[[-122, 49], [-121, 49], [-121, 50], [-122, 50], [-122, 49]]] },
    properties: { alert_name_en: 'rainfall warning', alert_type: 'warning', expiration_datetime: new Date(Date.now() + 3600e3).toISOString(), status_en: 'issued' }
  }] } });
  StationCoordinates.findOne = (filter) => ({ lean: async () => (filter.station_id === '08MF005' ? { latitude: '49.38', longitude: '-121.45' } : null) });
  const response = await api.request('/details/alerts/08MF005');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.alerts.map(alert => alert.name), ['rainfall warning']);
  assert.equal(response.headers['cache-control'], 'public, max-age=300');
  assert.equal((await api.request('/details/alerts/NOPE')).status, 404);
});

test('batch readings can include when silent stations last reported', async () => {
  const StationArchive = require('../models/StationArchive');
  fakeModel(StationArchive, [
    { station_id: '05SEASON', period: 'daily', date_time: new Date('2026-09-30T00:00:00Z') },
    { station_id: '05SEASON', period: 'monthly', date_time: new Date('2026-08-01T00:00:00Z') },
    { station_id: '05PAUSED', period: 'hourly', date_time: new Date('2026-10-18T14:00:00Z') },
    { station_id: '05PAUSED', period: 'hourly', date_time: new Date('2026-10-12T09:00:00Z') },
    { station_id: '05OLDONE', period: 'monthly', date_time: new Date('2024-08-01T00:00:00Z') }
  ]);
  const plain = await api.request('/details/latest-water-data?ids=08MF005,05SEASON');
  assert.deepEqual(Object.keys(plain.body), ['08MF005'], 'unchanged without the option');

  const response = await api.request('/details/latest-water-data?ids=08MF005,05SEASON,05PAUSED,05OLDONE,05NEVER&includeLastReported=true');
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body.readings), ['08MF005']);
  assert.deepEqual(response.body.lastReported, { '05SEASON': '2026-09-30', '05PAUSED': '2026-10-18', '05OLDONE': '2024-08' });
});
