import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { useSettings, normalizeDefaultTab, STATION_TABS } from '../components/utility/contexts/SettingsContext';
import Spinner from '../components/spinners/Spinner';
import StationInfo from '../components/tabs/StationInfo';
import WaterData from '../components/tabs/WaterData';
import WeatherTab from '../components/station/WeatherTab';
import WeatherAlerts from '../components/tabs/WeatherAlerts';
import HistoryTab from '../components/tabs/HistoryTab';
import { riverOfStation } from '../components/station/stationNames';
import { parseUtcTimestamp } from '../components/utility/dates';
import { displayTitle } from '../components/utility/names';
import { timeAgo } from '../components/utility/readings';
import { ChevronLeftIcon, HeartFilledIcon, HeartIcon, ShareIcon } from '../components/icons/Icons';
import './styling/stationDetails.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TAB_LABELS = { water: 'Water', weather: 'Weather', history: 'History', map: 'Map' };

// Thirty days of readings per station, kept while the app is open so switching tabs or coming back is instant.
const READINGS_CACHE = {};

/** The past 30 days of readings, oldest first, each with its time in ms. */
function useReadings(stationId) {
  const [state, setState] = useState({ readings: READINGS_CACHE[stationId] || null, loading: !READINGS_CACHE[stationId], error: false });

  const load = useCallback(() => {
    let cancelled = false;
    if (READINGS_CACHE[stationId]) {
      setState({ readings: READINGS_CACHE[stationId], loading: false, error: false });
      return () => {};
    }
    setState({ readings: null, loading: true, error: false });
    axios.get(`${API_BASE_URL}/details/water-data/${stationId}/30`)
      .then(({ data }) => {
        const readings = (data || [])
          .map(entry => ({ ...entry, time: parseUtcTimestamp(entry.date_time).getTime() }))
          .filter(entry => Number.isFinite(entry.time))
          .sort((a, b) => a.time - b.time);
        READINGS_CACHE[stationId] = readings;
        if (!cancelled) setState({ readings, loading: false, error: false });
      })
      .catch(error => {
        console.error('Error loading readings:', error);
        if (!cancelled) setState({ readings: null, loading: false, error: true });
      });
    return () => { cancelled = true; };
  }, [stationId]);

  useEffect(() => load(), [load]);
  return { ...state, retry: load };
}

/** One GET whose result, or failure, the page shows; null while loading. */
function useResource(url, transform) {
  const [state, setState] = useState({ data: null, error: null });
  const transformRef = useRef(transform);
  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null });
    axios.get(url)
      .then(({ data }) => { if (!cancelled) setState({ data: transformRef.current ? transformRef.current(data) : data, error: null }); })
      .catch(error => {
        console.error(`Error loading ${url}:`, error);
        if (!cancelled) setState({ data: null, error: true });
      });
    return () => { cancelled = true; };
  }, [url]);
  return state;
}

/** Whether the station is saved, and saving it: sign-in for visitors, Premium for members without it. */
function useSavedStation(stationId, stationInfo) {
  const { isSignedIn, getToken } = useAuth();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // null until known, so a member's click isn't sent to Premium while their status loads.
  const [subscribed, setSubscribed] = useState(null);

  useEffect(() => {
    if (!isSignedIn) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [favourite, subscription] = await Promise.all([
          axios.get(`${API_BASE_URL}/u/favorites/check/${stationId}`, { headers }).then(r => r.data).catch(() => ({ isFavorite: false })),
          axios.get(`${API_BASE_URL}/sub/status`, { headers }).then(r => r.data).catch(() => ({ subscribed: false }))
        ]);
        if (cancelled) return;
        setSaved(Boolean(favourite.isFavorite));
        setSubscribed(Boolean(subscription.subscribed));
      } catch (error) {
        console.error('Error checking saved station:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, stationId, getToken]);

  const toggle = async () => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    if (subscribed === false) {
      navigate(`/pricing?station=${encodeURIComponent(stationId)}`);
      return;
    }
    try {
      setBusy(true);
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (saved) {
        await axios.delete(`${API_BASE_URL}/u/favorites/${stationId}`, { headers });
      } else {
        await axios.post(`${API_BASE_URL}/u/favorites`, {
          stationId,
          stationName: stationInfo?.stationName || `Station ${stationId}`,
          province: stationInfo?.province || 'Unknown'
        }, { headers });
      }
      setSaved(!saved);
    } catch (error) {
      console.error('Error saving station:', error);
    } finally {
      setBusy(false);
    }
  };

  return { saved, busy: busy || (isSignedIn && subscribed === null), toggle };
}

const ShareButton = ({ title, className }) => {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* closed without sharing */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying link:', error);
    }
  };
  return (
    <button type="button" className={className} onClick={share} aria-label="Share">
      <ShareIcon />
      <span className="st-copied" role="status">{copied ? 'Link copied' : ''}</span>
    </button>
  );
};

const StationDetails = () => {
  const { stationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useSettings();

  // ?tab= opens a tab directly; otherwise the default from Settings.
  const requested = searchParams.get('tab');
  const tab = STATION_TABS.includes(requested) ? requested : normalizeDefaultTab(settings.defaultTab);
  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const station = useResource(`${API_BASE_URL}/details/coordinates/${stationId}`);
  const readings = useReadings(stationId);
  const weather = useResource(`${API_BASE_URL}/details/weather/${stationId}`);
  const forecast = useResource(`${API_BASE_URL}/details/weather/hourly/${stationId}`);
  const weekly = useResource(`${API_BASE_URL}/details/weather/weekly/${stationId}`);
  const pressure = useResource(`${API_BASE_URL}/details/pressure/${stationId}`);
  const alerts = useResource(`${API_BASE_URL}/details/alerts/${stationId}`, (data) => data?.alerts || []);
  const save = useSavedStation(stationId, station.data);

  if (station.error) {
    return (
      <div className="page">
        <Link to="/" className="ww-back"><ChevronLeftIcon />Explore</Link>
        <div className="ww-empty st-missing">
          <b>Couldn’t load station {stationId}</b>
          <span>Check the link, or your connection, and refresh to try again.</span>
        </div>
      </div>
    );
  }
  if (!station.data) return <Spinner message="Loading station…" />;

  const stationName = station.data.stationName || `Station ${stationId}`;
  const title = displayTitle(stationName);
  const river = riverOfStation(stationName);
  const latest = readings.readings?.[readings.readings.length - 1];
  const updated = latest ? new Date(latest.time) : null;

  const saveButton = (round) => (
    <button
      type="button"
      className={round ? `st-round${save.saved ? ' is-on' : ''}` : `ww-btn ${save.saved ? 'ww-btn--soft' : ''}`}
      onClick={save.toggle}
      disabled={save.busy}
      aria-pressed={save.saved}
      aria-label={round ? (save.saved ? 'Saved' : 'Save station') : undefined}
    >
      {save.saved ? <HeartFilledIcon /> : <HeartIcon />}
      {!round && (save.saved ? 'Saved' : 'Save station')}
    </button>
  );

  return (
    <div className="page st">
      {/* Phones: a compact bar with round buttons, as in the iPhone app. */}
      <div className="st-phonebar">
        <Link to={`/river/${encodeURIComponent(river)}`} className="st-round" aria-label={`Back to ${displayTitle(river)}`}><ChevronLeftIcon /></Link>
        <div className="st-phonebar__title">
          <b>{title}</b>
          <span className="mono">{stationId}</span>
        </div>
        {saveButton(true)}
      </div>

      <header className="st-head">
        <Link to={`/river/${encodeURIComponent(river)}`} className="ww-back"><ChevronLeftIcon />{displayTitle(river)}</Link>
        <div className="st-head__row">
          <div>
            <h1 className="disp st-head__title">{title}</h1>
            <div className="st-head__meta">
              <span className="st-id mono">{stationId}</span>
              {updated && <span>Updated {timeAgo(updated)}</span>}
            </div>
          </div>
          <div className="st-head__acts">
            <ShareButton title={title} className="ww-btn ww-btn--ghost ww-btn--icon" />
            {saveButton(false)}
          </div>
        </div>
      </header>

      <WeatherAlerts alerts={alerts.data} />

      <div className="st-tabs" role="tablist" aria-label="Station">
        {STATION_TABS.map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`st-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="st-panel"
            className={tab === key ? 'is-on' : undefined}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div id="st-panel" role="tabpanel" aria-labelledby={`st-tab-${tab}`}>
        {tab === 'water' && (
          <WaterData
            readings={readings.readings}
            loading={readings.loading}
            error={readings.error}
            onRetry={readings.retry}
            weatherData={weather.data}
            forecastData={forecast.data}
            weeklyData={weekly.data}
            onOpenWeather={() => setTab('weather')}
          />
        )}
        {tab === 'weather' && (
          <WeatherTab
            weatherData={weather.data}
            forecastData={forecast.data}
            weeklyData={weekly.data}
            pressureData={pressure.data}
            errors={{ weather: weather.error, forecast: forecast.error, weekly: weekly.error, pressure: pressure.error }}
            loading={{
              weather: !weather.data && !weather.error,
              forecast: !forecast.data && !forecast.error,
              weekly: !weekly.data && !weekly.error,
              pressure: !pressure.data && !pressure.error
            }}
          />
        )}
        {tab === 'history' && <HistoryTab stationId={stationId} />}
        {tab === 'map' && <StationInfo stationInfo={station.data} />}
      </div>
    </div>
  );
};

export default StationDetails;
