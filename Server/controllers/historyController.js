const NodeCache = require('node-cache');
const StationArchive = require('../models/StationArchive');
const StationData = require('../models/StationData');
const { cleanReadings, plausibleDischarge, plausibleLevel } = require('../utilities/waterQuality');
const { dailyFromHourly } = require('../utilities/rollups');

// Archives only change once a day, so an hour of caching costs little freshness.
const historyCache = new NodeCache({ stdTTL: 3600 });

const METRICS = ['water_level', 'discharge'];
const INTERVALS = ['day', 'week', 'month', 'year', 'season'];
const MAX_DAILY_SPAN_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = date => date.toISOString().slice(0, 10);
const monthKey = date => `${date.toISOString().slice(0, 7)}-01`;
const yearKey = date => `${date.getUTCFullYear()}-01-01`;

function weekKey(date) {
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return dayKey(monday);
}

const round = value => Math.round(value * 1000) / 1000;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Turns an archive record into a point, or null when the metric has no plausible value. */
function archivePoint(record, metric) {
  const plausible = metric === 'water_level' ? plausibleLevel : plausibleDischarge;
  const average = plausible(record[metric]);
  if (average === null) return null;
  return {
    date: record.date_time,
    average,
    low: plausible(record[`${metric}_min`]) ?? average,
    high: plausible(record[`${metric}_max`]) ?? average,
    count: record.sample_count ?? null
  };
}

/** Averages points that share a key into one point per key, oldest first. */
function groupPoints(points, keyFor) {
  const groups = new Map();
  for (const point of points) {
    const key = keyFor(point.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, members]) => ({
      date: new Date(`${key}T00:00:00.000Z`),
      average: mean(members.map(member => member.average)),
      low: Math.min(...members.map(member => member.low)),
      high: Math.max(...members.map(member => member.high)),
      count: members.length
    }));
}

/**
 * Daily means from the daily archive, then from hourly figures (days 8–30), then from raw readings (the
 * last week). Together these cover roughly the last year; older history only exists as monthly means.
 */
async function loadDays(stationId, metric, from, to) {
  const [archived, hourly, raw] = await Promise.all([
    StationArchive.find({ station_id: stationId, period: 'daily', date_time: { $gte: from, $lte: to } }).lean(),
    StationArchive.find({ station_id: stationId, period: 'hourly', date_time: { $gte: from, $lte: to } }).sort({ date_time: 1 }).lean(),
    StationData.find({ station_id: stationId, date_time: { $gte: from, $lte: to } })
      .sort({ date_time: 1 })
      .select('date_time water_level discharge -_id')
      .lean()
  ]);

  const days = new Map();
  for (const record of archived) {
    const point = archivePoint(record, metric);
    if (point) days.set(dayKey(point.date), point);
  }
  for (const record of dailyFromHourly(hourly)) {
    const point = archivePoint(record, metric);
    if (point && !days.has(dayKey(point.date))) days.set(dayKey(point.date), point);
  }

  const rawPoints = cleanReadings(raw)
    .filter(reading => reading[metric] !== null && reading[metric] !== undefined)
    .map(reading => ({ date: reading.date_time, average: reading[metric], low: reading[metric], high: reading[metric] }));
  for (const point of groupPoints(rawPoints, dayKey)) {
    const key = dayKey(point.date);
    // A day already in the archive was rolled up from complete raw data.
    if (!days.has(key)) days.set(key, point);
  }

  return [...days.values()].sort((a, b) => a.date - b.date);
}

/** Monthly means from the monthly archive, filled in with months built from daily means. */
async function loadMonths(stationId, metric, from, to, days) {
  const monthStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const archived = await StationArchive.find({
    station_id: stationId,
    period: 'monthly',
    date_time: { $gte: monthStart, $lte: to }
  }).lean();

  const months = new Map();
  for (const record of archived) {
    const point = archivePoint(record, metric);
    if (point) months.set(monthKey(point.date), point);
  }
  for (const point of groupPoints(days, monthKey)) {
    const key = monthKey(point.date);
    if (!months.has(key)) months.set(key, point);
  }

  return [...months.values()].sort((a, b) => a.date - b.date);
}

/** Typical value for each calendar month across every year in the range. */
function seasonalPoints(months) {
  const byMonth = new Map();
  for (const point of months) {
    const month = point.date.getUTCMonth() + 1;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(point);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, members]) => {
      const lowest = members.reduce((min, point) => (point.average < min.average ? point : min));
      const highest = members.reduce((max, point) => (point.average > max.average ? point : max));
      return {
        month,
        average: round(mean(members.map(point => point.average))),
        low: round(lowest.average),
        high: round(highest.average),
        lowYear: lowest.date.getUTCFullYear(),
        highYear: highest.date.getUTCFullYear(),
        count: members.length
      };
    });
}

function summarize(points) {
  if (!points.length) return null;
  const lowest = points.reduce((min, point) => (point.low < min.low ? point : min));
  const highest = points.reduce((max, point) => (point.high > max.high ? point : max));
  return {
    average: round(mean(points.map(point => point.average))),
    low: round(lowest.low),
    lowDate: dayKey(lowest.date),
    high: round(highest.high),
    highDate: dayKey(highest.date)
  };
}

const serialize = point => ({
  date: dayKey(point.date),
  average: round(point.average),
  low: round(point.low),
  high: round(point.high),
  count: point.count
});

async function loadCoverage(stationId) {
  const [earliest, latestRaw, latestArchive] = await Promise.all([
    StationArchive.findOne({ station_id: stationId }).sort({ date_time: 1 }).select('date_time').lean(),
    StationData.findOne({ station_id: stationId }).sort({ date_time: -1 }).select('date_time').lean(),
    StationArchive.findOne({ station_id: stationId }).sort({ date_time: -1 }).select('date_time').lean()
  ]);
  const latest = latestRaw?.date_time || latestArchive?.date_time;
  return {
    earliest: earliest ? dayKey(earliest.date_time) : null,
    latest: latest ? dayKey(latest) : null
  };
}

/**
 * GET /details/water-history/:id?metric=water_level|discharge&interval=day|week|month|year|season&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Averages archived readings into the requested interval. Daily and weekly intervals are limited to
 * the last year, where daily means exist. "season" returns the typical value for each calendar month
 * across the range, plus the most recent twelve months for comparison.
 */
exports.getWaterHistory = async (req, res) => {
  const stationId = req.params.id;
  const metric = req.query.metric || 'water_level';
  const interval = req.query.interval || 'month';

  if (!METRICS.includes(metric)) {
    return res.status(400).json({ error: `metric must be one of ${METRICS.join(', ')}` });
  }
  if (!INTERVALS.includes(interval)) {
    return res.status(400).json({ error: `interval must be one of ${INTERVALS.join(', ')}` });
  }

  const today = new Date(`${dayKey(new Date())}T00:00:00.000Z`);
  const to = req.query.to ? parseDay(req.query.to) : today;
  const dailyInterval = interval === 'day' || interval === 'week';
  const defaultFrom = dailyInterval && to ? new Date(to.getTime() - 365 * DAY_MS) : new Date(Date.UTC(1900, 0, 1));
  const from = req.query.from ? parseDay(req.query.from) : defaultFrom;
  if (!to || !from) {
    return res.status(400).json({ error: 'from and to must be dates formatted YYYY-MM-DD' });
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be on or before to' });
  }
  if (dailyInterval && (to - from) / DAY_MS > MAX_DAILY_SPAN_DAYS) {
    return res.status(400).json({ error: `Daily and weekly averages are limited to ${MAX_DAILY_SPAN_DAYS} days` });
  }

  // Include the whole final day.
  const toInclusive = new Date(to.getTime() + DAY_MS - 1);
  const cacheKey = `${stationId}:${metric}:${interval}:${dayKey(from)}:${dayKey(to)}`;
  const cached = historyCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const [days, coverage] = await Promise.all([
      loadDays(stationId, metric, from, toInclusive),
      loadCoverage(stationId)
    ]);

    let points;
    let seasonal;
    let recent;
    if (interval === 'day') {
      points = days;
    } else if (interval === 'week') {
      points = groupPoints(days, weekKey);
    } else {
      const months = await loadMonths(stationId, metric, from, toInclusive, days);
      if (interval === 'month') {
        points = months;
      } else if (interval === 'year') {
        points = groupPoints(months, yearKey);
      } else {
        points = months;
        seasonal = seasonalPoints(months);
        const recentStart = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
        recent = months.filter(point => point.date >= recentStart).map(serialize);
      }
    }

    const body = {
      stationId,
      metric,
      interval,
      from: dayKey(from),
      to: dayKey(to),
      coverage,
      summary: summarize(points),
      points: interval === 'season' ? seasonal : points.map(serialize),
      ...(interval === 'season' ? { recent } : {})
    };
    historyCache.set(cacheKey, body);
    return res.json(body);
  } catch (error) {
    console.error('Error building water history:', error);
    return res.status(500).json({ error: 'Failed to load water history' });
  }
};
