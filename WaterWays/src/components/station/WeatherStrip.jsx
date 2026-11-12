import React from 'react';
import { useSettings } from '../utility/contexts/SettingsContext';
import { weatherSummary } from '../home/weatherSummary';
import {
  ChevronRightIcon, CloudIcon, FogIcon, MoonIcon, PartlyIcon, RainIcon, ShowersIcon, SnowIcon, StormIcon, SunIcon
} from '../icons/Icons';

const HOUR_MS = 60 * 60 * 1000;

// Open-Meteo's WMO weather codes as the design's icons.
const iconFor = (code, isDay) => {
  if (code === 0) return isDay ? SunIcon : MoonIcon;
  if (code === 1 || code === 2) return isDay ? PartlyIcon : CloudIcon;
  if (code === 3) return CloudIcon;
  if (code === 45 || code === 48) return FogIcon;
  if (code >= 80 && code <= 82) return ShowersIcon;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return SnowIcon;
  if (code >= 95) return StormIcon;
  if (code >= 51 && code <= 67) return RainIcon;
  return CloudIcon;
};

// "2026-11-12T16:00" (station time) -> "4 pm"
const hourLabel = (rawTime) => {
  const hour = Number(rawTime.slice(11, 13));
  return `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;
};

/** Weather now and over the next ten hours, below the water readings. Hidden when the weather didn't load. */
const WeatherStrip = ({ weatherData, forecastData, weeklyData, onOpen }) => {
  const { settings } = useSettings();
  if (typeof weatherData?.temperature !== 'number') return null;

  const degrees = (celsius) => `${Math.round(settings.temperatureUnit === 'fahrenheit' ? celsius * 9 / 5 + 32 : celsius)}°`;
  const offset = (forecastData?.utcOffsetSeconds ?? weeklyData?.utcOffsetSeconds ?? 0) * 1000;
  const now = Date.now();

  // rawTime is station-local; less the UTC offset it's the real time. "Now" is the hour under way.
  const hours = (forecastData?.rawTime || [])
    .map((rawTime, index) => ({
      rawTime,
      startsAt: Date.parse(`${rawTime}Z`) - offset,
      temperature: forecastData.temperature?.[index],
      chance: forecastData.precipitationProbability?.[index],
      code: forecastData.weatherCode?.[index],
      isDay: forecastData.isDay?.[index]
    }))
    .filter(hour => hour.startsAt > now - HOUR_MS && typeof hour.temperature === 'number')
    .filter((hour, index) => index % 2 === 0)
    .slice(0, 6);

  const today = new Date(now + offset).toISOString().slice(0, 10);
  const day = weeklyData?.rawDates?.indexOf(today) ?? -1;
  const high = day >= 0 ? weeklyData.temperature?.max?.[day] : undefined;
  const low = day >= 0 ? weeklyData.temperature?.min?.[day] : undefined;

  // The current weather's short label and icon, falling back to the first hour's code.
  const summary = weatherSummary(weatherData);
  const NowIcon = summary?.Icon || iconFor(hours[0]?.code, weatherData.isDay ?? hours[0]?.isDay);

  return (
    <section className="ww-card wxstrip" aria-label="Weather">
      <div className="wxstrip__now">
        <NowIcon className="wxstrip__icon" />
        <span className="num wxstrip__temp">{degrees(weatherData.temperature)}</span>
        <div className="wxstrip__cond">
          {(summary?.label || weatherData.weather) && <b>{summary?.label || weatherData.weather}</b>}
          {typeof high === 'number' && typeof low === 'number' && (
            <span className="faint">High {degrees(high)}, low {degrees(low)}</span>
          )}
        </div>
      </div>
      {hours.length > 1 && (
        <ol className="wxstrip__hours">
          {hours.map((hour, index) => {
            const Icon = iconFor(hour.code, hour.isDay);
            return (
              <li key={hour.rawTime} className={index === 0 ? 'is-now' : undefined}>
                <span>{index === 0 ? 'Now' : hourLabel(hour.rawTime)}</span>
                <Icon />
                <b>{degrees(hour.temperature)}</b>
                {typeof hour.chance === 'number' && <i aria-label={`${hour.chance}% chance of precipitation`}>{hour.chance}%</i>}
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" className="wxstrip__go" onClick={onOpen}>Forecast<ChevronRightIcon /></button>
    </section>
  );
};

export default WeatherStrip;
