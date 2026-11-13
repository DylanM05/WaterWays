// Formatting for water readings, shared by the search results, cards, tables and station page.

export const formatNumber = (value, decimals) =>
  value.toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// Levels to the centimetre; flows to about three significant figures.
const levelDecimals = () => 2;
const flowDecimals = (value) => {
  const size = Math.abs(value);
  return size >= 100 ? 0 : size >= 10 ? 1 : 2;
};

export const METRICS = {
  water_level: { field: 'water_level', label: 'Level', unit: 'm', decimals: levelDecimals, minSpan: 0.05 },
  discharge: { field: 'discharge', label: 'Flow', unit: 'm³/s', decimals: flowDecimals, minSpan: null }
};
Object.values(METRICS).forEach(metric => {
  metric.format = (value) => formatNumber(value, metric.decimals(value));
});

/** The metrics a reading has, level first. */
export const metricsOf = (reading) =>
  Object.values(METRICS).filter(metric => typeof reading?.[metric.field] === 'number');

/**
 * A change shown to the same decimals as the reading beside it: { direction: 'up' | 'down' | 'flat', amount }.
 * A change that rounds to nothing is flat. Returns null when there is no change to show.
 */
export function describeChange(change, reading, metric) {
  if (typeof change !== 'number' || typeof reading !== 'number') return null;
  const amount = formatNumber(Math.abs(change), metric.decimals(reading));
  if (Number(amount.replace(/,/g, '')) === 0) return { direction: 'flat', amount: null };
  return { direction: change > 0 ? 'up' : 'down', amount };
}

export const timeAgo = (date) => {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};

// "2026-09-30" -> "Sep 30, 2026"; a month alone ("2024-08", when only monthly means remain) -> "Aug 2024".
// The dates are UTC calendar dates, so they're formatted in UTC to avoid shifting a day.
export const formatLastReported = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  return date.toLocaleDateString('en-CA', day
    ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
