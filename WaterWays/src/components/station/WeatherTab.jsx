import React from 'react';
import { useSettings } from '../utility/contexts/SettingsContext';
import { CloudIcon, FogIcon, MoonIcon, PartlyIcon, RainIcon, ShowersIcon, SnowIcon, StormIcon, SunIcon } from '../icons/Icons';
import CurrentWeather from '../tabs/CurrentWeather';
import HourlyForecast from '../tabs/HourlyForecast';
import WeeklyForecast from '../tabs/WeeklyForecast';
import PressureData from '../tabs/PressureData';
import { parseLongDateTime } from '../utility/dates';
import { pressureHours } from '../utility/pressure';
import './weatherTab.css';

const HOUR_MS = 60 * 60 * 1000;
const HOURLY_LIMIT = 72;

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

// 0-360 degrees -> "NNW".
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (degrees) => (isNumber(degrees) ? POINTS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16] : '');

// One decimal, without a trailing ".0": 2.6, 14, 0.4.
const amount = (value) => String(Math.round(value * 10) / 10);

// "10 km/h NNW, gusts 18"
const windText = (speed, direction, gusts) => (isNumber(speed)
  ? `${Math.round(speed)} km/h ${direction || ''}`.trim() + (isNumber(gusts) ? `, gusts ${Math.round(gusts)}` : '')
  : null);

// Rain in mm and snow in cm, or null when neither fell.
const fallText = (rainMm, snowCm) => [
  rainMm > 0 ? `${amount(rainMm)} mm` : null,
  snowCm > 0 ? `${amount(snowCm)} cm snow` : null
].filter(Boolean).join(', ') || null;

// Temperature colours in °C, cold to hot, for the 7-day bars.
const TEMPERATURE_COLOURS = [[-20, '#7B6CF0'], [-5, '#4A90E2'], [5, '#2FB7C9'], [15, '#8CCB6A'], [22, '#F2BE4B'], [30, '#EF7B42'], [38, '#DD3F3A']];

const temperatureColour = (celsius) => {
  const stops = TEMPERATURE_COLOURS;
  if (celsius <= stops[0][0]) return stops[0][1];
  const upper = stops.findIndex(([t]) => t >= celsius);
  if (upper === -1) return stops[stops.length - 1][1];
  const [t0, c0] = stops[upper - 1];
  const [t1, c1] = stops[upper];
  const mix = (celsius - t0) / (t1 - t0);
  const channel = (hex, at) => parseInt(hex.slice(at, at + 2), 16);
  const rgb = [1, 3, 5].map(at => Math.round(channel(c0, at) + (channel(c1, at) - channel(c0, at)) * mix));
  return `rgb(${rgb.join(', ')})`;
};

// A day's bar from its low to its high, coloured by temperature along the way.
const temperatureGradient = (low, high) => {
  if (!(high > low)) return temperatureColour(isNumber(low) ? low : high);
  const inside = TEMPERATURE_COLOURS.map(([t]) => t).filter(t => t > low && t < high);
  const stops = [low, ...inside, high].map(t => `${temperatureColour(t)} ${Math.round(((t - low) / (high - low)) * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
};

const UV_LEVELS = [[3, 'low'], [6, 'moderate'], [8, 'high'], [11, 'very high'], [Infinity, 'extreme']];
const uvText = (uv) => (isNumber(uv) ? `${uv.toFixed(1)}, ${UV_LEVELS.find(([below]) => uv < below)[1]}` : null);

// The API's UTC observation time, "November 12th 2026, 3:30:00 pm", as "8:30 am" on the station's clock
// (like the forecasts and sunrise beside it), or the viewer's when the offset isn't known yet.
const observedAt = (timeString, utcOffsetSeconds) => {
  const time = parseLongDateTime(timeString, { utc: true });
  if (!time) return null;
  const known = isNumber(utcOffsetSeconds);
  const clock = known ? new Date(time.getTime() + utcOffsetSeconds * 1000) : time;
  const hour = known ? clock.getUTCHours() : clock.getHours();
  const minute = known ? clock.getUTCMinutes() : clock.getMinutes();
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`;
};

/**
 * The station's weather on one view: current conditions, the next three days by hour, pressure, and seven days.
 * Shapes the four API responses into what each card shows; the cards themselves only lay it out.
 */
const WeatherTab = ({ weatherData, forecastData, weeklyData, pressureData, errors = {}, loading = {} }) => {
  const { settings, formatTemperature } = useSettings();
  const fahrenheit = settings?.temperatureUnit === 'fahrenheit';
  const toUnit = (celsius) => (fahrenheit ? celsius * 9 / 5 + 32 : celsius);
  const degrees = (celsius) => (isNumber(celsius) ? `${Math.round(toUnit(celsius))}°` : '–');

  const utcOffsetSeconds = forecastData?.utcOffsetSeconds ?? weeklyData?.utcOffsetSeconds ?? null;

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
    const rainTotal = pick(weeklyData?.precipitation?.total, todayIndex);
    const snowTotal = pick(weeklyData?.precipitation?.snow, todayIndex);
    const rainChance = pick(weeklyData?.precipitation?.probability, todayIndex);
    const todayFall = [fallText(rainTotal, snowTotal), rainChance ? `${rainChance}% chance` : null].filter(Boolean).join(', ');
    const precipitation = rainTotal === null && rainChance === null ? null : todayFall || 'None expected';
    // Null when nothing is falling. Rain and showers (mm) and snow (cm) are shown apart; servers before the
    // precipitation fix also counted the total twice.
    const falling = weatherData.precipitation;
    const fallingNow = falling
      ? fallText((falling.rain || 0) + (falling.showers || 0), falling.snow || 0) || (isNumber(falling.total) ? `${amount(falling.total)} mm` : null)
      : null;
    current = {
      Icon,
      condition: label || weatherData.weather || null,
      temperature: degrees(weatherData.temperature),
      exactTemperature: isNumber(weatherData.temperature) ? formatTemperature(weatherData.temperature) : null,
      highLow: isNumber(high) && isNumber(low) ? `High ${degrees(high)}, low ${degrees(low)}` : null,
      updated: observedAt(weatherData.time, utcOffsetSeconds),
      facts: [
        ['Feels like', isNumber(weatherData.apparentTemperature) ? degrees(weatherData.apparentTemperature) : null],
        ['Wind', windText(weatherData.wind, weatherData.windDirection, weatherData.windGusts)],
        ['Humidity', isNumber(weatherData.humidity) ? `${weatherData.humidity}%` : null],
        ['Cloud cover', isNumber(weatherData.cloudCover) ? `${weatherData.cloudCover}%` : null],
        ['Precipitation now', fallingNow],
        ['Precipitation today', precipitation],
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
    // Pressure comes by UTC hour; pair it with each forecast hour by the instant (rounded, for half-hour zones).
    const pressureByHour = new Map(pressureHours(pressureData).map(hour => [Math.round(hour.time / HOUR_MS), hour.msl]));
    hours = forecastData.rawTime
      .map((rawTime, index) => ({ rawTime, index, startsAt: Date.parse(`${rawTime}Z`) - offset }))
      .filter(({ startsAt }) => startsAt + HOUR_MS > now)
      .slice(0, HOURLY_LIMIT)
      .map(({ rawTime, index, startsAt }) => {
        const hour = Number(rawTime.slice(11, 13));
        const chance = forecastData.precipitationProbability?.[index];
        const fall = forecastData.precipitation?.[index];
        const humidity = forecastData.relativeHumidity?.[index];
        const pressure = pressureByHour.get(Math.round(startsAt / HOUR_MS));
        const isNow = startsAt <= now;
        return {
          key: rawTime,
          now: isNow,
          // Midnight shows the new day instead of "12 am".
          label: isNow ? 'Now' : hour === 0 ? weekday(rawTime.slice(0, 10)) : hourLabel(hour),
          fullLabel: isNow ? 'Now' : `${weekday(rawTime.slice(0, 10))} ${hourLabel(hour)}`,
          ...sky(forecastData.weatherCode?.[index], forecastData.isDay ? Boolean(forecastData.isDay[index]) : true),
          temperature: degrees(forecastData.temperature?.[index]),
          chance: isNumber(chance) && chance >= 10 ? `${chance}%` : null,
          details: [
            ['Feels like', isNumber(forecastData.apparentTemperature?.[index]) ? degrees(forecastData.apparentTemperature[index]) : null],
            ['Humidity', isNumber(humidity) ? `${humidity}%` : null],
            ['Wind', windText(forecastData.windSpeed?.[index], compass(forecastData.windDirection?.[index]), forecastData.windGusts?.[index])],
            ['Precipitation', isNumber(chance) || isNumber(fall)
              ? [isNumber(fall) && fall > 0 ? `${amount(fall)} mm` : null, isNumber(chance) ? `${chance}% chance` : null].filter(Boolean).join(', ')
              : null],
            ['Pressure', isNumber(pressure) ? `${Math.round(pressure)} hPa` : null]
          ].filter(([, value]) => value)
        };
      });
  }

  // Each day's low-to-high bar sits on the week's scale, and today's marks the temperature now.
  let week = null;
  if (weeklyData?.rawDates && days.length) {
    const lows = days.map(({ index }) => weeklyData.temperature?.min?.[index]).filter(isNumber);
    const highs = days.map(({ index }) => weeklyData.temperature?.max?.[index]).filter(isNumber);
    const nowTemperature = isNumber(weatherData?.temperature) ? weatherData.temperature : null;
    const scaleMin = Math.min(...lows, ...highs, ...(nowTemperature === null ? [] : [nowTemperature]));
    const scaleMax = Math.max(...lows, ...highs, ...(nowTemperature === null ? [] : [nowTemperature]));
    const span = scaleMax - scaleMin || 1;
    week = days.map(({ dateKey, index }) => {
      const low = weeklyData.temperature?.min?.[index];
      const high = weeklyData.temperature?.max?.[index];
      const chance = weeklyData.precipitation?.probability?.[index];
      const total = weeklyData.precipitation?.total?.[index];
      const snow = weeklyData.precipitation?.snow?.[index];
      const sun = weeklyData.sun || {};
      const wind = weeklyData.wind || {};
      return {
        key: dateKey,
        label: dateKey === today ? 'Today' : weekday(dateKey),
        ...sky(weeklyData.weather?.codes?.[index]),
        low: degrees(low),
        high: degrees(high),
        chance: isNumber(chance) && chance >= 20 ? `${chance}%` : null,
        from: isNumber(low) ? (low - scaleMin) / span : 0,
        to: isNumber(high) ? (high - scaleMin) / span : 1,
        gradient: isNumber(low) || isNumber(high) ? temperatureGradient(low, high) : null,
        now: dateKey === today && nowTemperature !== null ? (nowTemperature - scaleMin) / span : null,
        nowLabel: dateKey === today && nowTemperature !== null ? degrees(nowTemperature) : null,
        details: [
          ['Sunrise', sun.sunrise?.[index]],
          ['Sunset', sun.sunset?.[index]],
          ['Daylight', sun.daylightDuration?.[index]?.replace(/(\d+)h (\d+)m/, '$1 h $2 min')],
          ['Wind', windText(wind.maxSpeed?.[index], compass(wind.dominantDirection?.[index]), wind.maxGusts?.[index])],
          ['Precipitation', isNumber(total) || isNumber(chance)
            ? [fallText(total, snow) || 'None', isNumber(chance) && chance > 0 ? `${chance}% chance` : null].filter(Boolean).join(', ')
            : null],
          ['UV index', uvText(weeklyData.uv?.max?.[index])]
        ].filter(([, value]) => value)
      };
    });
  }

  return (
    <div className="wt">
      <CurrentWeather current={current} error={errors.weather} loading={loading.weather} />
      <WeeklyForecast days={week} error={errors.weekly} loading={loading.weekly} />
      <HourlyForecast hours={hours} error={errors.forecast} loading={loading.forecast} />
      <PressureData pressureData={pressureData} utcOffsetSeconds={utcOffsetSeconds} error={errors.pressure} loading={loading.pressure} />
    </div>
  );
};

export default WeatherTab;
