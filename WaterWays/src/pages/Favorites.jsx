import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import Spinner from '../components/spinners/Spinner';
import SavedCard, { AlertChip } from '../components/stations/SavedCard';
import Sparkline from '../components/stations/Sparkline';
import { useCurrentWeather, useStationAlerts } from '../components/stations/stationLookups';
import { useSettings } from '../components/utility/contexts/SettingsContext';
import { formatDegrees, weatherSummary } from '../components/utility/weatherSummary';
import { fetchStationSummaries, withStationNames } from '../components/utility/stationSummaries';
import { displayTitle, PROVINCE_NAMES } from '../components/utility/names';
import { describeRow, sectionName, shortLastReported } from '../components/river/riverRows';
import { ChevronDownIcon, TrendIcon, XIcon } from '../components/icons/Icons';
import './styling/favorites.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** Latest readings for the saved stations, fetched once per set of stations. */
function useSummaries(stationIds) {
  const [summaries, setSummaries] = useState({});
  const key = stationIds.join(',');
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    fetchStationSummaries(key.split(','))
      .then(result => { if (!cancelled) setSummaries(result); })
      .catch(error => {
        console.error('Error loading latest readings:', error);
        if (!cancelled) setSummaries(Object.fromEntries(key.split(',').map(id => [id, { failed: true }])));
      });
    return () => { cancelled = true; };
  }, [key]);
  return summaries;
}

/** A measurement and its 24 h change, stacked; a dash when the station doesn't measure it. */
const Reading = ({ cell, flow }) => {
  if (!cell) return <span className="saved__rs-cell saved__rs-cell--none" aria-hidden="true">—</span>;
  const change = cell.change;
  return (
    <span className="saved__rs-cell">
      <span className="num">{cell.metric.format(cell.value)}<small>{cell.metric.unit}</small></span>
      {change && (
        <span className={`chg${change.direction === 'up' ? ' chg--up' : ''}${flow ? ' chg--flow' : ''}`}>
          <TrendIcon direction={change.direction} />{change.amount ?? 'Steady'}
        </span>
      )}
    </span>
  );
};

/** Current temperature and sky at a station, small. */
const RowWeather = ({ stationId }) => {
  const { settings } = useSettings();
  const weather = useCurrentWeather(stationId);
  const sky = weatherSummary(weather);
  const degrees = formatDegrees(weather?.temperature, settings?.temperatureUnit);
  if (!degrees) return <span className="saved__rs-wx" />;
  const SkyIcon = sky?.Icon;
  return (
    <span className="saved__rs-wx" title={sky?.label}>
      {SkyIcon && <SkyIcon />}
      {degrees}
    </span>
  );
};

/**
 * One station of a saved river, as a row: its name, when it last reported and any alert; level and flow with
 * their 24 h change; the past day's line; and the weather there.
 */
const RiverStationRow = ({ station, riverName, summary }) => {
  const id = station.stationId;
  const name = sectionName({ ...station, station_id: id }, riverName || '');
  const alerts = useStationAlerts(id);
  const row = describeRow(summary);
  const reporting = Boolean(row.level || row.flow);
  let note = row.updated;
  if (!summary) note = null;
  else if (summary.failed) note = 'Couldn’t load the latest reading';
  else if (!reporting) note = summary.lastReported ? `No recent readings, last ${shortLastReported(summary.lastReported)}` : 'No recent readings';
  return (
    <li>
      <Link to={`/station-details/${encodeURIComponent(id)}`} className={`saved__rs${reporting ? '' : ' saved__rs--quiet'}`}>
        <span className="saved__rs-name">
          <b>{name}</b>
          <span>{[id, note].filter(Boolean).join(' · ')}</span>
          <AlertChip alerts={alerts} />
        </span>
        {reporting && (
          <>
            <Reading cell={row.level} />
            <Reading cell={row.flow} flow />
            <span className="saved__rs-line">
              {row.line && (
                <Sparkline
                  points={row.line.points}
                  minSpan={row.line.minSpan}
                  format={(value) => `${row.line.metric.format(value)} ${row.line.metric.unit}`}
                  label={`${row.line.metric.label} over the past 24 hours`}
                />
              )}
            </span>
          </>
        )}
        <RowWeather stationId={id} />
      </Link>
    </li>
  );
};

/** A saved river's stations with their latest readings, fetched when the river is opened. Reporting ones first. */
const RiverStations = ({ river }) => {
  const stations = useMemo(() => river.stations || [], [river.stations]);
  const summaries = useSummaries(useMemo(() => stations.map(station => station.stationId), [stations]));
  const loaded = stations.length > 0 && stations.every(station => summaries[station.stationId]);
  const ordered = loaded
    ? [...stations].sort((a, b) => Number(!summaries[a.stationId].reading) - Number(!summaries[b.stationId].reading))
    : stations;
  if (!stations.length) return null;
  return (
    <ul className="saved__stations" aria-busy={!loaded}>
      {ordered.map(station => (
        <RiverStationRow key={station.stationId} station={station} riverName={river.riverName} summary={summaries[station.stationId]} />
      ))}
    </ul>
  );
};

const RemoveButton = ({ name, onClick }) => (
  <button type="button" className="saved-remove" onClick={onClick} aria-label={`Remove ${name}`}>
    <XIcon />
  </button>
);

/** Saved rivers and stations, for members. Edit reveals a remove button on each. */
const Favorites = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [favorites, setFavorites] = useState(null);
  const [error, setError] = useState(null);
  const [segment, setSegment] = useState(null);
  const [editing, setEditing] = useState(false);
  const [openRivers, setOpenRivers] = useState(() => new Set());

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const { data } = await axios.get(`${API_BASE_URL}/u/favorites`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { includeRivers: true }
        });
        if (cancelled) return;
        setFavorites(data);
        // A single saved river starts open.
        const savedRivers = data.filter(favorite => favorite.favoriteType === 'river');
        if (savedRivers.length === 1) setOpenRivers(new Set([savedRivers[0].stationId]));
        // Older favourites were saved without a name; fill them in as the catalogue answers.
        const unnamed = data.filter(favorite => favorite.favoriteType !== 'river' && !favorite.stationName);
        if (unnamed.length) {
          const named = Object.fromEntries((await withStationNames(unnamed)).map(station => [station.stationId, station.stationName]));
          if (!cancelled) {
            setFavorites(prev => prev.map(favorite => (named[favorite.stationId] && favorite.favoriteType !== 'river'
              ? { ...favorite, stationName: named[favorite.stationId] } : favorite)));
          }
        }
      } catch (err) {
        console.error('Error fetching favorites:', err);
        if (!cancelled) {
          setFavorites([]);
          setError('Couldn’t load your saved rivers and stations. Check your connection and refresh to try again.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken]);

  // Memoized so the cards don't refetch their readings every time this page re-renders.
  const stations = useMemo(() => (favorites || []).filter(favorite => favorite.favoriteType !== 'river'), [favorites]);
  const rivers = useMemo(() => (favorites || []).filter(favorite => favorite.favoriteType === 'river'), [favorites]);
  const summaries = useSummaries(useMemo(() => stations.map(station => station.stationId), [stations]));

  // As in the iOS app: rivers first when there are any.
  const shown = segment ?? (rivers.length ? 'rivers' : 'stations');

  const toggleRiver = (id) => setOpenRivers(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const remove = async (path, id) => {
    try {
      setError(null);
      const token = await getToken();
      await axios.delete(`${API_BASE_URL}/u/favorites/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      setFavorites(prev => prev.filter(favorite => favorite.stationId !== id));
    } catch (err) {
      console.error('Error removing favorite:', err);
      setError('Couldn’t remove that. Check your connection and try again.');
    }
  };

  if (!favorites) return <Spinner message="Loading your saved rivers and stations…" />;

  const hasAny = stations.length + rivers.length > 0;

  return (
    <div className="page saved">
      <header className="saved__head">
        <h1 className="disp saved__title">Saved</h1>
        {hasAny && (
          <button type="button" className="saved__edit" onClick={() => setEditing(!editing)} aria-pressed={editing}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>

      <div className="seg saved__seg" role="group" aria-label="Show">
        {[['rivers', 'Rivers'], ['stations', 'Stations']].map(([key, label]) => (
          <button key={key} type="button" className={shown === key ? 'is-on' : undefined} aria-pressed={shown === key} onClick={() => setSegment(key)}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="saved__error" role="alert">{error}</p>}

      {shown === 'stations' && (stations.length ? (
        <ul className="saved__grid">
          {stations.map(station => {
            const name = station.stationName ? displayTitle(station.stationName) : station.stationId;
            return (
              <li key={station.stationId} className="saved__item">
                <SavedCard station={station} summary={summaries[station.stationId]} />
                {editing && <RemoveButton name={name} onClick={() => remove(station.stationId, station.stationId)} />}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ww-empty">
          <b>You haven’t saved any stations yet</b>
          <span>Open a station and choose Save station.</span>
        </div>
      ))}

      {shown === 'rivers' && (rivers.length ? (
        <ul className="ww-card saved__rivers">
          {rivers.map(river => {
            const name = displayTitle(river.riverName || river.stationName);
            const open = openRivers.has(river.stationId);
            const panelId = `saved-river-${river.stationId}`;
            const stationCount = (river.stations || []).length;
            return (
              <li key={river.stationId} className={open ? 'is-open' : undefined}>
                <div className="saved__river-row">
                  <Link to={`/river/${encodeURIComponent(river.riverName || '')}`} className="saved__river">
                    <b>{name}</b>
                    <span>{[PROVINCE_NAMES[river.province] || river.province, count(stationCount, 'station')].filter(Boolean).join(', ')}</span>
                  </Link>
                  {stationCount > 0 && (
                    <button
                      type="button"
                      className="saved__toggle"
                      onClick={() => toggleRiver(river.stationId)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      aria-label={`${name} stations`}
                    >
                      <ChevronDownIcon />
                    </button>
                  )}
                  {editing && <RemoveButton name={name} onClick={() => remove(`rivers/${encodeURIComponent(river.stationId)}`, river.stationId)} />}
                </div>
                <div id={panelId} hidden={!open}>
                  {open && <RiverStations river={river} />}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ww-empty">
          <b>You haven’t saved any rivers yet</b>
          <span>Open a river and choose Save river.</span>
        </div>
      ))}
    </div>
  );
};

export default Favorites;
