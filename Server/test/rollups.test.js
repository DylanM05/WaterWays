// Five-minute readings to hourly figures to daily figures, and the nightly roll-up that applies them.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const StationData = require('../models/StationData');
const StationArchive = require('../models/StationArchive');
const { dailyFromHourly, hourlyFromReadings, readingsWithHourly } = require('../utilities/rollups');
const { rollupHourlyToDaily, rollupRawToHourly } = require('../utilities/scheduler');
const { fakeModel } = require('./helpers');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 9, 1);

// A day of five-minute readings with a mid-afternoon peak and some missing discharge values.
function dayOfReadings(dayStart = START, stationId = '08MF005') {
  return Array.from({ length: 288 }, (_, index) => {
    const time = dayStart + index * 5 * MINUTE;
    const hour = index / 12;
    return {
      station_id: stationId,
      date_time: new Date(time),
      water_level: Math.round((3 + Math.max(0, 1 - Math.abs(hour - 15) / 3)) * 1000) / 1000,
      discharge: index % 7 === 0 ? null : 1000 + index
    };
  });
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

test('hourly figures keep each hour\'s mean, high, low and reading counts', () => {
  const readings = dayOfReadings();
  const hours = hourlyFromReadings(readings);
  assert.equal(hours.length, 24);
  const peakHour = hours[15];
  assert.deepEqual(peakHour.date_time, new Date(START + 15 * HOUR));
  assert.equal(peakHour.water_level_max, 4);
  assert.equal(peakHour.sample_count, 12);
  const hourReadings = readings.slice(15 * 12, 16 * 12);
  close(peakHour.water_level, mean(hourReadings.map(r => r.water_level)));
  assert.equal(peakHour.discharge_count, hourReadings.filter(r => r.discharge !== null).length);
});

test('a daily figure built from hours equals one built from every reading', () => {
  const readings = dayOfReadings();
  const [day] = dailyFromHourly(hourlyFromReadings(readings));
  close(day.water_level, mean(readings.map(r => r.water_level)));
  close(day.discharge, mean(readings.filter(r => r.discharge !== null).map(r => r.discharge)));
  assert.equal(day.water_level_max, 4);
  assert.equal(day.water_level_min, 3);
  assert.equal(day.sample_count, 288);
});

test('hours with no value for a metric are left out of that metric\'s daily mean', () => {
  const hours = [
    { date_time: new Date(START), water_level: 2, water_level_min: 2, water_level_max: 2, water_level_count: 12, discharge: null, discharge_count: 0, sample_count: 12 },
    { date_time: new Date(START + HOUR), water_level: 4, water_level_min: 3, water_level_max: 5, water_level_count: 4, discharge: 10, discharge_min: 9, discharge_max: 11, discharge_count: 4, sample_count: 4 }
  ];
  const [day] = dailyFromHourly(hours);
  close(day.water_level, (2 * 12 + 4 * 4) / 16);
  assert.equal(day.discharge, 10);
  assert.equal(day.water_level_max, 5);
});

test('charts get hourly figures at the middle of each hour, only where readings are gone', () => {
  const readings = [{ date_time: new Date(START + 2 * HOUR + 5 * MINUTE), water_level: 3, discharge: 1 }];
  const hours = [0, 1, 2].map(hour => ({ date_time: new Date(START + hour * HOUR), water_level: hour, discharge: hour }));
  const series = readingsWithHourly(readings, hours);
  assert.deepEqual(series.map(point => [point.date_time.toISOString().slice(11, 16), point.water_level]), [['00:30', 0], ['01:30', 1], ['02:05', 3]]);
});

let raw;
let archive;
beforeEach(() => {
  raw = fakeModel(StationData);
  archive = fakeModel(StationArchive);
  console.error = () => {};
});

test('the nightly roll-up turns readings past the cutoff into hours and deletes only those readings', async () => {
  raw.push(...dayOfReadings(START), ...dayOfReadings(START + DAY), ...dayOfReadings(START, '05BH004'));
  const cutoff = new Date(START + DAY);
  const result = await rollupRawToHourly(cutoff);
  assert.deepEqual(result, { stations: 2, written: 48 });
  assert.equal(raw.length, 288, 'readings after the cutoff are kept');
  assert.ok(raw.every(reading => reading.date_time >= cutoff));
  assert.ok(archive.every(figure => figure.period === 'hourly' && figure.source === 'realtime-rollup'));
});

test('a spike is removed before it can become an hour\'s high', async () => {
  const readings = dayOfReadings();
  readings[30].water_level = 9.75;
  raw.push(...readings);
  await rollupRawToHourly(new Date(START + DAY));
  assert.ok(archive.every(figure => figure.water_level_max < 9));
});

test('running the roll-up again changes nothing', async () => {
  raw.push(...dayOfReadings());
  await rollupRawToHourly(new Date(START + DAY));
  const before = JSON.stringify(archive);
  raw.push(...dayOfReadings().map(reading => ({ ...reading, water_level: 7 }))); // the same hours fetched again later
  const again = await rollupRawToHourly(new Date(START + DAY));
  assert.equal(again.written, 0);
  assert.equal(JSON.stringify(archive), before);
  assert.equal(raw.length, 0);
});

test('hours past 30 days become daily figures; nearer hours and existing days are kept', async () => {
  raw.push(...dayOfReadings(START), ...dayOfReadings(START + DAY), ...dayOfReadings(START + 2 * DAY));
  await rollupRawToHourly(new Date(START + 3 * DAY));
  archive.push({ station_id: '08MF005', period: 'daily', date_time: new Date(START + DAY), water_level: 9.99, source: 'wateroffice-provisional' });

  const result = await rollupHourlyToDaily(new Date(START + 2 * DAY));
  assert.deepEqual(result, { stations: 1, written: 1 }, 'only the day without a figure is written');
  const days = archive.filter(figure => figure.period === 'daily').sort((a, b) => a.date_time - b.date_time);
  assert.deepEqual(days.map(day => day.source), ['hourly-rollup', 'wateroffice-provisional']);
  close(days[0].water_level, mean(dayOfReadings().map(r => r.water_level)));
  assert.equal(archive.filter(figure => figure.period === 'hourly').length, 24, 'the last day stays hourly');
});

test('the History tab builds days 8–30 from hourly figures', async () => {
  const { getWaterHistory } = require('../controllers/historyController');
  raw.push(...dayOfReadings(START), ...dayOfReadings(START + DAY));
  await rollupRawToHourly(new Date(START + DAY)); // day one is hourly, day two is still raw
  const body = await new Promise(resolve => {
    const res = { status() { return this; }, json: resolve };
    getWaterHistory({ params: { id: '08MF005' }, query: { metric: 'water_level', interval: 'day', from: '2026-10-01', to: '2026-10-02' } }, res);
  });
  assert.deepEqual(body.points.map(point => point.date), ['2026-10-01', '2026-10-02']);
  const expected = Math.round(mean(dayOfReadings().map(r => r.water_level)) * 1000) / 1000;
  assert.equal(body.points[0].average, expected);
  assert.equal(body.points[0].high, 4);
});
