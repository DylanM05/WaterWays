import React, { useState, useEffect } from 'react';
import { Alert, Spinner } from 'react-bootstrap';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { FaTrash, FaExclamationCircle } from 'react-icons/fa';
import axios from 'axios';
import StationCard from '../components/stations/StationCard';
import { fetchStationSummaries } from '../components/utility/stationSummaries';
import { displayTitle } from '../components/utility/names';
import { parseLongDateTime } from '../components/utility/dates';
import { pressureNow, pressureTendency } from '../components/utility/pressure';
import { alertColours, alertTitle } from '../components/utility/alertColours';
import { useSettings } from '../components/utility/contexts/SettingsContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Station name, current weather, pressure series and active alerts; each is null if its request failed.
async function fetchStationWeather(stationId) {
  const get = (path) => axios.get(`${API_BASE_URL}${path}`).then(response => response.data).catch(() => null);
  const [info, weather, pressure, alerts] = await Promise.all([
    get(`/details/coordinates/${stationId}`),
    get(`/details/weather/${stationId}`),
    get(`/details/pressure/${stationId}`),
    get(`/details/alerts/${stationId}`)
  ]);
  // The pressure series is in GMT; pressureNow wants each hour as an instant.
  const hours = (pressure?.time || []).map((time, index) => ({
    time: parseLongDateTime(time, { utc: true })?.getTime() ?? NaN,
    msl: pressure.pressureMsl?.[index] ?? null
  })).filter(hour => Number.isFinite(hour.time));
  return { info, weather, pressure: pressureNow(hours), alerts: alerts?.alerts || [] };
}

const WeatherStrip = ({ details }) => {
  const { formatTemperature } = useSettings();
  if (!details) {
    return <div className="station-weather"><Spinner animation="border" size="sm" style={{ color: 'var(--text-colour)' }} /></div>;
  }
  const { weather, pressure } = details;
  if (!weather && !pressure) return null;
  const change = pressure?.change3h;
  return (
    <div className="station-weather">
      <div>
        <div className="station-metric__label">Weather</div>
        <div className="station-weather__value">{weather ? formatTemperature(weather.temperature) : '—'}</div>
        {weather && <div className="station-weather__detail">{weather.weather}</div>}
      </div>
      <div>
        <div className="station-metric__label">Wind</div>
        <div className="station-weather__value">{weather ? `${Math.round(weather.wind)} km/h` : '—'}</div>
        {weather && (
          <div className="station-weather__detail">
            {[weather.windDirection, weather.windGusts != null && `gusts ${Math.round(weather.windGusts)}`].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
      <div>
        <div className="station-metric__label">Pressure</div>
        <div className="station-weather__value">{pressure ? `${Math.round(pressure.current.msl)} hPa` : '—'}</div>
        {change != null && (
          <div className="station-weather__detail" title={`${change > 0 ? '+' : ''}${change.toFixed(1)} hPa in 3 hours`}>
            {Math.abs(change) >= 0.5 && <span aria-hidden="true">{change > 0 ? '▲ ' : '▼ '}</span>}
            {pressureTendency(change)}
          </div>
        )}
      </div>
    </div>
  );
};

/** The saved stations' cards: readings for all of them in one request, and weather per station. */
export const FavouriteStations = ({ favorites, onRemove }) => {
  const [summaries, setSummaries] = useState({});
  const [stationDetails, setStationDetails] = useState({});

  // Each card fills in as its weather arrives.
  useEffect(() => {
    if (!favorites.length) return undefined;
    let cancelled = false;
    const stationIds = favorites.map(favorite => favorite.stationId);
    fetchStationSummaries(stationIds)
      .then(result => { if (!cancelled) setSummaries(result); })
      .catch(err => {
        console.error('Error loading latest readings:', err);
        if (!cancelled) setSummaries(Object.fromEntries(stationIds.map(id => [id, { failed: true }])));
      });
    stationIds.forEach(stationId => {
      fetchStationWeather(stationId).then(details => {
        if (!cancelled) setStationDetails(prev => ({ ...prev, [stationId]: details }));
      });
    });
    return () => { cancelled = true; };
  }, [favorites]);

  return (
    <div className="station-grid">
      {favorites.map(favorite => {
        const stationId = favorite.stationId;
        const details = stationDetails[stationId];
        const stationName = displayTitle(details?.info?.stationName || favorite.stationName);
        return (
          <StationCard
            key={stationId}
            stationId={stationId}
            title={stationName}
            meta={`${favorite.province} · ${stationId}`}
            summary={summaries[stationId]}
            realtime={details?.info?.realtime}
            action={(
              <button
                type="button"
                className="station-card__icon-button station-card__icon-button--danger"
                onClick={() => onRemove(stationId, stationName)}
                aria-label={`Remove ${stationName} from favourites`}
              >
                <FaTrash size={14} />
              </button>
            )}
          >
            {details?.alerts?.length > 0 && (
              <div className="station-alerts">
                {details.alerts.map(alert => {
                  const { background, text } = alertColours(alert);
                  return (
                    <span key={`${alert.name}|${alert.issued}`} className="station-alert" style={{ backgroundColor: background, color: text }}>
                      ⚠ {alertTitle(alert.name)}
                    </span>
                  );
                })}
              </div>
            )}
            <WeatherStrip details={details} />
          </StationCard>
        );
      })}
    </div>
  );
};

const Favorites = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchFavorites = async () => {
      if (!isLoaded || !isSignedIn) return;
      try {
        setLoading(true);
        const token = await getToken();
        const response = await axios.get(`${API_BASE_URL}/u/favorites`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFavorites(response.data);
      } catch (err) {
        setError('Failed to load favourites');
        console.error('Error fetching favorites:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFavorites();
  }, [isLoaded, isSignedIn, getToken]);

  const removeFavorite = async (stationId, stationName) => {
    if (!window.confirm(`Remove "${stationName}" from favourites?`)) return;
    try {
      const token = await getToken();
      await axios.delete(`${API_BASE_URL}/u/favorites/${stationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFavorites(prev => prev.filter(favorite => favorite.stationId !== stationId));
    } catch (err) {
      setError('Failed to remove favourite');
      console.error('Error removing favorite:', err);
    }
  };

  if (!isLoaded) {
    return (
      <div className="text-center mt-5">
        <Spinner animation="border" role="status" style={{ color: 'var(--primary-colour)' }}>
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" />;
  }

  return (
    <div className="station-page">
      <header className="station-page__header">
        <h1 className="station-page__title">Favourites</h1>
        {!loading && favorites.length > 0 && (
          <p className="station-page__subtitle">{favorites.length} saved station{favorites.length === 1 ? '' : 's'}</p>
        )}
      </header>

      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          <FaExclamationCircle /> {error}
        </Alert>
      )}

      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" role="status" style={{ color: 'var(--primary-colour)' }}>
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      ) : favorites.length === 0 ? (
        <div className="station-page__empty">
          You haven’t saved any stations yet. Tap the heart on a station to save it here.
        </div>
      ) : (
        <FavouriteStations favorites={favorites} onRemove={removeFavorite} />
      )}
    </div>
  );
};

export default Favorites;
