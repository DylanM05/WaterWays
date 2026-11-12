import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import SavedCard from '../stations/SavedCard';
import { fetchStationSummaries } from '../utility/stationSummaries';

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
