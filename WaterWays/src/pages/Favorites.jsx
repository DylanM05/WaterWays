import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import Spinner from '../components/spinners/Spinner';
import SavedCard from '../components/stations/SavedCard';
import { fetchStationSummaries } from '../components/utility/stationSummaries';
import { displayTitle, PROVINCE_NAMES } from '../components/utility/names';
import { ChevronRightIcon, XIcon } from '../components/icons/Icons';
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
        if (!cancelled) setFavorites(data);
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
            return (
              <li key={river.stationId}>
                <Link to={`/river/${encodeURIComponent(river.riverName || '')}`}>
                  <span className="saved__river">
                    <b>{name}</b>
                    <span>{[PROVINCE_NAMES[river.province] || river.province, count((river.stations || []).length, 'station')].filter(Boolean).join(', ')}</span>
                  </span>
                  <ChevronRightIcon className="saved__chev" />
                </Link>
                {editing && <RemoveButton name={name} onClick={() => remove(`rivers/${encodeURIComponent(river.stationId)}`, river.stationId)} />}
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
