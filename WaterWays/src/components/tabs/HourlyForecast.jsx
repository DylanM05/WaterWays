import React, { useState } from 'react';
import './styling/HourlyForecast.css';

/** The next three days by hour, from the hour under way now; the picked hour's details below. Shaped by WeatherTab. */
const HourlyForecast = ({ hours, error, loading }) => {
  const [pickedKey, setPickedKey] = useState(null);

  if (!hours?.length) {
    if (error) {
      return (
        <div className="ww-empty wt-hourly">
          <b>Couldn’t load the hourly forecast</b>
          <span>Refresh the page to try again.</span>
        </div>
      );
    }
    if (loading) return <div className="ww-card wt-hourly wt-skeleton" aria-label="Loading the hourly forecast" role="status" />;
    return hours ? (
      <div className="ww-empty wt-hourly">
        <b>No hourly forecast for the hours ahead</b>
        <span>Check back later today.</span>
      </div>
    ) : null;
  }

  // The first hour until another is picked, or when the picked one has passed.
  const picked = hours.find(hour => hour.key === pickedKey) || hours[0];

  return (
    <section className="ww-card wt-hourly" aria-label="Hourly forecast">
      <ol className="hourly hide-scrollbar">
        {hours.map((hour) => {
          const { key, label, fullLabel, condition, temperature, chance, now } = hour;
          const SkyIcon = hour.Icon;
          const on = hour === picked;
          return (
            <li key={key} aria-current={now ? 'time' : undefined}>
              <button
                type="button"
                className={`hourly__hour${on ? ' is-on' : ''}`}
                aria-pressed={on}
                aria-label={`${fullLabel}, ${temperature}${condition ? `, ${condition}` : ''}${chance ? `, ${chance} chance of precipitation` : ''}`}
                onClick={() => setPickedKey(key)}
              >
                <span>{label}</span>
                <SkyIcon />
                <b>{temperature}</b>
                <i>{chance}</i>
              </button>
            </li>
          );
        })}
      </ol>
      {picked.details.length > 0 && (
        <div className="hourly__more" aria-live="polite">
          <b className="hourly__when">
            {picked.fullLabel}
            {picked.condition && <span className="muted">{picked.condition}</span>}
          </b>
          <dl>
            {picked.details.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
};

export default HourlyForecast;
