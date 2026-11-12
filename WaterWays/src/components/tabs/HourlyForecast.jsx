import React from 'react';
import './styling/HourlyForecast.css';

/** The next two days by hour, from the hour under way now. Shaped by WeatherTab. */
const HourlyForecast = ({ hours, error, loading }) => {
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

  return (
    <section className="ww-card wt-hourly" aria-label="Hourly forecast">
      <ol className="hourly hide-scrollbar">
        {hours.map((hour) => {
          const { key, label, condition, temperature, chance, now } = hour;
          const SkyIcon = hour.Icon;
          return (
          <li key={key} className={`hourly__hour${now ? ' hourly__hour--now' : ''}`} aria-current={now ? 'time' : undefined}>
            <span>{label}</span>
            <SkyIcon />
            {condition && <span className="wt-sr">{condition}</span>}
            <b>{temperature}</b>
            <i>{chance}</i>
          </li>
          );
        })}
      </ol>
    </section>
  );
};

export default HourlyForecast;
