import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import Sparkline from '../stations/Sparkline';
import { fetchStationSummaries } from '../utility/stationSummaries';
import { displayTitle } from '../utility/names';
import { describeChange, formatLastReported, metricsOf, timeAgo } from '../utility/readings';
import { parseUtcTimestamp } from '../utility/dates';
import { useSettings } from '../utility/contexts/SettingsContext';
import { TrendIcon } from '../icons/Icons';
import { formatDegrees, weatherSummary } from './weatherSummary';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const SHOWN = 3;

/**
 * The first few saved stations of a signed-in subscriber, or [] for anyone else. Saving is a premium
 * feature, so a lapsed subscriber's old favourites aren't shown here.
 */
function useSavedStations() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [stations, setStations] = useState([]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setStations([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const headers = { Authorization: `Bearer ${await getToken()}` };
        const [records, subscription] = await Promise.all([
          axios.get(`${API_BASE_URL}/u/favorites`, { headers }).then(response => response.data),
          axios.get(`${API_BASE_URL}/sub/status`, { headers }).then(response => response.data).catch(() => ({ subscribed: false }))
        ]);
        if (cancelled || !subscription?.subscribed) return;
        const saved = (records || []).filter(record => record.favoriteType !== 'river').slice(0, SHOWN);
        // Older favourites were stored without a name; the station catalogue has it.
        const named = await Promise.all(saved.map(station => (station.stationName ? station
          : axios.get(`${API_BASE_URL}/details/coordinates/${station.stationId}`)
            .then(({ data }) => ({ ...station, stationName: data?.stationName || null }))
            .catch(() => station))));
        if (!cancelled) setStations(named);
      } catch (error) {
        // The home page works without this section, so it just stays hidden.
        console.error('Error loading saved stations:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken]);

  return stations;
}

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

/** Up to three saved stations, for subscribers who have saved any. Renders nothing otherwise. */
const SavedStations = ({ compact }) => {
  const stations = useSavedStations();
  const [summaries, setSummaries] = useState({});

  useEffect(() => {
    if (!stations.length) return undefined;
    let cancelled = false;
    const ids = stations.map(station => station.stationId);
    fetchStationSummaries(ids)
      .then(result => { if (!cancelled) setSummaries(result); })
      .catch(error => {
        console.error('Error loading latest readings:', error);
        if (!cancelled) setSummaries(Object.fromEntries(ids.map(id => [id, { failed: true }])));
      });
    return () => { cancelled = true; };
  }, [stations]);

  if (!stations.length) return null;

  return (
    <section className="home__section" aria-labelledby="home-saved">
      <div className="home__section-head">
        <h2 className="disp home__heading" id="home-saved">Saved</h2>
        <Link to="/favourites" className="home__see-all">See all</Link>
      </div>
      <div className="saved-cards">
        {stations.map(station => (
          <SavedCard key={station.stationId} station={station} summary={summaries[station.stationId]} compact={compact} />
        ))}
      </div>
    </section>
  );
};

export default SavedStations;
