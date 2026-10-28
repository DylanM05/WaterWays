// Rolling water readings up into coarser tiers: five-minute readings into hours, hours into days.
// Each figure keeps its mean, min, max and how many readings it covers per metric, so coarser figures
// built from it (daily from hourly) have exactly the mean of the underlying readings, and no peak is lost.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const METRICS = ['water_level', 'discharge'];

const startOf = (date, unitMs) => new Date(Math.floor(date.getTime() / unitMs) * unitMs);

function groupBy(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
}

/** Five-minute readings (time-ordered, already cleaned) to one figure per UTC hour. */
function hourlyFromReadings(readings) {
  return groupBy(readings, reading => startOf(reading.date_time, HOUR_MS).getTime()).map(([hour, members]) => {
    const figure = { date_time: new Date(hour), sample_count: members.length };
    for (const metric of METRICS) {
      const values = members.map(member => member[metric]).filter(value => typeof value === 'number');
      figure[metric] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      figure[`${metric}_min`] = values.length ? Math.min(...values) : null;
      figure[`${metric}_max`] = values.length ? Math.max(...values) : null;
      figure[`${metric}_count`] = values.length;
    }
    return figure;
  });
}

/** Hourly figures to one figure per UTC day; means are weighted by how many readings each hour had. */
function dailyFromHourly(hours) {
  return groupBy(hours, hour => startOf(hour.date_time, DAY_MS).getTime()).map(([day, members]) => {
    const figure = { date_time: new Date(day), sample_count: members.reduce((sum, member) => sum + (member.sample_count || 0), 0) };
    for (const metric of METRICS) {
      const present = members.filter(member => typeof member[metric] === 'number');
      // Hours stored before per-metric counts existed fall back to their overall reading count.
      const weight = member => member[`${metric}_count`] ?? member.sample_count ?? 1;
      const totalWeight = present.reduce((sum, member) => sum + weight(member), 0);
      figure[metric] = totalWeight ? present.reduce((sum, member) => sum + member[metric] * weight(member), 0) / totalWeight : null;
      figure[`${metric}_min`] = present.length ? Math.min(...present.map(member => member[`${metric}_min`] ?? member[metric])) : null;
      figure[`${metric}_max`] = present.length ? Math.max(...present.map(member => member[`${metric}_max`] ?? member[metric])) : null;
      figure[`${metric}_count`] = totalWeight;
    }
    return figure;
  });
}

/**
 * Five-minute readings plus hourly figures for the stretch where only hours are kept, as one time-ordered
 * series. An hourly figure is placed at the middle of its hour, and skipped if that hour still has readings.
 */
function readingsWithHourly(readings, hours) {
  const coveredHours = new Set(readings.map(reading => startOf(reading.date_time, HOUR_MS).getTime()));
  const hourly = hours
    .filter(hour => !coveredHours.has(startOf(hour.date_time, HOUR_MS).getTime()))
    .map(hour => ({
      date_time: new Date(hour.date_time.getTime() + HOUR_MS / 2),
      water_level: hour.water_level ?? null,
      discharge: hour.discharge ?? null,
      // The hour's own range, so highs and lows over the chart stay exact.
      water_level_min: hour.water_level_min ?? null,
      water_level_max: hour.water_level_max ?? null,
      discharge_min: hour.discharge_min ?? null,
      discharge_max: hour.discharge_max ?? null
    }));
  return [...hourly, ...readings].sort((a, b) => a.date_time - b.date_time);
}

module.exports = { HOUR_MS, dailyFromHourly, hourlyFromReadings, readingsWithHourly };
