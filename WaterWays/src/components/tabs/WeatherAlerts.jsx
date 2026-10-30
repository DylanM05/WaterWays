import React from 'react';
import { alertColours, alertTitle } from '../utility/alertColours';

const when = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : null;
};

/** Weather alerts covering the station; each expands to show Environment Canada's full text. */
const WeatherAlerts = ({ alerts }) => {
  if (!alerts?.length) return null;
  return (
    <div className="mb-3" style={{ display: 'grid', gap: '8px' }}>
      {alerts.map((alert) => {
        const { background, text } = alertColours(alert);
        const until = when(alert.eventEnds || alert.expires);
        return (
          <details
            key={`${alert.name}|${alert.issued}`}
            style={{ backgroundColor: background, color: text, borderRadius: '8px', padding: '10px 14px', textAlign: 'left' }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              ⚠ {alertTitle(alert.name)}
              {alert.area && <span style={{ fontWeight: 400 }}> · {alert.area}</span>}
            </summary>
            <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
              <div style={{ opacity: 0.9, marginBottom: '6px' }}>
                {when(alert.issued) && <>Issued {when(alert.issued)}</>}
                {until && <> · Until {until}</>}
              </div>
              <div style={{ whiteSpace: 'pre-line' }}>{alert.text}</div>
              <div style={{ opacity: 0.85, fontSize: '0.75rem', marginTop: '8px' }}>
                Source: Environment and Climate Change Canada. Contains information licensed under the Open Government Licence – Canada.
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
};

export default WeatherAlerts;
