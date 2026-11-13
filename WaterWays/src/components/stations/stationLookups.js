import { useEffect, useState } from 'react';
import axios from 'axios';
import { alertSeverity, severityRank } from '../utility/alertColours';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** Current weather at a station, or null until it arrives (or if it fails). */
export function useCurrentWeather(stationId) {
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

// A Saved page can hold dozens of cards, so alert lookups go a few at a time. The server caches them for 5 min.
const ALERT_LOOKUPS_AT_ONCE = 4;
let alertLookups = 0;
const alertQueue = [];

function nextAlertLookup() {
  while (alertLookups < ALERT_LOOKUPS_AT_ONCE && alertQueue.length) {
    const { stationId, resolve } = alertQueue.shift();
    alertLookups += 1;
    axios.get(`${API_BASE_URL}/details/alerts/${encodeURIComponent(stationId)}`)
      .then(({ data }) => resolve(data?.alerts || []))
      .catch(() => resolve([]))
      .finally(() => {
        alertLookups -= 1;
        nextAlertLookup();
      });
  }
}

const lookUpAlerts = (stationId) => new Promise(resolve => {
  alertQueue.push({ stationId, resolve });
  nextAlertLookup();
});

/** Weather alerts covering a station, most severe first; [] until they arrive or if the lookup fails. */
export function useStationAlerts(stationId) {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    let cancelled = false;
    setAlerts([]);
    lookUpAlerts(stationId).then(found => {
      if (!cancelled) setAlerts([...found].sort((a, b) => severityRank(alertSeverity(a)) - severityRank(alertSeverity(b))));
    });
    return () => { cancelled = true; };
  }, [stationId]);
  return alerts;
}
