import React from 'react';
import './styling/WeeklyForecast.css';

/** Seven days: each day's low and high, with a bar on the week's scale. Shaped by WeatherTab. */
const WeeklyForecast = ({ days, error, loading }) => {
  if (!days?.length) {
    if (error) {
      return (
        <div className="ww-empty wt-weekly">
          <b>Couldn’t load the 7-day forecast</b>
          <span>Refresh the page to try again.</span>
        </div>
      );
    }
    return loading ? <div className="ww-card wt-weekly wt-skeleton" aria-label="Loading the 7-day forecast" role="status" /> : null;
  }

  return (
    <section className="ww-card wt-weekly" aria-label="7-day forecast">
      <ul className="week">
        {days.map((day) => {
          const { key, label, condition, low, high, chance, from, to } = day;
          const SkyIcon = day.Icon;
          return (
          <li key={key} className="week__day">
            <b className="week__name">{label}</b>
            <span className="week__sky" title={condition || undefined}>
              <SkyIcon />
              {condition && <span className="wt-sr">{condition}</span>}
              {chance && <i>{chance}</i>}
            </span>
            <span className="week__low faint">{low}</span>
            <span className="week__range" aria-hidden="true">
              <span style={{ left: `${from * 100}%`, right: `${(1 - to) * 100}%` }} />
            </span>
            <b className="week__high">{high}</b>
          </li>
          );
        })}
      </ul>
    </section>
  );
};

export default WeeklyForecast;
