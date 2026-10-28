// The History backfill from Water Office's provisional data (scripts/backfillProvisionalDaily.js).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const StationArchive = require('../models/StationArchive');
const StationData = require('../models/StationData');
const { backfillStation, dailyMeans, parseReadings } = require('../scripts/backfillProvisionalDaily');
const { fakeModel } = require('./helpers');

const HEADER = '﻿ ID,Date,Parameter/Paramètre,Value/Valeur,Qualifier/Qualificatif,Symbol/Symbole,Approval/Approbation,Grade/Classification,Qualifiers/Qualificatifs';

// Five-minute rows for a station between two UTC times, level and discharge, as Water Office sends them.
function csvFor(stationId, start, end) {
  const rows = [HEADER];
  for (let time = start.getTime(); time < end.getTime(); time += 5 * 60 * 1000) {
    const iso = new Date(time).toISOString().replace('.000Z', 'Z');
    rows.push(`${stationId},${iso},46,3.500,,,Provisional/Provisoire,,`);
    rows.push(`${stationId},${iso},47,1200,,,Provisional/Provisoire,,`);
  }
  return rows.join('\n');
}

let archive;
let requestedMonths;

beforeEach(() => {
  archive = fakeModel(StationArchive);
  fakeModel(StationData);
  requestedMonths = [];
  axios.get = async (url) => {
    const query = new URLSearchParams(url.split('?')[1]);
    assert.deepEqual(query.getAll('parameters[]'), ['46', '47']);
    const start = new Date(`${query.get('start_date').replace(' ', 'T')}Z`);
    const end = new Date(`${query.get('end_date').replace(' ', 'T')}Z`);
    requestedMonths.push(start.toISOString().slice(0, 7));
    return { data: csvFor(query.get('stations[]'), start, end) };
  };
});

test('parses level and discharge rows into one reading per time', () => {
  const start = new Date(Date.UTC(2025, 10, 1));
  const readings = parseReadings(csvFor('08MF005', start, new Date(start.getTime() + 15 * 60 * 1000)), start, new Date(start.getTime() + 60 * 60 * 1000));
  assert.equal(readings.length, 3);
  assert.deepEqual(readings[0], { date_time: start, water_level: 3.5, discharge: 1200 });
});

test('ignores rows outside the requested window and rows without a value', () => {
  const start = new Date(Date.UTC(2025, 10, 1));
  const csv = [HEADER, '08MF005,2025-10-31T23:55:00Z,46,3.4,,,,,', '08MF005,2025-11-01T00:00:00Z,46,,,,,,', '08MF005,2025-11-01T00:05:00Z,46,3.5,,,,,'].join('\n');
  const readings = parseReadings(csv, start, new Date(Date.UTC(2025, 10, 2)));
  assert.deepEqual(readings.map(reading => reading.date_time.toISOString()), ['2025-11-01T00:05:00.000Z']);
});

test('rolls readings up into UTC daily means with min, max and sample counts', () => {
  const day = Date.UTC(2025, 10, 1);
  const readings = Array.from({ length: 288 }, (_, index) => ({
    date_time: new Date(day + index * 5 * 60 * 1000),
    water_level: index < 144 ? 3 : 4,
    discharge: 1000
  }));
  const [mean] = dailyMeans(readings);
  assert.deepEqual(mean, {
    date_time: new Date(day),
    water_level: 3.5, water_level_min: 3, water_level_max: 4,
    discharge: 1000, discharge_min: 1000, discharge_max: 1000,
    sample_count: 288
  });
});

test('backfills whole months up to where collected readings begin', async () => {
  const now = new Date();
  const collectedFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 10));
  await StationData.create({ station_id: '08MF005', date_time: collectedFrom });

  const { written } = await backfillStation('08MF005', false);
  assert.equal(requestedMonths.length, 17, 'every whole month in the 18-month window');
  assert.ok(written > 400);
  const last = archive.reduce((latest, day) => (day.date_time > latest ? day.date_time : latest), new Date(0));
  assert.ok(last < collectedFrom, 'stops before collected readings take over');
  assert.ok(archive.every(day => day.period === 'daily' && day.source === 'wateroffice-provisional'));
});

test('a rerun skips months that are already complete', async () => {
  await backfillStation('08MF005', false);
  const count = archive.length;
  requestedMonths.length = 0;
  await backfillStation('08MF005', false);
  assert.equal(archive.length, count);
  assert.ok(requestedMonths.length <= 1, `only the current partial month, got ${requestedMonths.join(', ')}`);
});

test('never replaces a day rolled up from collected readings', async () => {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 15));
  archive.push({ station_id: '08MF005', period: 'daily', date_time: day, water_level: 9.99, source: 'realtime-rollup' });
  await backfillStation('08MF005', false);
  const kept = archive.filter(record => record.date_time.getTime() === day.getTime());
  assert.equal(kept.length, 1);
  assert.equal(kept[0].water_level, 9.99);
});

test('starts after the newest monthly mean from the historical archive', async () => {
  const now = new Date();
  archive.push({ station_id: '08MF005', period: 'monthly', date_time: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)) });
  await backfillStation('08MF005', false);
  assert.equal(requestedMonths.length, 3);
});

test('a dry run fetches but writes nothing', async () => {
  const { days, written } = await backfillStation('08MF005', true);
  assert.ok(days > 400);
  assert.equal(written, 0);
  assert.equal(archive.length, 0);
});

test('stops where hourly figures begin once old readings have been rolled up', async () => {
  const now = new Date();
  const hourlyFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 3));
  archive.push({ station_id: '08MF005', period: 'hourly', date_time: hourlyFrom });
  await StationData.create({ station_id: '08MF005', date_time: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) });
  await backfillStation('08MF005', false);
  const daily = archive.filter(record => record.period === 'daily');
  assert.ok(daily.length > 400);
  assert.ok(daily.every(day => day.date_time < hourlyFrom), 'no provisional days where collected hours exist');
});
