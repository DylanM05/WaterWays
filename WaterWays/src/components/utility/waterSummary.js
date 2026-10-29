// Conditions for a station over the readings the page has (normally 30 days), matching the iOS summary.
import { parseUtcTimestamp } from './dates.js';

const HOUR_MS = 60 * 60 * 1000;
const KEYS = {
  water: { value: 'water_level', min: 'water_level_min', max: 'water_level_max' },
  discharge: { value: 'discharge', min: 'discharge_min', max: 'discharge_max' }
};

/**
 * Latest value, change over 24 hours and 7 days, average, and the low and high with when they happened.
 * Readings older than a week are hourly averages that carry the hour's own min and max, so the low and
 * high use those and stay exact. Returns null when there are no values.
 */
export function summarizeReadings(readings, series) {
  const keys = KEYS[series];
  const samples = (readings || [])
    .map(reading => {
      const value = reading[keys.value];
      if (typeof value !== 'number') return null;
      return {
        time: parseUtcTimestamp(reading.date_time).getTime(),
        value,
        low: typeof reading[keys.min] === 'number' ? reading[keys.min] : value,
        high: typeof reading[keys.max] === 'number' ? reading[keys.max] : value
      };
    })
    .filter(sample => sample && Number.isFinite(sample.time))
    .sort((a, b) => a.time - b.time);
  if (!samples.length) return null;

  const latest = samples[samples.length - 1];
  const lowest = samples.reduce((min, sample) => (sample.low < min.low ? sample : min));
  const highest = samples.reduce((max, sample) => (sample.high > max.high ? sample : max));
  const average = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;

  // Difference from the reading nearest the given time before the latest, if one is within an hour of it.
  const changeOver = (hours) => {
    const target = latest.time - hours * HOUR_MS;
    const past = samples.reduce((best, sample) =>
      (Math.abs(sample.time - target) < Math.abs(best.time - target) ? sample : best));
    return Math.abs(past.time - target) <= HOUR_MS ? latest.value - past.value : null;
  };

  const range = highest.high - lowest.low;
  // Changes under 3% of the observed range count as steady, so sensor noise doesn't read as a trend.
  const isSteady = change => Math.abs(change) < Math.max(range * 0.03, 0.001);

  return {
    latest: latest.value,
    latestTime: new Date(latest.time),
    change24h: changeOver(24),
    change7d: changeOver(24 * 7),
    average,
    low: lowest.low,
    lowTime: new Date(lowest.time),
    high: highest.high,
    highTime: new Date(highest.time),
    spanDays: Math.max(1, Math.round((latest.time - samples[0].time) / (24 * HOUR_MS))),
    isSteady
  };
}
