import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { Card } from 'react-bootstrap';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { ThemeContext } from '../utility/contexts/Theme';
import '../stations/stations.css';
import './styling/history.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const DAY_MS = 24 * 60 * 60 * 1000;

// The same choices as the iOS History tab. Typical-year needs at least five years of months to average.
const RANGES = [
  { key: 'days30', label: 'Past 30 days', days: 30 },
  { key: 'days90', label: 'Past 90 days', days: 90 },
  { key: 'year1', label: 'Past year', days: 365 },
  { key: 'years5', label: 'Past 5 years', days: 5 * 365 + 1 },
  { key: 'years10', label: 'Past 10 years', days: 10 * 365 + 2 },
  { key: 'years25', label: 'Past 25 years', days: 25 * 365 + 6 },
  { key: 'all', label: 'All records', days: null },
  { key: 'custom', label: 'Custom', days: null }
];
const supportsSeasonal = (range) => range.days === null || range.days >= 5 * 365;

// Daily means are only archived for about a year, so the server limits daily and weekly spans.
// gapDays is the spacing beyond which the line breaks, because data is missing.
const INTERVALS = [
  { key: 'day', label: 'Daily', maxSpanDays: 366, gapDays: 1.5 },
  { key: 'week', label: 'Weekly', maxSpanDays: 366, gapDays: 8.5 },
  { key: 'month', label: 'Monthly', maxSpanDays: null, gapDays: 45 },
  { key: 'year', label: 'Yearly', maxSpanDays: null, gapDays: 400 }
];

const METRICS = {
  water_level: { label: 'Water level', unit: 'm', decimals: () => 2 },
  discharge: { label: 'Discharge', unit: 'm³/s', decimals: (value) => (Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2) }
};

/** "3.51 m", "1,240 m³/s"; a dash for a missing value. */
const formatterFor = (metricKey) => {
  const { unit, decimals } = METRICS[metricKey];
  return (value) => (value === null || value === undefined ? '—'
    : `${value.toLocaleString('en-CA', { minimumFractionDigits: decimals(value), maximumFractionDigits: decimals(value) })} ${unit}`);
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Server dates are UTC calendar days ("2026-10-01"); they're read and shown in UTC so labels keep their day.
const parseDay = (value) => new Date(`${value}T00:00:00Z`);
const localDayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatDay = (value, options) => parseDay(value).toLocaleDateString('en-CA', { timeZone: 'UTC', ...options });
const intervalDateLabel = (value, interval) => {
  if (interval === 'day') return formatDay(value, { month: 'short', day: 'numeric', year: 'numeric' });
  if (interval === 'week') return `Week of ${formatDay(value, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  if (interval === 'month') return formatDay(value, { month: 'long', year: 'numeric' });
  return formatDay(value, { year: 'numeric' });
};

const readSetting = (key, fallback, allowed) => {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};
const saveSetting = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* private mode: the choice just isn't remembered */ }
};

const Tile = ({ title, value, detail, wide }) => (
  <div className={`history-tile${wide ? ' history-tile--wide' : ''}`}>
    <div className="history-tile__title">{title}</div>
    <div className="history-tile__value">{value}</div>
    {detail && <div className="history-tile__detail">{detail}</div>}
  </div>
);

const Segmented = ({ label, options, value, onChange }) => (
  <div className="segmented history-segmented" role="tablist" aria-label={label}>
    {options.map(([key, text]) => (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={value === key}
        className={`segmented__option${value === key ? ' segmented__option--active' : ''}`}
        onClick={() => onChange(key)}
      >
        {text}
      </button>
    ))}
  </div>
);

/** Draws a uPlot chart into a div, rebuilding it when its options or data change and resizing with the page. */
const UPlotChart = ({ options, data }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !data) return undefined;
    const chart = new uPlot({ ...options, width: ref.current.offsetWidth, height: 300 }, data, ref.current);
    const handleResize = () => chart.setSize({ width: ref.current.offsetWidth, height: 300 });
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.destroy();
    };
  }, [options, data]);
  return <div ref={ref} className="uplot-wrapper" style={{ width: '100%' }} />;
};

/**
 * Archived water levels and flows for subscribers, as in the iOS app: averages over time (by day, week, month
 * or year) or a typical year by month, plus Environment Canada's official yearly records.
 */
const HistoryTab = ({ stationId }) => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();
  const { darkMode } = useContext(ThemeContext);

  const [metric, setMetric] = useState('water_level');
  const [mode, setMode] = useState(() => readSetting('historyMode', 'timeline', ['timeline', 'seasonal']));
  const [rangeKey, setRangeKey] = useState(() => readSetting('historyRange', 'years5', RANGES.map(range => range.key)));
  const [intervalKey, setIntervalKey] = useState(() => readSetting('historyInterval', 'month', INTERVALS.map(interval => interval.key)));
  const [customFrom, setCustomFrom] = useState(() => localDayKey(new Date(Date.now() - 10 * 365 * DAY_MS)));
  const [customTo, setCustomTo] = useState(() => localDayKey(new Date()));
  const [result, setResult] = useState({ status: 'idle' });
  const [records, setRecords] = useState(null);

  const range = RANGES.find(option => option.key === rangeKey) || RANGES[3];
  // A range too short for a typical year falls back to all records, as on iOS.
  const effectiveRange = mode === 'seasonal' && !supportsSeasonal(range) ? RANGES.find(option => option.key === 'all') : range;
  const spanDays = effectiveRange.key === 'custom'
    ? Math.round((parseDay(customTo) - parseDay(customFrom)) / DAY_MS)
    : effectiveRange.days;
  const isAvailable = (interval) => interval.maxSpanDays === null || (spanDays !== null && spanDays <= interval.maxSpanDays);
  const chosenInterval = INTERVALS.find(option => option.key === intervalKey) || INTERVALS[2];
  // Falls back to monthly averages when the range is too long for daily data.
  const interval = isAvailable(chosenInterval) ? chosenInterval : INTERVALS[2];

  const from = effectiveRange.key === 'custom' ? customFrom
    : effectiveRange.days ? localDayKey(new Date(Date.now() - effectiveRange.days * DAY_MS)) : null;
  const to = effectiveRange.key === 'custom' ? customTo : null;
  const requestInterval = mode === 'seasonal' ? 'season' : interval.key;
  const customInvalid = effectiveRange.key === 'custom' && customFrom > customTo;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || customInvalid) return undefined;
    let cancelled = false;
    setResult(previous => ({ ...previous, status: 'loading' }));
    (async () => {
      try {
        const token = await getToken();
        const { data } = await axios.get(`${API_BASE_URL}/details/water-history/${stationId}`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { metric, interval: requestInterval, ...(from && { from }), ...(to && { to }) }
        });
        if (!cancelled) setResult({ status: 'ready', history: data });
      } catch (error) {
        if (cancelled) return;
        const code = error.response?.status;
        // 403: signed in without a membership; History is part of premium.
        setResult({ status: code === 403 || code === 401 ? 'locked' : 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken, stationId, metric, requestInterval, from, to, customInvalid]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    let cancelled = false;
    setRecords(null);
    (async () => {
      try {
        const token = await getToken();
        const { data } = await axios.get(`${API_BASE_URL}/details/water-records/${stationId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!cancelled) setRecords(data);
      } catch {
        // Records are extra: without them the card just isn't shown.
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, getToken, stationId]);

  const format = formatterFor(metric);

  const history = result.history;
  // Only draw a response that matches the view shown (a slow reply for the other view is ignored).
  const showsHistory = history && (history.interval === 'season') === (mode === 'seasonal') && history.metric === metric;

  const colours = useMemo(() => ({
    text: darkMode ? '#ffffff' : '#213547',
    grid: darkMode ? '#333333' : '#e0e0e0',
    accent: '#646cff',
    band: 'rgba(100, 108, 255, 0.18)',
    recent: darkMode ? '#d95926' : '#eb6834'
  }), [darkMode]);

  const chart = useMemo(() => {
    if (!showsHistory || !history.points.length) return null;
    const formatValue = formatterFor(history.metric);
    const value = (u, v) => formatValue(v);
    const legendColour = [(u) => { const legend = u.root.querySelector('.u-legend'); if (legend) legend.style.color = colours.text; }];
    const axes = (xValues) => [
      { stroke: colours.text, grid: { stroke: colours.grid }, ...(xValues && { values: xValues }) },
      { stroke: colours.text, grid: { stroke: colours.grid }, size: 70, values: (u, ticks) => ticks.map(tick => tick.toLocaleString('en-CA')) }
    ];

    if (history.interval === 'season') {
      const months = Array.from({ length: 12 }, (_, index) => index + 1);
      const byMonth = new Map(history.points.map(point => [point.month, point]));
      const recent = new Map((history.recent || []).map(point => [parseDay(point.date).getUTCMonth() + 1, point.average]));
      return {
        data: [
          months,
          months.map(month => byMonth.get(month)?.average ?? null),
          months.map(month => byMonth.get(month)?.high ?? null),
          months.map(month => byMonth.get(month)?.low ?? null),
          months.map(month => recent.get(month) ?? null)
        ],
        options: {
          scales: { x: { time: false }, y: { auto: true } },
          axes: axes((u, ticks) => ticks.map(tick => (Number.isInteger(tick) && tick >= 1 && tick <= 12 ? MONTHS[tick - 1].slice(0, 3) : ''))),
          series: [
            { label: 'Month', value: (u, v) => (v ? MONTHS[v - 1] : '—') },
            { label: 'Typical', stroke: colours.accent, width: 2, value },
            { label: 'Highest year', stroke: 'transparent', width: 0, points: { show: false }, value },
            { label: 'Lowest year', stroke: 'transparent', width: 0, points: { show: false }, value },
            { label: 'Last 12 months', stroke: colours.recent, width: 2, points: { show: true, size: 6, fill: colours.recent }, value }
          ],
          bands: [{ series: [2, 3], fill: colours.band }],
          cursor: { y: false },
          legend: { show: true, live: true },
          hooks: { draw: legendColour }
        }
      };
    }

    // A null between two points further apart than the interval's gap breaks the line.
    const gapSeconds = interval.gapDays * DAY_MS / 1000;
    const xs = []; const averages = []; const highs = []; const lows = [];
    history.points.forEach((point, index) => {
      const time = parseDay(point.date).getTime() / 1000;
      if (index > 0 && time - xs[xs.length - 1] > gapSeconds) {
        xs.push((time + xs[xs.length - 1]) / 2); averages.push(null); highs.push(null); lows.push(null);
      }
      xs.push(time); averages.push(point.average); highs.push(point.high); lows.push(point.low);
    });
    return {
      data: [xs, averages, highs, lows],
      options: {
        tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), 'Etc/UTC'),
        scales: { x: { time: true }, y: { auto: true } },
        axes: axes(null),
        series: [
          { label: 'Date', value: (u, v) => (v ? intervalDateLabel(new Date(v * 1000).toISOString().slice(0, 10), history.interval) : '—') },
          { label: 'Average', stroke: colours.accent, width: 2, points: { show: history.points.length < 40, size: 6, fill: colours.accent }, value },
          { label: 'High', stroke: 'transparent', width: 0, points: { show: false }, value },
          { label: 'Low', stroke: 'transparent', width: 0, points: { show: false }, value }
        ],
        bands: [{ series: [2, 3], fill: colours.band }],
        cursor: { y: false },
        legend: { show: true, live: true },
        hooks: { draw: legendColour }
      }
    };
  }, [showsHistory, history, colours, interval.gapDays]);

  if (!isLoaded) return null;

  if (!isSignedIn || result.status === 'locked') {
    return (
      <Card className="mb-4 history-card">
        <Card.Body className="history-prompt">
          <h5>Historical data</h5>
          <p>See years of archived water levels and flows, averaged by day, week, month or year, compare this year with a typical one, and see the station's official record highs and lows.</p>
          {isSignedIn ? (
            <button type="button" className="history-prompt__button" onClick={() => navigate('/pricing')}>Unlock with Premium</button>
          ) : (
            <button type="button" className="history-prompt__button" onClick={() => openSignIn()}>Sign in</button>
          )}
          <p className="history-prompt__note">Historical data is included with Premium.</p>
        </Card.Body>
      </Card>
    );
  }

  const earliest = history?.coverage?.earliest
    ? `Records for this station start in ${formatDay(history.coverage.earliest, { month: 'long', year: 'numeric' })}.`
    : null;

  let summary = null;
  let notes = [];
  if (showsHistory && history.interval === 'season') {
    const typical = history.points;
    const latest = (history.recent || []).at(-1);
    const usual = latest && typical.find(point => point.month === parseDay(latest.date).getUTCMonth() + 1);
    const peak = typical.reduce((best, point) => (!best || point.average > best.average ? point : best), null);
    const trough = typical.reduce((best, point) => (!best || point.average < best.average ? point : best), null);
    let comparison = null;
    if (latest && usual) {
      const monthName = MONTHS[usual.month - 1];
      const percent = usual.average ? ((latest.average - usual.average) / Math.abs(usual.average)) * 100 : 0;
      comparison = Math.abs(percent) < 2 ? `Close to a typical ${monthName}` : `${Math.round(Math.abs(percent))}% ${percent > 0 ? 'above' : 'below'} a typical ${monthName}`;
    }
    summary = (
      <div className="history-tiles">
        {latest && <Tile wide title={formatDay(latest.date, { month: 'long', year: 'numeric' })} value={format(latest.average)} detail={comparison} />}
        {peak && <Tile title="Usually highest" value={MONTHS[peak.month - 1]} detail={`Typical ${format(peak.average)}`} />}
        {trough && <Tile title="Usually lowest" value={MONTHS[trough.month - 1]} detail={`Typical ${format(trough.average)}`} />}
      </div>
    );
    const years = Math.max(0, ...typical.map(point => point.count || 0));
    notes = [years ? `Typical values average ${years} years of monthly records.` : null];
  } else if (showsHistory && history.summary) {
    summary = (
      <div className="history-tiles">
        <Tile wide title="Average" value={format(history.summary.average)} detail={`${interval.label} averages`} />
        <Tile title="Lowest" value={`↓ ${format(history.summary.low)}`} detail={intervalDateLabel(history.summary.lowDate, history.interval)} />
        <Tile title="Highest" value={`↑ ${format(history.summary.high)}`} detail={intervalDateLabel(history.summary.highDate, history.interval)} />
      </div>
    );
    const breaks = chart && chart.data[1].some(value => value === null);
    const partialYears = history.interval === 'year' ? history.points.filter(point => (point.count ?? 12) < 12).length : 0;
    notes = [
      breaks ? 'Breaks in the line are periods with no archived data.' : null,
      partialYears ? `${partialYears} of ${history.points.length} years have less than 12 months of data, so their averages lean toward the months recorded.` : null
    ];
  }
  const footnote = [earliest, ...notes].filter(Boolean).join(' ');
  const recordMetric = records?.[metric];

  return (
    <Card className="mb-4 history-card">
      <Card.Body>
        <h5 className="history-heading">Water history</h5>

        <div className="history-controls">
          <Segmented label="Measurement" value={metric} onChange={setMetric}
            options={[['water_level', 'Water level'], ['discharge', 'Discharge']]} />
          <Segmented label="View" value={mode} onChange={(value) => { setMode(value); saveSetting('historyMode', value); }}
            options={[['timeline', 'Over time'], ['seasonal', 'Typical year']]} />
        </div>

        <div className="history-controls">
          <label className="history-select">
            <span>Range</span>
            <select value={effectiveRange.key} onChange={(event) => { setRangeKey(event.target.value); saveSetting('historyRange', event.target.value); }}>
              {RANGES.filter(option => mode === 'timeline' || supportsSeasonal(option)).map(option => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </label>
          {mode === 'timeline' && (
            <label className="history-select">
              <span>Average</span>
              <select value={interval.key} onChange={(event) => { setIntervalKey(event.target.value); saveSetting('historyInterval', event.target.value); }}>
                {INTERVALS.map(option => (
                  <option key={option.key} value={option.key} disabled={!isAvailable(option)}>
                    {option.label}{isAvailable(option) ? '' : ' (up to a year)'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {effectiveRange.key === 'custom' && (
            <>
              <label className="history-select">
                <span>From</span>
                <input type="date" value={customFrom} max={customTo} onChange={(event) => event.target.value && setCustomFrom(event.target.value)} />
              </label>
              <label className="history-select">
                <span>To</span>
                <input type="date" value={customTo} min={customFrom} max={localDayKey(new Date())} onChange={(event) => event.target.value && setCustomTo(event.target.value)} />
              </label>
            </>
          )}
        </div>

        {customInvalid ? (
          <p className="history-message">The start date needs to be before the end date.</p>
        ) : result.status === 'error' ? (
          <p className="history-message">Couldn’t load the history. Please try again later.</p>
        ) : !showsHistory ? (
          <div className="history-chart history-chart--loading">
            <span className="spinner-border" role="status" aria-label="Loading history" style={{ color: 'var(--primary-colour)' }} />
          </div>
        ) : !history.points.length ? (
          <p className="history-message">There are no records for this range. Try a longer one.</p>
        ) : (
          <div className={`history-chart${result.status === 'loading' ? ' history-chart--updating' : ''}`}>
            <UPlotChart options={chart.options} data={chart.data} />
          </div>
        )}

        {summary}
        {footnote && <p className="history-footnote">{footnote}</p>}

        {recordMetric && (
          <div className="history-records">
            <div className="history-records__header">
              <h6>Records</h6>
              {recordMetric.firstYear && (
                <span>{recordMetric.firstYear === recordMetric.lastYear ? recordMetric.firstYear : `${recordMetric.firstYear}–${recordMetric.lastYear}`}</span>
              )}
            </div>
            <dl>
              {recordMetric.recordHigh && (<><dt>Highest</dt><dd>{format(recordMetric.recordHigh.value)} · {formatDay(recordMetric.recordHigh.date, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></>)}
              {recordMetric.recordLow && (<><dt>Lowest</dt><dd>{format(recordMetric.recordLow.value)} · {formatDay(recordMetric.recordLow.date, { month: 'short', day: 'numeric', year: 'numeric' })}</dd></>)}
              {recordMetric.typicalHigh != null && (<><dt>Typical yearly high</dt><dd>{format(recordMetric.typicalHigh)}</dd></>)}
              {recordMetric.typicalLow != null && (<><dt>Typical yearly low</dt><dd>{format(recordMetric.typicalLow)}</dd></>)}
            </dl>
            <p className="history-footnote">
              Each year&apos;s highest and lowest instantaneous readings from Environment Canada&apos;s archive ({recordMetric.years} years). The latest year or two may not be included yet.
            </p>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default HistoryTab;
