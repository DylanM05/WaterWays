const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitStationName } = require('../utilities/riverNames');
const { formatDate, formatDateTime, formatTime } = require('../utilities/dateFormat');
const { cleanReadings } = require('../utilities/waterQuality');

test('splits station names into the waterbody and the station\'s place on it', () => {
  const cases = {
    'LITTLE QUALICUM RIVER NEAR QUALICUM BEACH': ['LITTLE QUALICUM RIVER', 'NEAR QUALICUM BEACH'],
    'CHURCHILL RIVER 6.15 KMS BELOW LOWER MUSKRAT FALLS': ['CHURCHILL RIVER', '6.15 KMS BELOW LOWER MUSKRAT FALLS'],
    'BURNT LAKE DRAIN NORTHWEST OF LUNDAR': ['BURNT LAKE DRAIN', 'NORTHWEST OF LUNDAR'],
    'SUNDOG CR NR KM 30 CANADIAN ZINC ROAD': ['SUNDOG CR', 'NR KM 30 CANADIAN ZINC ROAD'],
    'RICHELIEU (RIVIERE) A LA MARINA DE SAINT-JEAN': ['RICHELIEU (RIVIERE)', 'A LA MARINA DE SAINT-JEAN'],
    'LAKE OF THE PRAIRIES NEAR TOGO': ['LAKE OF THE PRAIRIES', 'NEAR TOGO'],
    'ADAMS LAKE': ['ADAMS LAKE', '']
  };
  for (const [name, [riverName, section]] of Object.entries(cases)) {
    assert.deepEqual(splitStationName(name), { riverName, section }, name);
  }
});

test('keeps words that also belong to waterbody names', () => {
  assert.equal(splitStationName('COME BY CHANCE RIVER NEAR GOOBIES').riverName, 'COME BY CHANCE RIVER');
  assert.equal(splitStationName('ISLE AUX MORTS RIVER BELOW HIGHWAY BRIDGE').riverName, 'ISLE AUX MORTS RIVER');
  assert.equal(splitStationName('TRIBUTARY TO REID BROOK').riverName, 'TRIBUTARY TO REID BROOK');
  assert.equal(splitStationName('KEARL LAKE OUTLET').riverName, 'KEARL LAKE OUTLET');
});

test('handles missing station names', () => {
  assert.deepEqual(splitStationName(null), { riverName: '', section: '' });
});

test('formats Open-Meteo wall-clock times in the format the apps parse', () => {
  assert.equal(formatDateTime('2026-10-28T15:05'), 'October 28th 2026, 3:05:00 pm');
  assert.equal(formatDateTime('2026-01-01T00:00'), 'January 1st 2026, 12:00:00 am');
  assert.equal(formatDateTime('2026-07-12T12:30'), 'July 12th 2026, 12:30:00 pm');
  assert.equal(formatDate('2026-02-22'), 'February 22nd 2026');
  assert.equal(formatDate('2026-03-23'), 'March 23rd 2026');
  assert.equal(formatDate('2026-05-11'), 'May 11th 2026');
  assert.equal(formatDate('2026-05-13'), 'May 13th 2026');
  assert.equal(formatDate('2026-08-31'), 'August 31st 2026');
  assert.equal(formatTime('2026-06-21T04:07'), '4:07 am');
});

test('keeps the time Open-Meteo sent, even in the hour skipped when clocks spring forward', () => {
  // Parsing this as a Date in a Canadian time zone would turn it into 3:00 am.
  assert.equal(formatDateTime('2026-03-08T02:00'), 'March 8th 2026, 2:00:00 am');
});

test('reports unparseable dates the way Moment did', () => {
  assert.equal(formatDate('not a date'), 'Invalid date');
  assert.equal(formatDateTime(undefined), 'Invalid date');
});

test('removes sentinel values and isolated spikes from readings', () => {
  const start = Date.UTC(2026, 9, 1);
  const readings = Array.from({ length: 30 }, (_, index) => ({
    date_time: new Date(start + index * 5 * 60 * 1000),
    water_level: 3 + index * 0.001,
    discharge: 100
  }));
  readings[10].water_level = 99999; // Environment Canada's missing-value marker
  readings[20].water_level = 9.5; // a one-off glitch
  const cleaned = cleanReadings(readings);
  assert.equal(cleaned.length, 30); // discharge is still valid, so no reading is dropped
  assert.equal(cleaned[10].water_level, null);
  assert.equal(cleaned[20].water_level, null);
  assert.equal(cleaned[15].water_level, readings[15].water_level);
});
