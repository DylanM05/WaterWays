import React from 'react';
import { useSettings } from '../utility/contexts/SettingsContext';
import { CloudIcon, FogIcon, MoonIcon, PartlyIcon, RainIcon, ShowersIcon, SnowIcon, StormIcon, SunIcon } from '../icons/Icons';
import CurrentWeather from '../tabs/CurrentWeather';
import HourlyForecast from '../tabs/HourlyForecast';
import WeeklyForecast from '../tabs/WeeklyForecast';
import PressureData from '../tabs/PressureData';
import './weatherTab.css';

const HOUR_MS = 60 * 60 * 1000;
const HOURLY_LIMIT = 48;

// Open-Meteo (WMO) weather codes: a short condition and the design's icon. Showers and partly cloudy
// skies draw a sun, so at night they use the plain rain and cloud icons.
const CONDITIONS = {
  0: ['Clear', 'clear'], 1: ['Mostly clear', 'clear'], 2: ['Partly cloudy', 'partly'], 3: ['Cloudy', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  56: ['Light freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Light freezing rain', 'rain'], 67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
  80: ['Light showers', 'showers'], 81: ['Showers', 'showers'], 82: ['Heavy showers', 'showers'],
  85: ['Light snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Thunderstorm with hail', 'storm']
};

// Current conditions arrive as the server's description rather than a code.
const SERVER_DESCRIPTIONS = {
  'Clear sky': 0, 'Mainly clear': 1, 'Partly cloudy': 2, Overcast: 3, Fog: 45, 'Depositing rime fog': 48,
  'Drizzle: Light intensity': 51, 'Drizzle: Moderate intensity': 53, 'Drizzle: Dense intensity': 55,
  'Freezing Drizzle: Light intensity': 56, 'Freezing Drizzle: Dense intensity': 57,
  'Rain: Slight intensity': 61, 'Rain: Moderate intensity': 63, 'Rain: Heavy intensity': 65,
  'Freezing Rain: Light intensity': 66, 'Freezing Rain: Heavy intensity': 67,
  'Snow fall: Slight intensity': 71, 'Snow fall: Moderate intensity': 73, 'Snow fall: Heavy intensity': 75, 'Snow grains': 77,
  'Rain showers: Slight intensity': 80, 'Rain showers: Moderate intensity': 81, 'Rain showers: Violent intensity': 82,
  'Snow showers: Slight intensity': 85, 'Snow showers: Heavy intensity': 86,
  'Thunderstorm: Slight or moderate': 95, 'Thunderstorm with slight hail': 96, 'Thunderstorm with heavy hail': 99
};

const iconFor = (kind, isDay) => {
  switch (kind) {
    case 'clear': return isDay ? SunIcon : MoonIcon;
    case 'partly': return isDay ? PartlyIcon : CloudIcon;
    case 'showers': return isDay ? ShowersIcon : RainIcon;
    case 'rain': return RainIcon;
    case 'snow': return SnowIcon;
    case 'fog': return FogIcon;
    case 'storm': return StormIcon;
    default: return CloudIcon;
  }
};

const condition = (code, isDay = true) => {
  const [label, kind] = CONDITIONS[code] || [null, 'cloud'];
  return { label, Icon: iconFor(kind, isDay) };
};

// A row's sky: the icon and the condition's name, kept apart from the row's own label ("4 pm", "Thu").
const sky = (code, isDay = true) => {
  const { label, Icon } = condition(code, isDay);
  return { Icon, condition: label };
};

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// "2026-11-12" -> "Thu"
const weekday = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
};

// Today's date where the station is, from the forecast's UTC offset.
const stationToday = (utcOffsetSeconds) => new Date(Date.now() + (utcOffsetSeconds ?? 0) * 1000).toISOString().slice(0, 10);

// "13 h" -> "1 pm"; the hours are the station's wall clock.
const hourLabel = (hour) => `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;

/**
 * The station's weather on one view: current conditions, the next two days by hour, pressure, and seven days.
 * Shapes the four API responses into what each card shows; the cards themselves only lay it out.
 */
const WeatherTab = ({ weatherData, forecastData, weeklyData, pressureData, errors = {}, loading = false }) => {
  const { settings, formatTemperature } = useSettings();
  const fahrenheit = settings?.temperatureUnit === 'fahrenheit';
  const toUnit = (celsius) => (fahrenheit ? celsius * 9 / 5 + 32 : celsius);
  const degrees = (celsius) => (isNumber(celsius) ? `${Math.round(toUnit(celsius))}°` : '–');

  // Seven days from the station's today.
  const today = weeklyData?.rawDates ? stationToday(weeklyData.utcOffsetSeconds) : null;
  const days = (weeklyData?.rawDates || [])
    .map((dateKey, index) => ({ dateKey, index }))
    .filter(({ dateKey }) => dateKey >= today);
  const todayIndex = days[0]?.dateKey === today ? days[0].index : null;
  const pick = (values, index) => (index === null || !values ? null : values[index] ?? null);

  let current = null;
  if (weatherData) {
    const isDay = Boolean(weatherData.isDay);
    const code = SERVER_DESCRIPTIONS[weatherData.weather];
    const { label, Icon } = condition(code, isDay);
    const high = pick(weeklyData?.temperature?.max, todayIndex);
    const low = pick(weeklyData?.temperature?.min, todayIndex);
    const gusts = isNumber(weatherData.windGusts) && weatherData.windGusts >= (weatherData.wind ?? 0) + 5
      ? `, gusts ${Math.round(weatherData.windGusts)}` : '';
    const rainTotal = pick(weeklyData?.precipitation?.total, todayIndex);
    const rainChance = pick(weeklyData?.precipitation?.probability, todayIndex);
    const precipitation = rainTotal === null && rainChance === null ? null
      : !rainTotal && !rainChance ? 'None expected'
        : [rainTotal ? `${rainTotal} mm` : null, rainChance ? `${rainChance}% chance` : null].filter(Boolean).join(', ');
    current = {
      Icon,
      condition: label || weatherData.weather || null,
      temperature: degrees(weatherData.temperature),
      exactTemperature: isNumber(weatherData.temperature) ? formatTemperature(weatherData.temperature) : null,
      highLow: isNumber(high) && isNumber(low) ? `High ${degrees(high)}, low ${degrees(low)}` : null,
      facts: [
        ['Feels like', isNumber(weatherData.apparentTemperature) ? degrees(weatherData.apparentTemperature) : null],
        ['Wind', isNumber(weatherData.wind) ? `${Math.round(weatherData.wind)} km/h ${weatherData.windDirection || ''}`.trim() + gusts : null],
        ['Humidity', isNumber(weatherData.humidity) ? `${weatherData.humidity}%` : null],
        ['Precipitation', precipitation],
        ['Sunrise', pick(weeklyData?.sun?.sunrise, todayIndex)],
        ['Sunset', pick(weeklyData?.sun?.sunset, todayIndex)]
      ].filter(([, value]) => value)
    };
  }

  // Hours from the one under way now. rawTime is the station's wall clock; less its UTC offset it's an instant.
  let hours = null;
  if (forecastData?.rawTime) {
    const now = Date.now();
    const offset = (forecastData.utcOffsetSeconds ?? 0) * 1000;
    hours = forecastData.rawTime
      .map((rawTime, index) => ({ rawTime, index, startsAt: Date.parse(`${rawTime}Z`) - offset }))
      .filter(({ startsAt }) => startsAt + HOUR_MS > now)
      .slice(0, HOURLY_LIMIT)
      .map(({ rawTime, index, startsAt }) => {
        const hour = Number(rawTime.slice(11, 13));
        const chance = forecastData.precipitationProbability?.[index];
        return {
          key: rawTime,
          now: startsAt <= now,
          // Midnight shows the new day instead of "12 am".
          label: startsAt <= now ? 'Now' : hour === 0 ? weekday(rawTime.slice(0, 10)) : hourLabel(hour),
          ...sky(forecastData.weatherCode?.[index], forecastData.isDay ? Boolean(forecastData.isDay[index]) : true),
          temperature: degrees(forecastData.temperature?.[index]),
          chance: isNumber(chance) && chance >= 10 ? `${chance}%` : null
        };
      });
  }

  // Each day's low-to-high bar sits on the week's scale.
  let week = null;
  if (weeklyData?.rawDates && days.length) {
    const lows = days.map(({ index }) => weeklyData.temperature?.min?.[index]).filter(isNumber);
    const highs = days.map(({ index }) => weeklyData.temperature?.max?.[index]).filter(isNumber);
    const scaleMin = Math.min(...lows, ...highs);
    const scaleMax = Math.max(...lows, ...highs);
    const span = scaleMax - scaleMin || 1;
    week = days.map(({ dateKey, index }) => {
      const low = weeklyData.temperature?.min?.[index];
      const high = weeklyData.temperature?.max?.[index];
      const chance = weeklyData.precipitation?.probability?.[index];
      return {
        key: dateKey,
        label: dateKey === today ? 'Today' : weekday(dateKey),
        ...sky(weeklyData.weather?.codes?.[index]),
        low: degrees(low),
        high: degrees(high),
        chance: isNumber(chance) && chance >= 20 ? `${chance}%` : null,
        from: isNumber(low) ? (low - scaleMin) / span : 0,
        to: isNumber(high) ? (high - scaleMin) / span : 1
      };
    });
  }

  return (
    <div className="wt">
      <CurrentWeather current={current} error={errors.weather} loading={loading} />
      <WeeklyForecast days={week} error={errors.weekly} loading={loading} />
      <HourlyForecast hours={hours} error={errors.forecast} loading={loading} />
      <PressureData pressureData={pressureData} error={errors.pressure} loading={loading} />
    </div>
  );
};

export default WeatherTab;
