// Environment Canada station numbers, such as 08MF005 (every listed station is two digits, two letters and
// three digits); the check allows a little more, as /details/water-records always has.
const STATION_ID = /^[A-Z0-9]{5,10}$/;

// The provinces and territories the apps list, as in scripts/syncStationCatalogue.js.
const PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);

/** The station number in upper case, or null when it can't be one. */
function normalizeStationId(value) {
  const id = String(value ?? '').toUpperCase();
  return STATION_ID.test(id) ? id : null;
}

/** Router param handler for :id: answers 400 for anything that isn't a station number. */
function stationIdParam(req, res, next, value) {
  const id = normalizeStationId(value);
  if (!id) return res.status(400).json({ error: 'Invalid station ID' });
  req.params.id = id;
  next();
}

module.exports = { PROVINCES, STATION_ID, normalizeStationId, stationIdParam };
