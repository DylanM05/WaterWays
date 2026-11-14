// Open-Meteo calls are budgeted for the whole server; past the budget, or after a failure, the last forecast
// is served instead of calling out. Its own file, since the budget is read when the controller loads.
process.env.OPEN_METEO_CALLS_PER_HOUR = '2';
process.env.OPEN_METEO_API_KEY = 'test-open-meteo-key';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const axios = require('axios');
const StationCoordinates = require('../models/StationCoordinates');
const { fakeModel, serve } = require('./helpers');

const MINUTE = 60 * 1000;
const realNow = Date.now;
let offset = 0;
let api;
let upstreamCalls = 0;
let upstreamFails = false;
const logged = [];

const forecast = temperature => ({
  current: { temperature_2m: temperature, weather_code: 0, wind_direction_10m: 90, time: '2026-11-13T12:00' },
  hourly: { time: ['2026-11-13T12:00'], temperature_2m: [temperature] }
});

before(async () => {
  console.error = (...args) => { logged.push(args.join(' ')); };
  Date.now = () => realNow() + offset;
  fakeModel(StationCoordinates, [
    { station_id: '08MF005', latitude: '49.38', longitude: '-121.45' },
    { station_id: '08MC018', latitude: '52.53', longitude: '-122.45' }
  ]);
  axios.get = async (url, config) => {
    upstreamCalls++;
    if (upstreamFails) {
      const error = new Error('Request failed with status code 429');
      error.config = config;
      error.response = { status: 429 };
      throw error;
    }
    return { data: forecast(upstreamCalls) };
  };
  const app = express();
  app.use('/details', require('../routes/DetailsRoute'));
  api = await serve(app);
});

after(async () => {
  Date.now = realNow;
  await api.close();
});

test('past the budget, the last forecast is served without calling Open-Meteo', async () => {
  assert.equal((await api.request('/details/weather/08MF005')).body.temperature, 1);
  assert.equal((await api.request('/details/weather/08MC018')).body.temperature, 2);
  assert.equal(upstreamCalls, 2, 'the budget of two is used up');

  // Past the 15 fresh minutes, with less than one call refilled.
  offset = 16 * MINUTE;
  const stale = await api.request('/details/weather/08MF005');
  assert.equal(stale.status, 200);
  assert.equal(stale.body.temperature, 1, 'the previous forecast');
  assert.equal(upstreamCalls, 2);

  // Nothing to fall back on: the usual error.
  const missing = await api.request('/details/weather/weekly/08MC018');
  assert.equal(missing.status, 500);
  assert.equal(missing.body.error, 'Error fetching weekly weather forecast');
  assert.equal(upstreamCalls, 2);
});

test('a failed call serves the last forecast, isn\'t retried straight away, and never logs the API key', async () => {
  offset = 2 * 60 * MINUTE; // the budget is full again
  upstreamFails = true;
  const failed = await api.request('/details/weather/08MF005');
  assert.equal(failed.status, 200);
  assert.equal(failed.body.temperature, 1, 'the previous forecast');
  assert.equal(upstreamCalls, 3);

  // Budget is left, but the failure is remembered for a minute.
  offset += 10 * 1000;
  assert.equal((await api.request('/details/weather/08MF005')).body.temperature, 1);
  assert.equal(upstreamCalls, 3);

  const noForecast = await api.request('/details/weather/hourly/08MC018');
  assert.equal(noForecast.status, 500);
  assert.equal(upstreamCalls, 4);

  assert.ok(logged.length >= 2);
  assert.ok(logged.every(line => !line.includes('test-open-meteo-key')), 'no API key in the logs');
  assert.ok(logged.some(line => line.includes('status 429')));

  // Once the failure has passed and the budget has refilled, Open-Meteo is tried again.
  upstreamFails = false;
  offset += 60 * MINUTE;
  assert.equal((await api.request('/details/weather/08MF005')).body.temperature, 5);
});
