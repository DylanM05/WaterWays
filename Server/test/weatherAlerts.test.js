// Environment Canada weather alerts matched to stations (utilities/weatherAlerts.js, /details/alerts/:id).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { activeAlertFeatures, alertsAt, containsPoint, resetAlertCache } = require('../utilities/weatherAlerts');

const square = (west, south, east, north) => [[west, south], [east, south], [east, north], [west, north], [west, south]];
const NOW = Date.parse('2026-10-28T20:00:00Z');
const alert = (name, type, geometry, extra = {}) => ({
  geometry,
  properties: {
    alert_code: name.toUpperCase().slice(0, 3), alert_name_en: name, alert_type: type,
    publication_datetime: '2026-10-28T18:00:00Z', expiration_datetime: '2026-10-29T06:00:00Z',
    status_en: 'issued', feature_name_en: 'Fraser Canyon', alert_text_en: `${name} text`, ...extra
  }
});
const around = { type: 'Polygon', coordinates: [square(-122, 49, -121, 50)] };

test('finds whether a station is inside an alert area, honouring holes and multi-part areas', () => {
  const withHole = { type: 'Polygon', coordinates: [square(-122, 49, -121, 50), square(-121.6, 49.2, -121.4, 49.6)] };
  const twoParts = { type: 'MultiPolygon', coordinates: [[square(-130, 60, -129, 61)], [square(-122, 49, -121, 50)]] };
  assert.equal(containsPoint(around, -121.45, 49.38), true);
  assert.equal(containsPoint(around, -120.5, 49.38), false);
  assert.equal(containsPoint(withHole, -121.5, 49.4), false, 'inside the hole');
  assert.equal(containsPoint(withHole, -121.9, 49.4), true);
  assert.equal(containsPoint(twoParts, -121.45, 49.38), true);
  assert.equal(containsPoint(null, -121.45, 49.38), false);
});

test('lists alerts in effect at the station, warnings first, without expired or ended ones', () => {
  const features = [
    alert('special weather statement', 'statement', around),
    alert('rainfall warning', 'warning', around),
    alert('rainfall warning', 'warning', { type: 'Polygon', coordinates: [square(-121.5, 49, -121, 49.5)] }), // overlapping area of the same alert
    alert('wind warning', 'warning', around, { expiration_datetime: '2026-10-28T19:00:00Z' }),
    alert('snowfall warning', 'warning', around, { status_en: 'ended' }),
    alert('frost advisory', 'advisory', { type: 'Polygon', coordinates: [square(-100, 49, -99, 50)] })
  ];
  const alerts = alertsAt(features, -121.45, 49.38, NOW);
  assert.deepEqual(alerts.map(a => a.name), ['rainfall warning', 'special weather statement']);
  assert.deepEqual(alerts[0], {
    type: 'warning', name: 'rainfall warning', colour: null, area: 'Fraser Canyon',
    issued: '2026-10-28T18:00:00Z', expires: '2026-10-29T06:00:00Z', eventEnds: null, text: 'rainfall warning text'
  });
});

let requests;
beforeEach(() => {
  resetAlertCache();
  requests = 0;
  console.error = () => {};
});

test('fetches the national list once per five minutes, sharing a request in flight', async () => {
  axios.get = async () => { requests++; return { data: { features: [alert('rainfall warning', 'warning', around)] } }; };
  const [first, second] = await Promise.all([activeAlertFeatures(NOW), activeAlertFeatures(NOW)]);
  assert.equal(requests, 1);
  assert.equal(first, second);
  await activeAlertFeatures(Date.now() + 60 * 1000);
  assert.equal(requests, 1, 'still fresh a minute later');
  await activeAlertFeatures(Date.now() + 6 * 60 * 1000);
  assert.equal(requests, 2);
});

test('keeps the last list if a refresh fails, and fails only when it has none', async () => {
  axios.get = async () => { throw new Error('timeout'); };
  await assert.rejects(activeAlertFeatures(NOW));
  axios.get = async () => ({ data: { features: [alert('rainfall warning', 'warning', around)] } });
  await activeAlertFeatures(NOW);
  axios.get = async () => { throw new Error('timeout'); };
  const stale = await activeAlertFeatures(Date.now() + 10 * 60 * 1000);
  assert.equal(stale.length, 1);
});
