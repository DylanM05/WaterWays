import React from 'react';

/** Current conditions: the weather now, today's high and low, when it was observed, and a few facts. Shaped by WeatherTab. */
const CurrentWeather = ({ current, error, loading }) => {
  if (!current) {
    if (error) {
      return (
        <div className="ww-empty wt-current">
          <b>Couldn’t load the current weather</b>
          <span>Refresh the page to try again.</span>
        </div>
      );
    }
    return loading ? <div className="ww-card wt-current wt-skeleton" aria-label="Loading the current weather" role="status" /> : null;
  }

  const { Icon } = current;
  return (
    <section className="ww-card wt-current" aria-label="Current weather">
      <div className="wt-now">
        <Icon className="wt-now__icon" />
        <span className="num wt-now__temp" title={current.exactTemperature || undefined}>{current.temperature}</span>
        <div className="wt-now__text">
          {current.condition && <b>{current.condition}</b>}
          {current.highLow && <span className="faint">{current.highLow}</span>}
          {current.updated && <span className="faint">Updated {current.updated}</span>}
        </div>
      </div>
      {current.facts.length > 0 && (
        <dl className="wt-facts">
          {current.facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};

export default CurrentWeather;
