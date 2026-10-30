import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parseUtcTimestamp } from '../utility/dates';
import Sparkline from './Sparkline';
import './stations.css';

// "2026-09-30" -> "Sep 30, 2026"; a month alone ("2024-08", when only monthly means remain) -> "Aug 2024".
// The dates are UTC calendar dates, so they're formatted in UTC to avoid shifting a day.
const formatLastReported = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  return date.toLocaleDateString('en-CA', day
    ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const timeAgo = (date) => {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
};

// Levels to the centimetre; flows to about three significant figures. A change is shown to the same
// decimals as the reading beside it.
const levelDecimals = () => 2;
const flowDecimals = (value) => {
  const size = Math.abs(value);
  return size >= 100 ? 0 : size >= 10 ? 1 : 2;
};
const formatNumber = (value, decimals) =>
  value.toLocaleString('en-CA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const METRICS = [
  { field: 'water_level', label: 'Level', unit: 'm', decimals: levelDecimals, minSpan: 0.05 },
  { field: 'discharge', label: 'Flow', unit: 'm³/s', decimals: flowDecimals, minSpan: null }
].map(metric => ({ ...metric, format: (value) => formatNumber(value, metric.decimals(value)) }));

const Change = ({ change, reading, metric }) => {
  if (change === null || change === undefined) return null;
  const amount = formatNumber(Math.abs(change), metric.decimals(reading));
  if (Number(amount.replace(/,/g, '')) === 0) {
    return <div className="station-metric__change">Steady over 24 h</div>;
  }
  const rising = change > 0;
  return (
    <div className="station-metric__change" aria-label={`${rising ? 'Up' : 'Down'} ${amount} ${metric.unit} in the past 24 hours`}>
      <span aria-hidden="true">{rising ? '▲' : '▼'}</span> {amount} {metric.unit} in 24 h
    </div>
  );
};

/**
 * A station's latest reading as a card linking to its page. summary is { reading, trend, lastReported } from
 * fetchStationSummaries, { failed: true } when that failed, or undefined while loading. action sits in the
 * top corner (a save or remove button); children go below the readings.
 */
const StationCard = ({ stationId, title, meta, summary, realtime, action, children }) => {
  const navigate = useNavigate();
  const to = `/station-details/${stationId}`;
  const reading = summary?.reading;
  const readingTime = reading ? parseUtcTimestamp(reading.date_time) : null;
  const metrics = METRICS.filter(metric => reading?.[metric.field] !== null && reading?.[metric.field] !== undefined);

  // The line follows the level, or the flow at stations that only measure flow.
  const lineMetric = metrics[0];
  const linePoints = lineMetric && summary?.trend
    ? summary.trend.hourly.map(point => ({ time: parseUtcTimestamp(point.date_time).getTime(), value: point[lineMetric.field] }))
    : [];
  const lineMinSpan = lineMetric?.minSpan ?? Math.max(Math.abs(reading?.[lineMetric?.field] || 0) * 0.04, 0.05);

  let status = null;
  if (!summary) status = <div className="station-card__status"><span className="spinner-border spinner-border-sm" role="status" aria-label="Loading" /></div>;
  else if (summary.failed) status = <div className="station-card__status">Couldn’t load the latest reading. Refresh to try again.</div>;
  else if (!reading) {
    status = (
      <div className="station-card__status">
        {/* The station catalogue marks some stations as having no real-time feed. */}
        {realtime === false ? 'No live readings' : 'No recent readings'}
        {realtime !== false && summary.lastReported && <div>Last reported {formatLastReported(summary.lastReported)}</div>}
      </div>
    );
  }

  return (
    <article className="station-card">
      <header className="station-card__header">
        <div>
          <h2 className="station-card__title">{title}</h2>
          <div className="station-card__meta">
            {meta}
            {readingTime && (
              <> · <time dateTime={readingTime.toISOString()} title={readingTime.toLocaleString('en-CA')}>{timeAgo(readingTime)}</time></>
            )}
          </div>
        </div>
        {action && <div className="station-card__action">{action}</div>}
      </header>

      {status || (
        <>
          <div className="station-card__metrics">
            {metrics.map(metric => (
              <div key={metric.field}>
                <div className="station-metric__label">{metric.label}</div>
                <div className="station-metric__value">
                  {metric.format(reading[metric.field])}<span className="station-metric__unit">{metric.unit}</span>
                </div>
                <Change change={summary.trend?.change?.[metric.field]} reading={reading[metric.field]} metric={metric} />
              </div>
            ))}
          </div>
          {linePoints.length > 1 && (
            <Sparkline
              points={linePoints}
              minSpan={lineMinSpan}
              format={(value) => `${lineMetric.format(value)} ${lineMetric.unit}`}
              label={`${lineMetric.label} over the past 24 hours, from ${lineMetric.format(linePoints[0].value)} to ${lineMetric.format(linePoints[linePoints.length - 1].value)} ${lineMetric.unit}`}
              onClick={() => navigate(to)}
            />
          )}
        </>
      )}

      {children}

      <Link to={to} className="station-card__link" aria-label={`View ${title}`} />
    </article>
  );
};

export default StationCard;
