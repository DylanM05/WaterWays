// Station names are "<waterbody> <location>", e.g. "LITTLE QUALICUM RIVER NEAR QUALICUM BEACH" or
// "CHURCHILL RIVER 6.15 KMS BELOW LOWER MUSKRAT FALLS". The location starts at the first of these words.
// BY, TO, ON, AUX and OUTLET are left out on purpose: they also appear inside waterbody names
// ("COME BY CHANCE RIVER", "TRIBUTARY TO REID BROOK", "ISLE AUX MORTS RIVER", "KEARL LAKE OUTLET").
const LOCATION_WORD = String.raw`(?:NEAR|NR|ABOVE|ABV|AB|BELOW|BLW|BL|AT|IN|UPSTREAM|DOWNSTREAM|(?:NORTH|SOUTH)?(?:NORTH|SOUTH|EAST|WEST)\s+OF|[NSEW]\.?\s+OF)`;
const DISTANCE = String.raw`(?:\d+(?:\.\d+)?\s*(?:KMS?|MILES?|MI|M)\b\.?\s+)`;
// Quebec names put the waterbody type in brackets and the location after "A"/"AU"/"AUX":
// "RICHELIEU (RIVIERE) A LA MARINA DE SAINT-JEAN".
const FRENCH_LOCATION = String.raw`(?<=\))\s+(?:A|AU|AUX)\b`;

const LOCATION_PATTERN = new RegExp(String.raw`^(.*?)(?:\s+${DISTANCE}?${LOCATION_WORD}\b|${FRENCH_LOCATION})`, 'i');

// Splits a station name into the river (or lake) it measures and the station's place along it.
function splitStationName(stationName) {
  const name = String(stationName || '').trim();
  const match = name.match(LOCATION_PATTERN);
  const riverName = match?.[1].trim();
  if (!riverName) return { riverName: name, section: '' };
  return { riverName, section: name.slice(match[1].length).trim() };
}

module.exports = { splitStationName };
