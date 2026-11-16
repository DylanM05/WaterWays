// Saving stations and rivers: requests the apps send are accepted; junk and runaway lists are turned away.
const { bearer, clerkTestTokens, fakeModel, serve } = require('./helpers');

const sessionToken = clerkTestTokens();

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Favorite = require('../models/Favorite');
const { MAX_FAVORITES_PER_USER } = require('../controllers/favoritesController');

const as = user => bearer(sessionToken({ sub: user }));
const post = (path, body, user = 'user_one') => api.request(path, { method: 'POST', headers: as(user), body });

// What the web app and iOS app send for a river (riverSections.jsx, APIClient.addRiverFavorite).
const river = (overrides = {}) => ({
  riverName: 'FRASER RIVER',
  province: 'BC',
  stations: [
    { stationId: '08MF005', stationName: 'FRASER RIVER AT HOPE', province: 'BC', latitude: '49.386', longitude: '-121.454', section: 'AT HOPE' },
    { stationId: '08MH024', stationName: 'FRASER RIVER AT MISSION', province: 'BC', latitude: null, longitude: null, section: null }
  ],
  ...overrides
});

let api;
let favorites;

before(async () => {
  console.error = () => {};
  const app = express();
  app.use(express.json());
  app.use('/u/favorites', require('../routes/favoritesRoutes'));
  api = await serve(app);
});

after(() => api.close());

beforeEach(() => {
  favorites = fakeModel(Favorite);
});

test('stations save as the apps send them, including the web app\'s Unknown province', async () => {
  const saved = await post('/u/favorites', { stationId: '08MF005', stationName: 'FRASER RIVER AT HOPE', province: 'BC' });
  assert.equal(saved.status, 201);
  const unknown = await post('/u/favorites', { stationId: '08MH024', stationName: 'Station 08MH024', province: 'Unknown' });
  assert.equal(unknown.status, 201);
  assert.deepEqual(favorites.map(favorite => [favorite.stationId, favorite.province]), [['08MF005', 'BC'], ['08MH024', 'Unknown']]);
});

test('station favourites with a bad ID, name or province are rejected', async () => {
  for (const body of [
    { stationId: 'river:abc' },
    { stationId: '08MF005; drop' },
    { stationId: 'X'.repeat(500) },
    { stationId: '08MF005', stationName: 'A'.repeat(201) },
    { stationId: '08MF005', province: 'Atlantis' }
  ]) {
    assert.equal((await post('/u/favorites', body)).status, 400, JSON.stringify(body).slice(0, 60));
  }
  assert.equal(favorites.length, 0);
});

test('rivers save as the apps send them', async () => {
  const saved = await post('/u/favorites/rivers', river());
  assert.equal(saved.status, 201);
  assert.deepEqual(favorites[0].stations.map(station => station.stationId), ['08MF005', '08MH024']);
});

test('river favourites with long strings or a bad province are rejected', async () => {
  assert.equal((await post('/u/favorites/rivers', river({ riverName: 'R'.repeat(201) }))).status, 400);
  assert.equal((await post('/u/favorites/rivers', river({ province: 'XX' }))).status, 400);
  const longName = river();
  longName.stations[1].stationName = 'N'.repeat(5000);
  assert.equal((await post('/u/favorites/rivers', longName)).status, 400);
  const longCoordinate = river();
  longCoordinate.stations[0].latitude = '4'.repeat(100);
  assert.equal((await post('/u/favorites/rivers', longCoordinate)).status, 400);
  const tooMany = river({ stations: Array.from({ length: 501 }, (_, index) => ({ stationId: `08MF${String(index).padStart(3, '0')}` })) });
  assert.equal((await post('/u/favorites/rivers', tooMany)).status, 400);
  assert.equal(favorites.length, 0);
});

test('a river drops entries that are not station IDs', async () => {
  const body = river();
  body.stations.push({ stationId: '<script>' }, { stationId: 42 });
  assert.equal((await post('/u/favorites/rivers', body)).status, 201);
  assert.equal(favorites[0].stations.length, 2);
});

test('each user can save up to the cap; re-saving an existing favourite still works', async () => {
  for (let index = 0; index < MAX_FAVORITES_PER_USER; index++) {
    favorites.push({ userId: 'user_one', stationId: `08AA${String(index).padStart(3, '0')}`, favoriteType: 'station' });
  }
  const station = await post('/u/favorites', { stationId: '08MF005', province: 'BC' });
  assert.equal(station.status, 409);
  assert.match(station.body.error, /up to 200 favourites/);
  assert.equal((await post('/u/favorites/rivers', river())).status, 409);
  assert.equal((await post('/u/favorites', { stationId: '08AA000', province: 'BC' })).status, 201);
  assert.equal((await post('/u/favorites', { stationId: '08MF005', province: 'BC' }, 'user_two')).status, 201);
  assert.equal(favorites.length, MAX_FAVORITES_PER_USER + 1);
});

test('a station saved from a lower-case address can be checked and removed the same way', async () => {
  assert.equal((await post('/u/favorites', { stationId: '08mf005', stationName: 'FRASER RIVER AT HOPE', province: 'BC' })).status, 201);
  assert.equal(favorites[0].stationId, '08MF005');
  const check = await api.request('/u/favorites/check/08mf005', { headers: as('user_one') });
  assert.equal(check.body.isFavorite, true);
  assert.equal((await api.request('/u/favorites/08mf005', { method: 'DELETE', headers: as('user_one') })).status, 200);
  assert.equal(favorites.length, 0);
});

test('an older favourite stored with an odd id can still be removed', async () => {
  favorites.push({ userId: 'user_one', stationId: 'legacy-id', stationName: 'Old' });
  assert.equal((await api.request('/u/favorites/legacy-id', { method: 'DELETE', headers: as('user_one') })).status, 200);
  assert.equal(favorites.length, 0);
});
