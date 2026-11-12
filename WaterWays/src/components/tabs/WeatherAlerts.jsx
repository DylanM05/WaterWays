import React from 'react';
import { alertTitle } from '../utility/alertColours';
import { WarnIcon } from '../icons/Icons';

const when = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : null;
};

const shortWhen = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('en-CA', { weekday: 'long', hour: 'numeric', minute: '2-digit' })
    : null;
};

/** Weather alerts covering the station; each opens to show Environment Canada's full text. */
const WeatherAlerts = ({ alerts }) => {
  if (!alerts?.length) return null;
  return (
    <div className="st-alerts">
      {alerts.map((alert) => {
        const until = shortWhen(alert.eventEnds || alert.expires);
        return (
          <details key={`${alert.name}|${alert.issued}`} className="ww-alert st-alert">
            <summary>
              <span className="st-alert__icon"><WarnIcon /></span>
              <span className="st-alert__text">
                <b>{alertTitle(alert.name)}</b>
                {alert.area && <> for {alert.area}</>}
                {until && <> until {until}</>}
              </span>
              <span className="st-alert__more">Details</span>
            </summary>
            <div className="st-alert__body">
              {when(alert.issued) && <p className="st-alert__issued">Issued {when(alert.issued)}</p>}
              <p className="st-alert__full">{alert.text}</p>
              <p className="st-alert__source">
                Source: Environment and Climate Change Canada. Contains information licensed under the Open Government Licence – Canada.
              </p>
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default WeatherAlerts;
