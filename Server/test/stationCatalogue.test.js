// Comparing our station list with Environment Canada's catalogue (scripts/syncStationCatalogue.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const StationCoordinates = require('../models/StationCoordinates');
const axios = require('axios');
const { addStations, applyCorrections, compareWithCatalogue, distanceKm, fetchReportingStations, removeDiscontinued, stationsToAdd } = require('../scripts/syncStationCatalogue');
const { fakeModel } = require('./helpers');

const feature = (stationId, name, latitude, longitude, { status = 'Active', realtime = 1, province = 'AB' } = {}) => ({
  properties: { STATION_NUMBER: stationId, STATION_NAME: name, STATUS_EN: status, REAL_TIME: realtime, PROV_TERR_STATE_LOC: province },
  geometry: { coordinates: [longitude, latitude] }
});
const station = (stationId, stationName, latitude, longitude) => ({
  _id: `id-${stationId}`, station_id: stationId, stationName, province: 'AB', latitude: String(latitude), longitude: String(longitude)
});

const stations = [
  station('07DA044', 'STEEPBANK RIVER BELOW NORTH STEEPBANK RIVER', 56.867222, -11.306389), // missing a digit
  station('05BH004', 'BOW RIVER AT CALGARY', 51.05, -114.05),
  station('02ZM016', 'SOUTH RIVER NEAR HOLYROOD', 47.38, -53.14),
  station('10CA001', 'FONTAS RIVER NEAR THE MOUTH', 58.29, -121.75),
  station('07FA008', 'CAMERON RIVER AT UPPER HALFWAY ROAD', 56.1, -122.2)
];
const catalogue = [
  feature('07DA044', 'STEEPBANK RIVER BELOW NORTH STEEPBANK RIVER', 56.86738, -111.13975),
  feature('05BH004', 'BOW RIVER AT CALGARY', 51.0502, -114.0501),
  feature('02ZM016', 'MAHERS RIVER NEAR HOLYROOD', 47.38, -53.14),
  feature('10CA001', 'FONTAS RIVER NEAR THE MOUTH', 58.29, -121.75, { status: 'Discontinued', realtime: 0 }),
  feature('05AA999', 'NEW CREEK NEAR SOMEWHERE', 49.5, -114.5),
  feature('05AA998', 'OLD CREEK NEAR NOWHERE', 49.6, -114.6, { status: 'Discontinued', realtime: 0 })
];

test('measures distances on the globe', () => {
  assert.ok(Math.abs(distanceKm(49.28, -123.12, 51.05, -114.07) - 675) < 10); // Vancouver to Calgary
  assert.equal(distanceKm(51, -114, 51, -114), 0);
});

test('finds misplaced, renamed, discontinued, uncatalogued and unlisted stations', () => {
  const findings = compareWithCatalogue(stations, catalogue);
  assert.deepEqual(findings.moved.map(({ station: { station_id } }) => station_id), ['07DA044']);
  assert.ok(findings.moved[0].distance > 5000);
  assert.deepEqual(findings.renamed.map(({ station: { station_id }, name }) => [station_id, name]), [['02ZM016', 'MAHERS RIVER NEAR HOLYROOD']]);
  assert.deepEqual(findings.discontinued.map(({ station: { station_id } }) => station_id), ['10CA001']);
  assert.deepEqual(findings.notInCatalogue.map(({ station_id }) => station_id), ['07FA008']);
  assert.deepEqual(findings.notListed.map(({ stationId }) => stationId), ['05AA999']);
});

test('a few metres of difference is not reported as a move', () => {
  const findings = compareWithCatalogue([stations[1]], [catalogue[1]]);
  assert.equal(findings.moved.length, 0);
});

test('applying corrects names and coordinates without adding or removing stations', async () => {
  const stored = fakeModel(StationCoordinates, stations);
  const updated = await applyCorrections(compareWithCatalogue(stored, catalogue));
  assert.equal(updated, 4, 'every catalogued station gets its real-time flag recorded');
  assert.equal(stored.length, stations.length);
  const steepbank = stored.find(record => record.station_id === '07DA044');
  assert.deepEqual([steepbank.latitude, steepbank.longitude], ['56.86738', '-111.13975']);
  assert.equal(stored.find(record => record.station_id === '02ZM016').stationName, 'MAHERS RIVER NEAR HOLYROOD');
  assert.equal(stored.find(record => record.station_id === '05BH004').latitude, '51.05');
});

test('records which stations have a real-time feed, and only rewrites flags that changed', async () => {
  const stored = fakeModel(StationCoordinates, stations);
  await applyCorrections(compareWithCatalogue(stored, catalogue));
  const fontas = stored.find(record => record.station_id === '10CA001');
  assert.deepEqual([fontas.realtime, fontas.catalogueStatus], [false, 'Discontinued']);
  const bow = stored.find(record => record.station_id === '05BH004');
  assert.deepEqual([bow.realtime, bow.catalogueStatus], [true, 'Active']);
  assert.equal(stored.find(record => record.station_id === '07FA008').realtime, undefined, 'uncatalogued stations are left alone');
  assert.equal(compareWithCatalogue(stored, catalogue).flags.length, 0, 'a second run has nothing to change');
});

test('adds only unlisted stations that are reporting now and are in Canada', async () => {
  const withBorderStation = [...catalogue,
    feature('05AA997', 'MILK RIVER AT EASTERN CROSSING', 49.0, -110.2, { province: 'MT' }),
    feature('05AA996', 'QUIET CREEK NEAR NOWHERE', 49.7, -114.7)];
  const findings = compareWithCatalogue(stations, withBorderStation);
  const reporting = new Set(['05AA999', '05AA997', '08MF005']);
  const additions = stationsToAdd(findings, reporting);
  assert.deepEqual(additions, [{
    stationName: 'NEW CREEK NEAR SOMEWHERE', station_id: '05AA999', province: 'AB',
    latitude: '49.5', longitude: '-114.5', realtime: true, catalogueStatus: 'Active'
  }]);
  const stored = fakeModel(StationCoordinates, stations);
  assert.equal(await addStations(additions), 1);
  assert.equal(stored.length, stations.length + 1);
  assert.equal(compareWithCatalogue(stored, withBorderStation).notListed.some(({ stationId }) => stationId === '05AA999'), false);
});

test('removes discontinued stations and nothing else', async () => {
  const stored = fakeModel(StationCoordinates, stations);
  assert.equal(await removeDiscontinued(compareWithCatalogue(stored, catalogue)), 1);
  assert.deepEqual(stored.map(station => station.station_id).sort(), ['02ZM016', '05BH004', '07DA044', '07FA008']);
});

test('collects reporting stations across pages of the real-time API', async () => {
  const pages = [
    Array.from({ length: 10000 }, (_, index) => ({ properties: { STATION_NUMBER: `S${index % 2500}` } })),
    [{ properties: { STATION_NUMBER: 'S9999' } }]
  ];
  const offsets = [];
  axios.get = async (url, { params }) => {
    offsets.push(params.offset);
    assert.match(params.datetime, /Z\/.+Z$/);
    return { data: { features: pages[offsets.length - 1] } };
  };
  const reporting = await fetchReportingStations(3, new Date('2026-10-28T12:00:00Z'));
  assert.deepEqual(offsets, [0, 10000]);
  assert.equal(reporting.size, 2501);
});
