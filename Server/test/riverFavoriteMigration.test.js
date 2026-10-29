// Renaming saved rivers to the names the river lists use (scripts/migrateRiverFavoriteNames.js).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const Favorite = require('../models/Favorite');
const StationCoordinates = require('../models/StationCoordinates');
const { riverFavoriteId } = require('../controllers/favoritesController');
const { migrateRiverFavorites } = require('../scripts/migrateRiverFavoriteNames');
const { fakeModel } = require('./helpers');

const saved = (id, userId, province, riverName, stations) => ({
  _id: id, userId, province, riverName, favoriteType: 'river', stationId: riverFavoriteId(province, riverName),
  stations: stations.map(([stationId, stationName]) => ({ stationId, stationName }))
});

let favorites;
beforeEach(() => {
  favorites = fakeModel(Favorite, [
    saved(1, 'u1', 'BC', 'LITTLE QUALICUM', [['08HB001', 'LITTLE QUALICUM RIVER NEAR QUALICUM BEACH']]),
    saved(2, 'u1', 'BC', 'FRASER RIVER', [['08MF005', 'FRASER RIVER AT HOPE']]),
    // Saved under the old grouping, before the catalogue renamed this station.
    saved(3, 'u2', 'NL', 'SOUTH RIVER', [['02ZM016', 'SOUTH RIVER NEAR HOLYROOD']]),
    saved(4, 'u3', 'ON', 'LAKE OF', [['02XX001', 'LAKE OF THE WOODS AT HANSON BAY']]),
    saved(5, 'u3', 'ON', 'LAKE OF THE WOODS', [['02XX001', 'LAKE OF THE WOODS AT HANSON BAY']])
  ]);
  fakeModel(StationCoordinates, [
    { station_id: '08HB001', stationName: 'LITTLE QUALICUM RIVER NEAR QUALICUM BEACH' },
    { station_id: '08MF005', stationName: 'FRASER RIVER AT HOPE' },
    { station_id: '02ZM016', stationName: 'MAHERS RIVER NEAR HOLYROOD' }
  ]);
});

test('a dry run lists the renames without changing anything', async () => {
  const before = JSON.stringify(favorites);
  const changes = await migrateRiverFavorites();
  assert.deepEqual(changes.map(change => [change.from, change.to, change.duplicate]), [
    ['LITTLE QUALICUM', 'LITTLE QUALICUM RIVER', false],
    ['SOUTH RIVER', 'MAHERS RIVER', false],
    ['LAKE OF', 'LAKE OF THE WOODS', true]
  ]);
  assert.equal(JSON.stringify(favorites), before);
});

test('applying renames saved rivers, using current station names, and drops duplicates', async () => {
  await migrateRiverFavorites({ apply: true });
  const mahers = favorites.find(favorite => favorite._id === 3);
  assert.equal(mahers.riverName, 'MAHERS RIVER');
  assert.equal(mahers.stationId, riverFavoriteId('NL', 'MAHERS RIVER'));
  assert.deepEqual(mahers.stations[0], { stationId: '02ZM016', stationName: 'MAHERS RIVER NEAR HOLYROOD', section: 'NEAR HOLYROOD' });
  assert.equal(favorites.find(favorite => favorite._id === 1).riverName, 'LITTLE QUALICUM RIVER');
  assert.equal(favorites.find(favorite => favorite._id === 4), undefined, 'old copy removed; the user already had the new one');
  assert.equal(favorites.length, 4);
  assert.deepEqual(await migrateRiverFavorites(), [], 'a second run has nothing to do');
});
