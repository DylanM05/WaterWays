// The river (or lake) a station measures, split from its name the way the server does
// (Server/utilities/riverNames.js), so the back link opens the same river page the province list does.
// "FRASER RIVER AT HOPE" -> "FRASER RIVER". Keep the two in step.
const LOCATION_WORD = String.raw`(?:NEAR|NR|ABOVE|ABV|AB|BELOW|BLW|BL|AT|IN|UPSTREAM|DOWNSTREAM|(?:NORTH|SOUTH)?(?:NORTH|SOUTH|EAST|WEST)\s+OF|[NSEW]\.?\s+OF)`;
const DISTANCE = String.raw`(?:\d+(?:\.\d+)?\s*(?:KMS?|MILES?|MI|M)\b\.?\s+)`;
const FRENCH_LOCATION = String.raw`(?<=\))\s+(?:A|AU|AUX)\b`;
const LOCATION_PATTERN = new RegExp(String.raw`^(.*?)(?:\s+${DISTANCE}?${LOCATION_WORD}\b|${FRENCH_LOCATION})`, 'i');

export function riverOfStation(stationName) {
  const name = String(stationName || '').trim();
  return name.match(LOCATION_PATTERN)?.[1].trim() || name;
}
