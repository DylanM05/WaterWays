import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth, useClerk } from '@clerk/clerk-react';
import Spinner from '../components/spinners/Spinner';
import { ChevronLeftIcon, HeartFilledIcon, HeartIcon, ShareIcon } from '../components/icons/Icons';
import { fetchStationSummaries } from '../components/utility/stationSummaries';
import { displayTitle, PROVINCE_NAMES } from '../components/utility/names';
import { describeRow, sectionName, shortLastReported } from '../components/river/riverRows';
import { useRiverAlerts } from '../components/river/useRiverAlerts';
import RiverAlerts from '../components/river/RiverAlerts';
import { RiverStationList, RiverStationTable } from '../components/river/RiverStations';
import './styling/river.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * The river's stations. The province page passes its rivers; a river opened directly (a link
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
  const navigate = useNavigate();
  const { stations, failed } = useRiverStations(rivers, riverName);
  const alerts = useRiverAlerts(stations);
  const [summaries, setSummaries] = useState({});
  const [favorites, setFavorites] = useState({});
  const [favoriteLoading, setFavoriteLoading] = useState({});
  const [savedRivers, setSavedRivers] = useState([]);
  const [riverSaving, setRiverSaving] = useState(false);
  const [riverSaveError, setRiverSaveError] = useState(null);
  // null until known, so a subscriber's click isn't sent to the pricing page while it loads.
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [shareNote, setShareNote] = useState(null);
  const { isSignedIn, getToken } = useAuth();
  const { openSignIn } = useClerk();

  useEffect(() => {
    if (!stations?.length) return undefined;
    let cancelled = false;
    const stationIds = stations.map(station => station.station_id);
    setSummaries({});
    fetchStationSummaries(stationIds)
      .then(result => { if (!cancelled) setSummaries(result); })
      .catch(error => {
        console.error('Error loading latest readings:', error);
        // Stop the spinner and say so, rather than showing every station as not reporting.
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
        // One request for all of the user's saved stations and rivers, instead of one check per station.
        const [records, subscription] = await Promise.all([
          axios.get(`${API_BASE_URL}/u/favorites`, { headers, params: { includeRivers: true } }).then(response => response.data),
          axios.get(`${API_BASE_URL}/sub/status`, { headers }).then(response => response.data).catch(() => ({ subscribed: false }))
        ]);
        if (cancelled) return;
        const saved = new Set(records.filter(record => record.favoriteType !== 'river').map(record => record.stationId));
        setFavorites(Object.fromEntries(stations.map(station => [station.station_id, saved.has(station.station_id)])));
        setSavedRivers(records.filter(record => record.favoriteType === 'river'));
        setSubscriptionStatus(subscription);
      } catch (error) {
        console.error('Error loading saved stations:', error);
        if (!cancelled) setSubscriptionStatus(prev => prev || { subscribed: false });
      }
    })();
    return () => { cancelled = true; };
  }, [isSignedIn, stations, getToken]);

  useEffect(() => {
    if (!shareNote) return undefined;
    const timer = setTimeout(() => setShareNote(null), 2200);
    return () => clearTimeout(timer);
  }, [shareNote]);

  const toggleFavorite = async (stationId) => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    if (!subscriptionStatus) return;
    if (!subscriptionStatus.subscribed) {
      navigate(`/pricing?station=${encodeURIComponent(stationId)}`);
      return;
    }
    const station = stations.find(item => item.station_id === stationId);
    try {
      setFavoriteLoading(prev => ({ ...prev, [stationId]: true }));
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (favorites[stationId]) {
        await axios.delete(`${API_BASE_URL}/u/favorites/${stationId}`, { headers });
      } else {
        await axios.post(`${API_BASE_URL}/u/favorites`, {
          stationId,
          stationName: station.stationName || station.section || `Station ${stationId}`,
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

  // Rivers are saved per province, as in the iOS app; a river in two provinces is saved as two.
  const riverRecords = savedRivers.filter(record =>
    record.riverName?.toLowerCase() === riverName.toLowerCase() && provinces.includes(record.province));
  const riverSaved = provinces.length > 0 && provinces.every(province => riverRecords.some(record => record.province === province));

  const toggleRiver = async () => {
    try {
      setRiverSaving(true);
      setRiverSaveError(null);
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      if (riverSaved) {
        await Promise.all(riverRecords.map(record =>
          axios.delete(`${API_BASE_URL}/u/favorites/rivers/${encodeURIComponent(record.stationId)}`, { headers })));
        const removed = new Set(riverRecords.map(record => record.stationId));
        setSavedRivers(prev => prev.filter(record => !removed.has(record.stationId)));
      } else {
        const missing = provinces.filter(province => !riverRecords.some(record => record.province === province));
        const added = await Promise.all(missing.map(province => axios.post(`${API_BASE_URL}/u/favorites/rivers`, {
          riverName,
          province,
          stations: stations.filter(station => station.province === province).map(station => ({
            stationId: station.station_id,
            stationName: station.stationName,
            province: station.province,
            latitude: station.latitude ?? null,
            longitude: station.longitude ?? null,
            section: station.section ?? null
          }))
        }, { headers }).then(response => response.data.favorite)));
        setSavedRivers(prev => [...prev, ...added]);
      }
    } catch (error) {
      console.error('Error saving river:', error);
      setRiverSaveError('Couldn’t update your saved rivers. Please try again.');
    } finally {
      setRiverSaving(false);
    }
  };

  const saveRiver = () => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    if (!subscriptionStatus) return;
    if (subscriptionStatus.subscribed) toggleRiver();
    else navigate('/pricing');
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // Closing the share sheet is not an error worth showing.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied');
    } catch {
      setShareNote('Couldn’t copy the link');
    }
  };

  const loaded = stations?.length > 0 && Object.keys(summaries).length > 0;
  const readingsFailed = loaded && Object.values(summaries).some(summary => summary.failed);

  const rows = useMemo(() => (stations || []).map(station => ({
    id: station.station_id,
    name: sectionName(station, riverName),
    province: station.province,
    // The catalogue marks stations that have no real-time feed.
    realtime: station.realtime !== false,
    row: describeRow(summaries[station.station_id])
  })), [stations, summaries, riverName]);
  // When the readings didn't load, every station stays in the table rather than being called not reporting.
  const reporting = readingsFailed ? rows : rows.filter(item => item.row.reading);
  const quiet = loaded && !readingsFailed ? rows.filter(item => !item.row.reading) : [];
  const reportingIds = new Set(reporting.map(item => item.id));

  const firstProvince = provinces[0];
  const back = firstProvince && PROVINCE_NAMES[firstProvince]
    ? { to: `/province/${firstProvince.toLowerCase()}`, label: PROVINCE_NAMES[firstProvince] }
    : { to: '/', label: 'Explore' };

  let meta = null;
  if (stations?.length) {
    meta = `${stations.length} ${stations.length === 1 ? 'station' : 'stations'}`;
    if (loaded && !readingsFailed) meta += `, ${reporting.length} reporting`;
  }

  const hasStations = stations?.length > 0;
  const saveDisabled = riverSaving || (isSignedIn && !subscriptionStatus);
  const saveLabel = riverSaved ? `Remove ${title} from saved` : `Save ${title}`;
  const note = shareNote && <span className="river__note" role="status">{shareNote}</span>;

  let body;
  if (stations === null) {
    body = <Spinner message="Loading stations…" />;
  } else if (stations.length === 0) {
    body = failed ? (
      <div className="ww-empty">
        <b>Couldn’t load {title}</b>
        <span>Check your connection and refresh to try again.</span>
      </div>
    ) : (
      <div className="ww-empty">
        <b>No stations found on {title}</b>
        <span>Search for the river by another name, or browse its province.</span>
      </div>
    );
  } else if (!loaded) {
    body = <Spinner message="Loading readings…" />;
  } else {
    body = (
      <>
        {readingsFailed && (
          <div className="ww-empty">
            <b>Couldn’t load the latest readings</b>
            <span>Check your connection and refresh to try again.</span>
          </div>
        )}
        {reporting.length > 0 && (
          <>
            {/* Signed-out visitors see the hearts too; tapping one asks them to sign in. */}
            <RiverStationTable
              rows={reporting}
              saved={favorites}
              saving={favoriteLoading}
              onSave={toggleFavorite}
              showProvince={provinces.length > 1}
            />
            <RiverStationList rows={reporting} saved={favorites} saving={favoriteLoading} onSave={toggleFavorite} />
          </>
        )}
        {quiet.length > 0 && <QuietStations stations={quiet} summaries={summaries} />}
      </>
    );
  }

  return (
    <div className="page river">
      {/* Phones get the iOS app's round buttons in place of the back link and header actions. */}
      <div className="river__bar">
        <Link to={back.to} className="river__round" aria-label={`Back to ${back.label}`}><ChevronLeftIcon /></Link>
        {note}
        <button type="button" className="river__round" onClick={share} aria-label={`Share ${title}`}><ShareIcon /></button>
        {hasStations && (
          <button
            type="button"
            className={`river__round${riverSaved ? ' is-on' : ''}`}
            onClick={saveRiver}
            disabled={saveDisabled}
            aria-label={saveLabel}
            aria-pressed={riverSaved}
          >
            {riverSaved ? <HeartFilledIcon /> : <HeartIcon />}
          </button>
        )}
      </div>

      <div className="river__back-row">
        {stations !== null && <Link to={back.to} className="ww-back"><ChevronLeftIcon />{back.label}</Link>}
      </div>
      <header className="river__head">
        <div>
          <h1 className="disp river__title">{title}</h1>
          {meta && <p className="river__meta">{meta}</p>}
        </div>
        <div className="river__acts">
          {note}
          <button type="button" className="ww-btn ww-btn--ghost ww-btn--icon" onClick={share} aria-label={`Share ${title}`}><ShareIcon /></button>
          {hasStations && (
            <button
              type="button"
              className={`ww-btn${riverSaved ? ' ww-btn--soft' : ''}`}
              onClick={saveRiver}
              disabled={saveDisabled}
              aria-pressed={riverSaved}
            >
              {riverSaved ? <HeartFilledIcon /> : <HeartIcon />}
              {riverSaved ? 'Saved' : 'Save river'}
            </button>
          )}
        </div>
      </header>
      {riverSaveError && <p className="river__error" role="alert">{riverSaveError}</p>}

      <RiverAlerts alerts={alerts} preferredIds={reportingIds} />
      {body}
    </div>
  );
};

/**
 * Stations without a recent reading, below the table: those with a real-time feed that has gone quiet, with
 * the day each last reported, and those with no real-time feed at all.
 */
const QuietStations = ({ stations, summaries }) => {
  const groups = [
    ['No recent readings', stations.filter(station => station.realtime), true],
    ['No live readings', stations.filter(station => !station.realtime), false]
  ].filter(([, list]) => list.length);

  return (
    <div className="river-quiet">
      {groups.map(([label, list, dated]) => (
        <p key={label}>
          {label}:{' '}
          {list.map(({ id, name }, index) => {
            const last = dated && summaries[id]?.lastReported;
            return (
              <React.Fragment key={id}>
                {index > 0 && ', '}
                <span className="river-quiet__station">
                  <Link to={`/station-details/${encodeURIComponent(id)}`}>{name}</Link>
                  {last && <span className="faint"> {shortLastReported(last)}</span>}
                </span>
              </React.Fragment>
            );
          })}
        </p>
      ))}
    </div>
  );
};

export default RiverSections;
