import React, { useMemo, useState } from 'react';
import Spinner from '../spinners/Spinner';
import StaffGauge from '../station/StaffGauge';
import ReadingsChart from '../station/ReadingsChart';
import WeatherStrip from '../station/WeatherStrip';
import { TrendIcon } from '../icons/Icons';
import { describeChange, METRICS } from '../utility/readings';
import { summarizeReadings } from '../utility/waterSummary';
import './styling/waterData.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOWS = [1, 3, 7, 14, 30];
const WINDOW_TITLES = { 1: 'Past 24 hours', 3: 'Past 3 days', 7: 'Past 7 days', 14: 'Past 14 days', 30: 'Past 30 days' };
// summarizeReadings names the series by its older keys.
const SUMMARY_KEY = { water_level: 'water', discharge: 'discharge' };

/** The level's change over 24 hours as a pill: "↑ 0.18 m in 24 h". */
const ChangePill = ({ summary, metric }) => {
  const change = describeChange(summary.change24h, summary.latest, metric);
  if (!change) return null;
  if (change.direction === 'flat') {
    return <span className="pill pill--flat"><TrendIcon direction="flat" />Steady over 24 h</span>;
  }
  const rising = change.direction === 'up';
  return (
    <span className={`pill ${rising ? 'pill--rise' : 'pill--fall'}`} aria-label={`${rising ? 'Up' : 'Down'} ${change.amount} ${metric.unit} in the past 24 hours`}>
      <TrendIcon direction={change.direction} />{change.amount} {metric.unit} in 24 h
    </span>
  );
};

/** Flow's change over 24 hours, in the flow colour when rising: "↑ 160 in 24 h". */
const FlowChange = ({ summary, metric }) => {
  const change = describeChange(summary.change24h, summary.latest, metric);
  if (!change) return null;
  if (change.direction === 'flat') return <span className="chg chg--flow">Steady over 24 h</span>;
  const rising = change.direction === 'up';
  return (
    <span className={`chg chg--flow${rising ? ' chg--up' : ''}`} aria-label={`${rising ? 'Up' : 'Down'} ${change.amount} ${metric.unit} in the past 24 hours`}>
      <TrendIcon direction={change.direction} />{change.amount} in 24 h
    </span>
  );
};

const Reading = ({ value, metric, className }) => (
  <div className={`num ${className}`}>{metric.format(value)}<small>{metric.unit}</small></div>
);

/**
 * The Water tab: the latest level and flow with a staff gauge, the readings chart, and a strip of weather.
 * readings are the past 30 days, oldest first, each with its time in ms.
 */
const WaterData = ({ readings, loading, error, onRetry, weatherData, forecastData, weeklyData, onOpenWeather }) => {
  const [days, setDays] = useState(30);
  const [chosenField, setChosenField] = useState(null);

  const summaries = useMemo(() => Object.fromEntries(Object.values(METRICS).map(metric => [
    metric.field, readings?.length ? summarizeReadings(readings, SUMMARY_KEY[metric.field]) : null
  ])), [readings]);

  const metrics = Object.values(METRICS).filter(metric => summaries[metric.field]);
  const metric = metrics.find(m => m.field === chosenField) || metrics[0];

  const shown = useMemo(() => {
    if (!readings || !metric) return [];
    const since = Date.now() - days * DAY_MS;
    return readings.filter(reading => reading.time >= since && typeof reading[metric.field] === 'number');
  }, [readings, metric, days]);

  const weather = (
    <WeatherStrip weatherData={weatherData} forecastData={forecastData} weeklyData={weeklyData} onOpen={onOpenWeather} />
  );

  if (loading) return <Spinner message="Loading readings…" />;

  if (error) {
    return (
      <div className="water-tab">
        <div className="ww-empty">
          <b>Couldn’t load this station’s readings</b>
          <span>Check your connection, then try again.</span>
          <button type="button" className="ww-btn water-tab__retry" onClick={onRetry}>Try again</button>
        </div>
        {weather}
      </div>
    );
  }

  if (!metric) {
    return (
      <div className="water-tab">
        <div className="ww-empty">
          <b>No readings in the past 30 days</b>
          <span>This station hasn’t reported recently. Older records may be in History.</span>
        </div>
        {weather}
      </div>
    );
  }

  const level = summaries.water_level;
  const flow = summaries.discharge;
  // The big reading is the level, or the flow at stations that only measure flow.
  const lead = level ? METRICS.water_level : METRICS.discharge;
  const leadSummary = summaries[lead.field];

  return (
    <div className="water-tab">
      <div className="water-tab__grid">
        <section className="ww-card now-card" aria-label="Latest reading">
          <div className="now-card__top">
            <div className="now-card__lead">
              <div className="now-card__label">{lead.label}</div>
              <Reading value={leadSummary.latest} metric={lead} className="now-card__big" />
              <ChangePill summary={leadSummary} metric={lead} />
              {level && flow && (
                <div className="now-card__flowline muted">
                  Flow <b className="num">{METRICS.discharge.format(flow.latest)}</b> {METRICS.discharge.unit}
                </div>
              )}
            </div>
            {level && (
              <>
                <div className="now-card__gauge now-card__gauge--wide">
                  <StaffGauge value={level.latest} low={level.low} high={level.high} height={236} plate={36} fontSize={14} />
                </div>
                <div className="now-card__gauge now-card__gauge--phone">
                  <StaffGauge value={level.latest} low={level.low} high={level.high} height={196} plate={30} fontSize={12} />
                </div>
              </>
            )}
          </div>
          {level && flow && (
            <div className="now-card__flow">
              <div className="now-card__divider" />
              <div className="now-card__flowrow">
                <div className="now-card__lead">
                  <div className="now-card__label">Flow</div>
                  <Reading value={flow.latest} metric={METRICS.discharge} className="now-card__mid" />
                </div>
                <FlowChange summary={flow} metric={METRICS.discharge} />
              </div>
            </div>
          )}
        </section>

        <section className="ww-card chart-card" aria-label={`${metric.label} chart`}>
          <div className="chart-card__head">
            <h2 className="disp chart-card__title">{WINDOW_TITLES[days]}</h2>
            <div className="chart-card__controls">
              {metrics.length > 1 && (
                <div className="seg" role="group" aria-label="Reading">
                  {metrics.map(m => (
                    <button key={m.field} type="button" className={m === metric ? 'is-on' : undefined} aria-pressed={m === metric} onClick={() => setChosenField(m.field)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="chips" role="group" aria-label="Period">
                {WINDOWS.map(windowDays => (
                  <button
                    key={windowDays}
                    type="button"
                    className={`${windowDays === days ? 'is-on' : ''}${windowDays === 3 || windowDays === 14 ? ' chips__wide' : ''}`}
                    aria-pressed={windowDays === days}
                    aria-label={WINDOW_TITLES[windowDays]}
                    onClick={() => setDays(windowDays)}
                  >
                    {windowDays}d
                  </button>
                ))}
              </div>
            </div>
          </div>
          <ReadingsChart
            readings={shown}
            metric={metric}
            days={days}
            label={`${metric.label} over the ${WINDOW_TITLES[days].toLowerCase()}; ${metric.format(summaries[metric.field].latest)} ${metric.unit} now`}
          />
        </section>
      </div>
      {weather}
    </div>
  );
};

export default WaterData;
