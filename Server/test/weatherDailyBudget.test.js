// The daily Open-Meteo budget applies even with calls to spare in the hour. Its own file, since the budgets
// are read when the controller loads.
process.env.OPEN_METEO_CALLS_PER_HOUR = '100';
process.env.OPEN_METEO_CALLS_PER_DAY = '2';
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

test('past the daily budget, nothing new is fetched until the day refills', async () => {
  assert.equal((await api.request('/details/weather/08MF005')).status, 200);
  assert.equal((await api.request('/details/weather/hourly/08MF005')).status, 200);
  assert.equal(upstreamCalls, 2, 'the day\'s two calls are used up');

  const overBudget = await api.request('/details/weather/08MC018');
  assert.equal(overBudget.status, 500, 'the hour has room, the day doesn\'t');
  assert.equal(upstreamCalls, 2);

  offset = 13 * 60 * MINUTE; // a little over one call refilled
  assert.equal((await api.request('/details/weather/08MC018')).status, 200);
  assert.equal(upstreamCalls, 3);
});
