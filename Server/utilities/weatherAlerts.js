const axios = require('axios');

// Environment Canada's active weather alerts (warnings, watches, advisories, statements), each with the
// polygon it covers. The whole national list is small, so it's fetched once every few minutes and stations
// are matched against it here, rather than asking the API once per station.
const ALERTS_URL = 'https://api.weather.gc.ca/collections/weather-alerts/items';
const CACHE_MS = 5 * 60 * 1000;
const PAGE_SIZE = 10000;
const SEVERITY = { warning: 0, watch: 1, advisory: 2, statement: 3 };

let cache = { fetchedAt: 0, features: null };
let pending = null;

async function fetchAlertFeatures() {
  const features = [];
  for (let offset = 0; ;) {
    const response = await axios.get(ALERTS_URL, { params: { f: 'json', limit: PAGE_SIZE, offset }, timeout: 30000 });
    const page = response.data?.features || [];
    features.push(...page);
    if (page.length < PAGE_SIZE) return features;
    offset += page.length;
  }
}

/** The current national alert list; if a refresh fails, the last list is used rather than none. */
async function activeAlertFeatures(now = Date.now()) {
  if (cache.features && now - cache.fetchedAt < CACHE_MS) return cache.features;
  if (!pending) {
    pending = fetchAlertFeatures()
      .then(features => {
        cache = { fetchedAt: Date.now(), features };
        return features;
      })
      .catch(error => {
        if (cache.features) {
          console.error('Weather alerts refresh failed; using the previous list:', error.message);
          return cache.features;
        }
        throw error;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

// Ray casting: is the point inside this ring of [longitude, latitude] pairs?
function insideRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if ((y1 > latitude) !== (y2 > latitude) && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

// A polygon's first ring is its outline; the rest are holes.
const insidePolygon = (longitude, latitude, [outline, ...holes]) =>
  Boolean(outline) && insideRing(longitude, latitude, outline) && !holes.some(hole => insideRing(longitude, latitude, hole));

function containsPoint(geometry, longitude, latitude) {
  if (geometry?.type === 'Polygon') return insidePolygon(longitude, latitude, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some(polygon => insidePolygon(longitude, latitude, polygon));
  return false;
}

/** Alerts in effect at a point, most severe first, one entry per alert even where its areas overlap. */
function alertsAt(features, longitude, latitude, now = Date.now()) {
  const alerts = new Map();
  for (const { properties = {}, geometry } of features) {
    const expires = Date.parse(properties.expiration_datetime);
    const status = String(properties.status_en || '').toLowerCase();
    if (Number.isFinite(expires) && expires <= now) continue;
    if (status.includes('end') || status.includes('cancel')) continue;
    if (!containsPoint(geometry, longitude, latitude)) continue;

    const key = `${properties.alert_code}|${properties.alert_name_en}|${properties.publication_datetime}`;
    if (alerts.has(key)) continue;
    alerts.set(key, {
      type: properties.alert_type || null,
      name: properties.alert_name_en || 'Weather alert',
      colour: properties.risk_colour_en || null,
      area: properties.feature_name_en || null,
      issued: properties.publication_datetime || null,
      expires: properties.expiration_datetime || null,
      eventEnds: properties.event_end_datetime || null,
      text: properties.alert_text_en || ''
    });
  }
  return [...alerts.values()].sort((a, b) =>
    (SEVERITY[a.type] ?? 9) - (SEVERITY[b.type] ?? 9) || String(b.issued).localeCompare(String(a.issued)));
}

function resetAlertCache() {
  cache = { fetchedAt: 0, features: null };
  pending = null;
}

module.exports = { activeAlertFeatures, alertsAt, containsPoint, resetAlertCache };
