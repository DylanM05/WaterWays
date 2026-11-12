import { parseUtcTimestamp } from '../utility/dates';
import { METRICS, describeChange, formatLastReported, metricsOf, timeAgo } from '../utility/readings';
import { displayTitle } from '../utility/names';

/**
 * The station's name in a list of one river's stations (the river page, Saved rivers): the section, capitalized
 * since it stands alone there ("At Hope", "Near Marguerite"), or the full name without the river's.
 */
export function sectionName(station, riverName) {
  let name = station.section;
  if (!name) {
    const full = String(station.stationName || '');
    const prefix = `${riverName} `.toUpperCase();
    name = full.toUpperCase().startsWith(prefix) ? full.slice(prefix.length) : full;
  }
  const title = displayTitle(name).trim();
  if (!title) return `Station ${station.station_id}`;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** "Sep 28", or "Sep 28, 2025" when it wasn't this year. */
export const shortLastReported = (value) => formatLastReported(value).replace(`, ${new Date().getFullYear()}`, '');

/**
 * What a row shows for one station, from its fetchStationSummaries entry: each metric's value and 24 h change,
 * the sparkline's points (level, or flow where only flow is measured), and when it last reported.
 */
export function describeRow(summary) {
  const reading = summary?.reading || null;
  const time = reading ? parseUtcTimestamp(reading.date_time) : null;
  const cell = (metric) => {
    const value = reading?.[metric.field];
    if (typeof value !== 'number') return null;
    return { metric, value, change: describeChange(summary.trend?.change?.[metric.field], value, metric) };
  };

  const lineMetric = metricsOf(reading)[0];
  const points = lineMetric && summary?.trend?.hourly
    ? summary.trend.hourly.map(point => ({ time: parseUtcTimestamp(point.date_time).getTime(), value: point[lineMetric.field] }))
    : [];
  // Flow has no fixed scale, so a nearly flat line is kept flat relative to its size.
  const minSpan = lineMetric?.minSpan ?? Math.max(Math.abs(reading?.[lineMetric?.field] || 0) * 0.04, 0.05);

  return {
    reading,
    time,
    updated: time && !Number.isNaN(time.getTime()) ? timeAgo(time) : null,
    level: cell(METRICS.water_level),
    flow: cell(METRICS.discharge),
    line: lineMetric && points.length > 1 ? { metric: lineMetric, points, minSpan } : null
  };
}
