import { useEffect, useState } from 'react';
import axios from 'axios';
import { fetchStationSummaries } from '../utility/stationSummaries';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const MIN_LENGTH = 2;
const RIVER_LIMIT = 3;
const STATION_LIMIT = 5;

/**
 * Rivers and stations whose names match the query, after a pause in typing. Rivers come from the river
 * search (one result per river and province), stations from the station-name search; the stations shown
 * then get their latest reading. status is 'idle', 'searching', 'done' or 'failed'.
 */
export default function useRiverSearch(query) {
  const [state, setState] = useState({ status: 'idle', text: '', rivers: [], stations: [], summaries: {} });

  useEffect(() => {
    const text = query.trim();
    if (text.length < MIN_LENGTH) {
      setState({ status: 'idle', text: '', rivers: [], stations: [], summaries: {} });
      return undefined;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, status: 'searching' }));
    const timer = setTimeout(async () => {
      try {
        const [rivers, stations] = await Promise.all([
          axios.get(`${API_BASE_URL}/search/search-all-rivers`, { params: { query: text } }).then(r => r.data),
          axios.get(`${API_BASE_URL}/search/search`, { params: { query: text } }).then(r => r.data)
        ]);
        if (cancelled) return;
        const shownStations = (stations || []).slice(0, STATION_LIMIT);
        setState({ status: 'done', text, rivers: (rivers || []).slice(0, RIVER_LIMIT), stations: shownStations, summaries: {} });
        if (!shownStations.length) return;
        // Readings arrive a moment later; the rows show without them until then.
        const summaries = await fetchStationSummaries(shownStations.map(station => station.station_id)).catch(() => ({}));
        if (!cancelled) setState(prev => (prev.text === text ? { ...prev, summaries } : prev));
      } catch (error) {
        console.error('Error searching:', error);
        if (!cancelled) setState({ status: 'failed', text, rivers: [], stations: [], summaries: {} });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  return state;
}
