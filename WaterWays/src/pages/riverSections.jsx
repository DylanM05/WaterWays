import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import FavouritesSubscribeToast from '../components/toasts/subscriptionRequiredToast';
import StationCard from '../components/stations/StationCard';
import { fetchStationSummaries } from '../components/utility/stationSummaries';
import { displayTitle, PROVINCE_NAMES } from '../components/utility/names';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * The river's stations. The sidebar passes the selected province's rivers; a river opened directly (a link
 * or a refresh) is looked up instead, in every province that has a river by this name.
 */
function useRiverStations(rivers, riverName) {
  const [stations, setStations] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (rivers?.[riverName]) {
      setStations(rivers[riverName]);
      return undefined;
    }
    let cancelled = false;
    setStations(null);
    (async () => {
      try {
        const { data: matches } = await axios.get(`${API_BASE_URL}/search/search-all-rivers`, { params: { query: riverName } });
        const provinces = [...new Set(matches.filter(match => match.stationName === riverName).map(match => match.province))];
        const lists = await Promise.all(provinces.map(province => axios.get(`${API_BASE_URL}/details/rivers/${province.toLowerCase()}`)));
        if (!cancelled) setStations(lists.flatMap(({ data }) => data[riverName] || []));
      } catch (error) {
        console.error('Error looking up river:', error);
        if (!cancelled) {
          setStations([]);
          setFailed(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [rivers, riverName]);

  return { stations, failed };
}

const RiverSections = ({ rivers }) => {
  const { riverName } = useParams();
  const { stations, failed } = useRiverStations(rivers, riverName);
  const [summaries, setSummaries] = useState({});
  const [favorites, setFavorites] = useState({});
  const [favoriteLoading, setFavoriteLoading] = useState({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState({ subscribed: false });
  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!stations?.length) return undefined;
    let cancelled = false;
    const stationIds = stations.map(station => station.station_id);
    setSummaries({});
    fetchStationSummaries(stationIds)
      .then(result => { if (!cancelled) setSummaries(result); })
      .catch(error => {
        console.error('Error loading latest readings:', error);
        // Stop the spinners and say so, rather than showing every station as having no data.
        if (!cancelled) setSummaries(Object.fromEntries(stationIds.map(id => [id, { failed: true }])));
      });
    return () => { cancelled = true; };
  }, [stations]);

  useEffect(() => {
    if (!isSignedIn || !stations?.length) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        // One request for all of the user's saved stations, instead of one check per station.
        const [saved, subscription] = await Promise.all([
          axios.get(`${API_BASE_URL}/u/favorites`, { headers }).then(response => new Set(response.data.map(favorite => favorite.stationId))),
          axios.get(`${API_BASE_URL}/sub/status`, { headers }).then(response => response.data).catch(() => ({ subscribed: false }))
        ]);
        if (cancelled) return;
        setFavorites(Object.fromEntries(stations.map(station => [station.station_id, saved.has(station.station_id)])));
        setSubscriptionStatus(subscription);
      } catch (error) {
        console.error('Error loading saved stations:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, stations, getToken]);

  const toggleFavorite = async (station) => {
    const stationId = station.station_id;
    if (!subscriptionStatus.subscribed) {
      setToastMessage('You need a premium subscription to access favorites. Please upgrade your plan.');
      setShowToast(true);
      return;
    }
    try {
      setFavoriteLoading(prev => ({ ...prev, [stationId]: true }));
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (favorites[stationId]) {
        await axios.delete(`${API_BASE_URL}/u/favorites/${stationId}`, { headers });
      } else {
        await axios.post(`${API_BASE_URL}/u/favorites`, {
          stationId,
          stationName: station.section || `Station ${stationId}`,
          province: station.province || 'Unknown'
        }, { headers });
      }
      setFavorites(prev => ({ ...prev, [stationId]: !prev[stationId] }));
    } catch (error) {
      console.error('Error toggling favorite:', error);
    } finally {
      setFavoriteLoading(prev => ({ ...prev, [stationId]: false }));
    }
  };

  const title = displayTitle(riverName);
  const provinces = [...new Set((stations || []).map(station => station.province).filter(Boolean))];
  const loaded = stations?.length > 0 && Object.keys(summaries).length > 0;
  const reporting = (stations || []).filter(station => !loaded || summaries[station.station_id]?.reading);
  const quiet = loaded ? stations.filter(station => !summaries[station.station_id]?.reading) : [];

  const card = (station) => {
    const stationId = station.station_id;
    const saved = favorites[stationId];
    return (
      <StationCard
        key={stationId}
        stationId={stationId}
        title={station.section ? displayTitle(station.section) : displayTitle(station.stationName)}
        meta={provinces.length > 1 ? `${station.province} · ${stationId}` : stationId}
        summary={summaries[stationId]}
        realtime={station.realtime}
        action={isSignedIn && (
          <button
            type="button"
            className={`station-card__icon-button${saved ? ' station-card__icon-button--active' : ''}`}
            onClick={() => toggleFavorite(station)}
            disabled={favoriteLoading[stationId]}
            aria-label={saved ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={Boolean(saved)}
          >
            {saved ? <FaHeart size={16} /> : <FaRegHeart size={16} />}
          </button>
        )}
      />
    );
  };

  let subtitle = 'Loading stations…';
  if (stations?.length) {
    const count = `${stations.length} station${stations.length === 1 ? '' : 's'}`;
    const reportingNow = loaded ? ` · ${reporting.length} reporting now` : '';
    subtitle = `${provinces.map(province => PROVINCE_NAMES[province] || province).join(', ')} · ${count}${reportingNow}`;
  }

  return (
    <div className="station-page">
      <header className="station-page__header">
        <h1 className="station-page__title">{title}</h1>
        {stations?.length !== 0 && <p className="station-page__subtitle">{subtitle}</p>}
      </header>

      {stations === null ? (
        <div className="text-center py-4">
          <span className="spinner-border" role="status" aria-label="Loading stations" style={{ color: 'var(--primary-colour)' }} />
        </div>
      ) : stations.length === 0 ? (
        <div className="station-page__empty">
          {failed ? 'Couldn’t load this river. Check your connection and refresh to try again.' : 'No stations were found for this river.'}
        </div>
      ) : (
        <>
          <div className="station-grid">{reporting.map(card)}</div>
          {quiet.length > 0 && (
            <>
              <h2 className="station-page__section-title">Not reporting right now</h2>
              <div className="station-grid">{quiet.map(card)}</div>
            </>
          )}
        </>
      )}

      <FavouritesSubscribeToast
        showToast={showToast}
        setShowToast={setShowToast}
        toastMessage={toastMessage}
      />
    </div>
  );
};

export default RiverSections;
