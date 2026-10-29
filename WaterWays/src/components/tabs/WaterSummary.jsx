import React, { useMemo } from 'react';
import { summarizeReadings } from '../utility/waterSummary';
import { formatLongDateTime } from '../utility/dates';

const UNITS = { water: 'm', discharge: 'm³/s' };

const formatValue = (value, unit, signed = false) => {
  const number = value.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${signed && value > 0 ? '+' : ''}${number} ${unit}`;
};

const timeAgo = (date) => {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  if (minutes < 48 * 60) return format.format(-Math.round(minutes / 60), 'hour');
  return format.format(-Math.round(minutes / (24 * 60)), 'day');
};

// Colours are set explicitly from the theme variables: inherited text colour comes out dark in dark mode.
const TEXT = { color: 'var(--text-colour)' };
const MUTED = { color: 'var(--text-colour)', opacity: 0.75 };

const Tile = ({ title, value, detail }) => (
  <div style={{
    flex: '1 1 160px',
    padding: '10px 12px',
    border: '1px solid var(--border-colour)',
    borderRadius: '6px',
    backgroundColor: 'var(--card-bg-colour)',
    ...TEXT
  }}>
    <div style={{ fontSize: '0.75rem', ...MUTED }}>{title}</div>
    <div style={{ fontSize: '1.1rem', fontWeight: 600, ...TEXT }}>{value}</div>
    {detail && <div style={{ fontSize: '0.75rem', ...MUTED }}>{detail}</div>}
  </div>
);

/** Current conditions over the loaded readings (normally 30 days), like the iOS app's summary. */
const WaterSummary = ({ readings, series }) => {
  const summary = useMemo(() => summarizeReadings(readings, series), [readings, series]);
  if (!summary) return null;

  const unit = UNITS[series];
  const change = (title, value) => {
    if (value === null) return <Tile title={title} value="—" detail="Not enough data" />;
    const trend = summary.isSteady(value) ? 'Steady' : value > 0 ? 'Rising' : 'Falling';
    return <Tile title={title} value={formatValue(value, unit, true)} detail={trend} />;
  };
  const difference = summary.latest - summary.average;
  const comparedToAverage = summary.isSteady(difference)
    ? 'Now near average'
    : `Now ${formatValue(Math.abs(difference), unit)} ${difference > 0 ? 'above' : 'below'}`;

  return (
    <div className="mb-3" style={TEXT}>
      <div className="d-flex justify-content-between align-items-baseline mb-2 flex-wrap">
        <h6 className="mb-0" style={TEXT}>Conditions</h6>
        <small style={MUTED}>Updated {timeAgo(summary.latestTime)}</small>
      </div>
      <div className="d-flex flex-wrap gap-2">
        <Tile title="Now" value={formatValue(summary.latest, unit)} detail={formatLongDateTime(summary.latestTime, { seconds: false })} />
        {change('Last 24 hours', summary.change24h)}
        {change('Last 7 days', summary.change7d)}
        <Tile title={`${summary.spanDays}-day average`} value={formatValue(summary.average, unit)} detail={comparedToAverage} />
        <Tile title={`${summary.spanDays}-day low`} value={formatValue(summary.low, unit)} detail={formatLongDateTime(summary.lowTime, { seconds: false })} />
        <Tile title={`${summary.spanDays}-day high`} value={formatValue(summary.high, unit)} detail={formatLongDateTime(summary.highTime, { seconds: false })} />
      </div>
    </div>
  );
};

export default WaterSummary;
