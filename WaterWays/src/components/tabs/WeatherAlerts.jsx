import React from 'react';

// Environment Canada's risk colour when it gives one, otherwise by alert type. Text colours are fixed so
// the banner reads the same in light and dark mode.
const COLOURS = {
  red: { background: '#c62828', text: '#ffffff' },
  orange: { background: '#ef6c00', text: '#ffffff' },
  yellow: { background: '#fbc02d', text: '#1a1a1a' }
};
const colourFor = (alert) =>
  COLOURS[String(alert.colour || '').toLowerCase()]
  || (alert.type === 'warning' ? COLOURS.red : alert.type === 'watch' ? COLOURS.orange : COLOURS.yellow);

const title = (name) => name.charAt(0).toUpperCase() + name.slice(1);
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
        const { background, text } = colourFor(alert);
        const until = when(alert.eventEnds || alert.expires);
        return (
          <details
            key={`${alert.name}|${alert.issued}`}
            style={{ backgroundColor: background, color: text, borderRadius: '8px', padding: '10px 14px' }}
          >
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              ⚠ {title(alert.name)}
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
