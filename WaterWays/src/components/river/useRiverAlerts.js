import { useEffect, useState } from 'react';
import axios from 'axios';
import { alertSeverity, alertTitle, severityRank } from '../utility/alertColours';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Alerts are looked up per station; a long river is sampled at this many places along it.
const MAX_LOOKUPS = 12;
const SEVERITY = { warning: 0, watch: 1, advisory: 2, statement: 3 };

/** Stations about 10 km apart or more, evenly spread when there are more than MAX_LOOKUPS. */
function lookupStations(stations) {
  const spots = new Map();
  stations.forEach(station => {
    const latitude = Number(station.latitude);
    const longitude = Number(station.longitude);
    const key = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${latitude.toFixed(1)},${longitude.toFixed(1)}`
      : station.station_id;
    if (!spots.has(key)) spots.set(key, station);
  });
  const unique = [...spots.values()];
  if (unique.length <= MAX_LOOKUPS) return unique;
  return Array.from({ length: MAX_LOOKUPS }, (_, index) => unique[Math.round((index * (unique.length - 1)) / (MAX_LOOKUPS - 1))]);
}

/**
 * Environment Canada alerts along the river, one entry per kind of alert ("Rainfall warning") with every area
 * it covers, when it ends, its severity and the stations it applies to. Most severe first. Failed lookups count as no alert.
 */
export function useRiverAlerts(stations) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    setAlerts([]);
    if (!stations?.length) return undefined;
    let cancelled = false;
    Promise.all(lookupStations(stations).map(station =>
      axios.get(`${API_BASE_URL}/details/alerts/${encodeURIComponent(station.station_id)}`)
        .then(({ data }) => ({ station, alerts: data?.alerts || [] }))
        .catch(() => ({ station, alerts: [] }))))
      .then(results => {
        if (cancelled) return;
        const groups = new Map();
        results.forEach(({ station, alerts: found }) => found.forEach(alert => {
          const key = `${alert.type}|${String(alert.name).toLowerCase()}`;
          if (!groups.has(key)) {
            groups.set(key, { key, type: alert.type, severity: alertSeverity(alert), title: alertTitle(alert.name || 'Weather alert'), areas: [], ends: null, stationIds: [] });
          }
          const group = groups.get(key);
          // One kind of alert can be more severe in some areas; the banner takes the worst.
          const severity = alertSeverity(alert);
          if (severityRank(severity) < severityRank(group.severity)) group.severity = severity;
          if (alert.area && !group.areas.includes(alert.area)) group.areas.push(alert.area);
          const ends = Date.parse(alert.eventEnds || alert.expires);
          if (Number.isFinite(ends) && (group.ends === null || ends > group.ends)) group.ends = ends;
          if (!group.stationIds.includes(station.station_id)) group.stationIds.push(station.station_id);
        }));
        setAlerts([...groups.values()].sort((a, b) =>
          severityRank(a.severity) - severityRank(b.severity) || (SEVERITY[a.type] ?? 9) - (SEVERITY[b.type] ?? 9)));
      });
    return () => { cancelled = true; };
  }, [stations]);

  return alerts;
}
