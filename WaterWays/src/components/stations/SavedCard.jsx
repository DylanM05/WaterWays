import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Sparkline from './Sparkline';
import { displayTitle } from '../utility/names';
import { describeChange, formatLastReported, metricsOf, timeAgo } from '../utility/readings';
import { parseUtcTimestamp } from '../utility/dates';
import { useSettings } from '../utility/contexts/SettingsContext';
import { TrendIcon } from '../icons/Icons';
import { formatDegrees, weatherSummary } from '../utility/weatherSummary';
import './savedCard.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** Current weather at a station, or null until it arrives (or if it fails). */
function useCurrentWeather(stationId) {
  const [weather, setWeather] = useState(null);
  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE_URL}/details/weather/${stationId}`)
      .then(({ data }) => { if (!cancelled) setWeather(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stationId]);
  return weather;
}

const Weather = ({ stationId }) => {
  const { settings } = useSettings();
  const weather = useCurrentWeather(stationId);
  const summary = weatherSummary(weather);
  const degrees = formatDegrees(weather?.temperature, settings?.temperatureUnit);
  if (!degrees) return <span />;
  return (
    <span className="saved-card__wx">
      {summary && <summary.Icon />}
      {degrees} {summary?.label}
    </span>
  );
};

/** One saved station: its latest reading, change and last day, linking to the station page. */
const SavedCard = ({ station, summary, compact }) => {
  const stationId = station.stationId;
  const name = station.stationName ? displayTitle(station.stationName) : stationId;
  const reading = summary?.reading;
  const metric = metricsOf(reading)[0];
  const value = metric ? reading[metric.field] : null;
  const change = metric ? describeChange(summary.trend?.change?.[metric.field], value, metric) : null;
  const readingTime = reading?.date_time ? parseUtcTimestamp(reading.date_time) : null;
  const when = readingTime && !Number.isNaN(readingTime.getTime()) && (
    <time dateTime={readingTime.toISOString()} title={readingTime.toLocaleString('en-CA')}>{timeAgo(readingTime)}</time>
  );

  const points = metric && summary?.trend?.hourly
    ? summary.trend.hourly.map(point => ({ time: parseUtcTimestamp(point.date_time).getTime(), value: point[metric.field] }))
    : [];
  const minSpan = metric?.minSpan ?? Math.max(Math.abs(value || 0) * 0.04, 0.05);
  const changeText = change?.amount ? `${change.amount} ${metric.unit}` : 'Steady';

  let body;
  if (!summary) {
    body = <div className="saved-card__status" aria-label="Loading" />;
  } else if (summary.failed) {
    body = <div className="saved-card__status">Couldn’t load the latest reading. Refresh to try again.</div>;
  } else if (!metric) {
    body = (
      <div className="saved-card__status">
        No recent readings
        {summary.lastReported && <span>Last reported {formatLastReported(summary.lastReported)}</span>}
      </div>
    );
  } else {
    body = (
      <>
        <div className="saved-card__now">
          <div className="num saved-card__value">{metric.format(value)}<small>{metric.unit}</small></div>
          {change && (compact ? (
            <span className={`chg${change.direction === 'up' ? ' chg--up' : ''}`}><TrendIcon direction={change.direction} />{changeText}</span>
          ) : (
            <span className={`pill pill--${change.direction === 'up' ? 'rise' : change.direction === 'down' ? 'fall' : 'flat'}`}>
              <TrendIcon direction={change.direction} />{changeText}
            </span>
          ))}
        </div>
        {points.length > 1 && (
          <div className={`saved-card__spark${change?.direction === 'flat' ? ' saved-card__spark--steady' : ''}`}>
            <Sparkline
              points={points}
              minSpan={minSpan}
              format={(point) => `${metric.format(point)} ${metric.unit}`}
              label={`${metric.label} over the past 24 hours, from ${metric.format(points[0].value)} to ${metric.format(points[points.length - 1].value)} ${metric.unit}`}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <Link to={`/station-details/${stationId}`} className="ww-card saved-card">
      <div className="saved-card__head">
        <h3 className="disp saved-card__name">{name}</h3>
        {compact ? (
          when && <div className="saved-card__meta">{when}</div>
        ) : (
          <div className="saved-card__meta"><span className="mono">{stationId}</span>{station.province && <span>{station.province}</span>}</div>
        )}
      </div>
      {body}
      {!compact && (
        <div className="saved-card__foot">
          <Weather stationId={stationId} />
          {when}
        </div>
      )}
    </Link>
  );
};

export default SavedCard;
