// The river (or lake) a station measures, split from its name the way the server does
// (Server/utilities/riverNames.js), so the back link opens the same river page the province list does.
// "FRASER RIVER AT HOPE" -> "FRASER RIVER". Keep the two in step.
const LOCATION_WORD = String.raw`(?:NEAR|NR|ABOVE|ABV|AB|BELOW|BLW|BL|AT|IN|UPSTREAM|DOWNSTREAM|(?:NORTH|SOUTH)?(?:NORTH|SOUTH|EAST|WEST)\s+OF|[NSEW]\.?\s+OF)`;
const DISTANCE = String.raw`(?:\d+(?:\.\d+)?\s*(?:KMS?|MILES?|MI|M)\b\.?\s+)`;
// Quebec names put the waterbody type in brackets and the location after "A"/"AU"/"AUX":
// "RICHELIEU (RIVIERE) A LA MARINA DE SAINT-JEAN". The server matches these with a lookbehind, which Safari
// before 16.4 can't parse, so here it's a second pattern and the earlier match wins.
const LOCATION_PATTERN = new RegExp(String.raw`^(.*?)\s+${DISTANCE}?${LOCATION_WORD}\b`, 'i');
const FRENCH_PATTERN = /^(.*?\))\s+(?:A|AU|AUX)\b/i;

export function riverOfStation(stationName) {
  const name = String(stationName || '').trim();
  const candidates = [name.match(LOCATION_PATTERN)?.[1], name.match(FRENCH_PATTERN)?.[1]]
    .filter(river => river?.trim());
  if (!candidates.length) return name;
  return candidates.reduce((first, river) => (river.length < first.length ? river : first)).trim();
}
