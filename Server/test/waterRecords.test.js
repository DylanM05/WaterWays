// Official record highs and lows from Environment Canada's annual peaks (/details/water-records/:id).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { getWaterRecords, summarizeAnnualPeaks } = require('../controllers/historyController');

const peak = (type, kind, value, date) => ({
  properties: { DATA_TYPE_EN: type, PEAK_CODE_EN: kind, PEAK: value, DATE: `${date}T02:00` }
});
const features = [
  peak('Water Level', 'Maximum', 9.952, '1950-06-20'),
  peak('Water Level', 'Maximum', 10.162, '1972-06-16'),
  peak('Water Level', 'Maximum', 8.1, '2023-05-30'),
  peak('Water Level', 'Minimum', 2.314, '2004-02-03'),
  peak('Water Level', 'Minimum', 2.9, '1972-03-01'),
  peak('Water Level', 'Maximum', 99999, '1999-06-01'), // a missing-value marker, not a peak
  peak('Discharge', 'Maximum', 13000, '1972-06-16'),
  peak('Snow', 'Maximum', 5, '1990-01-01')
];

let requests;
beforeEach(() => {
  requests = 0;
  console.error = () => {};
  axios.get = async (url, { params }) => {
    requests++;
    if (params.STATION_NUMBER === 'BROKEN1') throw new Error('timeout');
    return { data: { features: params.STATION_NUMBER === 'EMPTY01' ? [] : features } };
  };
});

const call = (id) => new Promise(resolve => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { resolve({ status: this.statusCode, body }); } };
  getWaterRecords({ params: { id } }, res);
});

test('finds the record high and low, typical yearly extremes, and the years covered', () => {
  const summary = summarizeAnnualPeaks(features);
  assert.deepEqual(summary.water_level, {
    recordHigh: { value: 10.162, date: '1972-06-16' },
    recordLow: { value: 2.314, date: '2004-02-03' },
    typicalHigh: 9.952,
    typicalLow: 2.607,
    firstYear: 1950,
    lastYear: 2023,
    years: 4
  });
  assert.deepEqual(summary.discharge.recordHigh, { value: 13000, date: '1972-06-16' });
  assert.equal(summary.discharge.recordLow, null);
});

test('a station without peaks has no records', () => {
  assert.deepEqual(summarizeAnnualPeaks([]), { water_level: null, discharge: null });
});

test('the endpoint returns records and caches them for the day', async () => {
  const first = await call('08mf005');
  assert.equal(first.status, 200);
  assert.equal(first.body.stationId, '08MF005');
  assert.equal(first.body.water_level.recordHigh.value, 10.162);
  await call('08MF005');
  assert.equal(requests, 1, 'the second request is served from the cache');
});

test('the endpoint rejects odd station IDs and reports upstream failures', async () => {
  assert.equal((await call('../../etc')).status, 400);
  assert.equal(requests, 0);
  assert.equal((await call('BROKEN1')).status, 502);
  assert.deepEqual((await call('EMPTY01')).body, { stationId: 'EMPTY01', water_level: null, discharge: null });
});
