import React, { useState } from 'react';
import { ChevronDownIcon } from '../icons/Icons';
import './styling/WeeklyForecast.css';

/** Seven days: each day's low and high, with a bar on the week's scale; a day opens to its details. Shaped by WeatherTab. */
const WeeklyForecast = ({ days, error, loading }) => {
  const [openKey, setOpenKey] = useState(null);

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
          const { key, label, condition, low, high, chance, from, to, details } = day;
          const SkyIcon = day.Icon;
          const open = key === openKey;
          const panelId = `week-${key}`;
          return (
          <li key={key} className={`week__item${open ? ' is-open' : ''}`}>
            <button
              type="button"
              className="week__day"
              aria-expanded={open}
              aria-controls={panelId}
              disabled={!details.length}
              onClick={() => setOpenKey(open ? null : key)}
            >
              <b className="week__name">{label}</b>
              <span className="week__sky" title={condition || undefined}>
                <SkyIcon />
                {condition && <span className="wt-sr">{condition}</span>}
                {chance && <i>{chance}</i>}
              </span>
              <span className="week__low faint"><span className="wt-sr">Low </span>{low}</span>
              <span className="week__range" aria-hidden="true">
                <span style={{ left: `${from * 100}%`, right: `${(1 - to) * 100}%` }} />
              </span>
              <b className="week__high"><span className="wt-sr">High </span>{high}</b>
              <ChevronDownIcon className="week__chev" />
            </button>
            <dl className="week__more" id={panelId} hidden={!open}>
              {details.map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </li>
          );
        })}
      </ul>
    </section>
  );
};

export default WeeklyForecast;
