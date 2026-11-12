import { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Kept for the session; the counts only change when stations are added to the catalogue.
let cached = null;

/** Rivers and stations per province, as { BC: { rivers, stations } }; null until loaded or if it fails. */
export default function useProvinceCounts() {
  const [counts, setCounts] = useState(cached);

  useEffect(() => {
    if (cached) return undefined;
    let cancelled = false;
    axios.get(`${API_BASE_URL}/details/province-counts`)
      .then(({ data }) => {
        cached = data;
        if (!cancelled) setCounts(data);
      })
      // The tiles work without counts, so a failure only leaves them out.
      .catch(error => console.error('Error fetching province counts:', error));
    return () => { cancelled = true; };
  }, []);

  return counts;
}
