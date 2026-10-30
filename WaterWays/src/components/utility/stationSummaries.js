import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * The latest reading, last day and last-reported date of many stations, 100 per request. Returns
 * { stationId: { reading, trend, lastReported } }, with nulls where the server has nothing. Throws when a
 * request fails.
 */
export async function fetchStationSummaries(stationIds) {
  const summaries = Object.fromEntries(stationIds.map(id => [id, { reading: null, trend: null, lastReported: null }]));
  for (let start = 0; start < stationIds.length; start += 100) {
    const response = await axios.get(`${API_BASE_URL}/details/latest-water-data`, {
      params: { ids: stationIds.slice(start, start + 100).join(','), includeLastReported: true, includeTrend: true }
    });
    // Servers without these options send the readings map on its own, and older ones send no trends.
    const page = response.data || {};
    const isCombined = page.readings && typeof page.readings === 'object' && 'lastReported' in page;
    const fill = (values, field) => Object.entries(values || {}).forEach(([id, value]) => {
      if (summaries[id]) summaries[id][field] = value;
    });
    fill(isCombined ? page.readings : page, 'reading');
    if (isCombined) {
      fill(page.lastReported, 'lastReported');
      fill(page.trends, 'trend');
    }
  }
  return summaries;
}
