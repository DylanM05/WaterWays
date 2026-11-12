import {
  CloudIcon, FogIcon, MoonIcon, PartlyIcon, RainIcon, ShowersIcon, SnowIcon, StormIcon, SunIcon
} from '../icons/Icons';

// /details/weather/:id sends Open-Meteo's code as a long description ("Rain: Slight intensity"); a card has
// room for a word or two and an icon.
const SHORT = {
  'Clear sky': ['Clear', 'clear'],
  'Mainly clear': ['Mainly clear', 'clear'],
  'Partly cloudy': ['Partly cloudy', 'partly'],
  Overcast: ['Cloudy', 'cloud'],
  Fog: ['Fog', 'fog'],
  'Depositing rime fog': ['Freezing fog', 'fog'],
  'Drizzle: Light intensity': ['Light drizzle', 'rain'],
  'Drizzle: Moderate intensity': ['Drizzle', 'rain'],
  'Drizzle: Dense intensity': ['Heavy drizzle', 'rain'],
  'Freezing Drizzle: Light intensity': ['Freezing drizzle', 'rain'],
  'Freezing Drizzle: Dense intensity': ['Freezing drizzle', 'rain'],
  'Rain: Slight intensity': ['Light rain', 'rain'],
  'Rain: Moderate intensity': ['Rain', 'rain'],
  'Rain: Heavy intensity': ['Heavy rain', 'rain'],
  'Freezing Rain: Light intensity': ['Freezing rain', 'rain'],
  'Freezing Rain: Heavy intensity': ['Freezing rain', 'rain'],
  'Snow fall: Slight intensity': ['Light snow', 'snow'],
  'Snow fall: Moderate intensity': ['Snow', 'snow'],
  'Snow fall: Heavy intensity': ['Heavy snow', 'snow'],
  'Snow grains': ['Snow grains', 'snow'],
  'Rain showers: Slight intensity': ['Showers', 'showers'],
  'Rain showers: Moderate intensity': ['Showers', 'showers'],
  'Rain showers: Violent intensity': ['Heavy showers', 'showers'],
  'Snow showers: Slight intensity': ['Snow showers', 'snow'],
  'Snow showers: Heavy intensity': ['Snow showers', 'snow'],
  'Thunderstorm: Slight or moderate': ['Thunderstorm', 'storm'],
  'Thunderstorm with slight hail': ['Thunderstorm', 'storm'],
  'Thunderstorm with heavy hail': ['Thunderstorm', 'storm']
};

const ICONS = { partly: PartlyIcon, cloud: CloudIcon, fog: FogIcon, rain: RainIcon, showers: ShowersIcon, snow: SnowIcon, storm: StormIcon };

/** { label, Icon } for a current-weather response, or null when the description is unknown. */
export function weatherSummary(weather) {
  const match = SHORT[weather?.weather];
  if (!match) return null;
  const [label, kind] = match;
  const Icon = kind === 'clear' ? (weather.isDay === 0 ? MoonIcon : SunIcon) : ICONS[kind];
  return { label, Icon };
}

/** A whole-degree temperature in the user's unit, like "7°". */
export function formatDegrees(celsius, unit) {
  if (typeof celsius !== 'number') return null;
  const value = Math.round(unit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius);
  // A real minus sign; "-0" reads oddly.
  return `${value < 0 ? '−' : ''}${Math.abs(value)}°`;
}
