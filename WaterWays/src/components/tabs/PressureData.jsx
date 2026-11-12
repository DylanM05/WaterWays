import React, { useEffect, useMemo, useState } from 'react';
import { TrendIcon } from '../icons/Icons';
import { HOUR_MS, pressureHours, pressureNow, pressureTendency } from '../utility/pressure';
import './styling/PressureData.css';

const SPAN_MS = 48 * HOUR_MS;
const HEIGHT = 154;
// The top band holds the readout, so it never covers the line.
const PAD = { left: 38, right: 8, top: 30, bottom: 22 };
const SERIES = { msl: 'Sea level', surface: 'Surface' };

/** The element's width, so the chart is drawn at its real size and its text isn't stretched. */
function useWidth() {
  const [element, setElement] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width];
}

const path = (points) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

const hpa = (value) => (value === null ? '–' : value.toFixed(1));

// "+1.2", "−0.4", "0.0"; a real minus sign.
const signed = (value) => {
  if (value === null) return '–';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toFixed(1)}`;
};

// "Thu 4 pm" on the station's clock, like the hourly forecast; the viewer's when the offset isn't known.
const hourAt = (time, utcOffsetSeconds) => {
  const known = typeof utcOffsetSeconds === 'number';
  const date = new Date(known ? time + utcOffsetSeconds * 1000 : time);
  const hour = known ? date.getUTCHours() : date.getHours();
  const day = date.toLocaleDateString('en-US', { weekday: 'short', ...(known ? { timeZone: 'UTC' } : {}) });
  return `${day} ${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;
};

/** Sea-level or surface pressure over the past two days (solid) and the next two (dashed), with where it is now. */
const PressureData = ({ pressureData, utcOffsetSeconds, error, loading }) => {
  const hours = useMemo(() => pressureHours(pressureData), [pressureData]);
  const hasSurface = hours.some(hour => hour.surface !== null);
  const [choice, setChoice] = useState('msl');
  const series = hasSurface ? choice : 'msl';
  const mslNow = useMemo(() => pressureNow(hours), [hours]);
  const surfaceNow = useMemo(() => (hasSurface ? pressureNow(hours, Date.now(), 'surface') : null), [hours, hasSurface]);
  const [chartRef, width] = useWidth();
  const [hover, setHover] = useState(null);

  if (!mslNow) {
    if (error) {
      return (
        <div className="ww-empty wt-pressure">
          <b>Couldn’t load the pressure</b>
          <span>Refresh the page to try again.</span>
        </div>
      );
    }
    return loading ? <div className="ww-card wt-pressure wt-skeleton" aria-label="Loading the pressure" role="status" /> : null;
  }

  const now = (series === 'surface' && surfaceNow) || mslNow;
  const key = now === mslNow ? 'msl' : 'surface';
  const nowTime = now.current.time;
  const shown = hours.filter(hour => hour[key] !== null && Math.abs(hour.time - nowTime) <= SPAN_MS);
  const values = shown.map(hour => hour[key]);
  // Ticks every 5 hPa (10 over a wide range), with at least 10 hPa of range so a calm spell doesn't look stormy.
  let min = Math.floor((Math.min(...values) - 1) / 5) * 5;
  let max = Math.ceil((Math.max(...values) + 1) / 5) * 5;
  if (max - min < 10) { min -= 5; max += 5; }
  const step = max - min > 20 ? 10 : 5;
  const ticks = [];
  for (let tick = Math.ceil((min + 1) / step) * step; tick < max; tick += step) ticks.push(tick);

  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const start = nowTime - SPAN_MS;
  const X = (time) => PAD.left + ((time - start) / (2 * SPAN_MS)) * plotW;
  const Y = (value) => PAD.top + (1 - (value - min) / (max - min)) * plotH;
  const past = shown.filter(hour => hour.time <= nowTime).map(hour => [X(hour.time), Y(hour[key])]);
  const future = shown.filter(hour => hour.time >= nowTime).map(hour => [X(hour.time), Y(hour[key])]);
  const nowX = X(nowTime);
  const nowY = Y(now.value);
  const base = PAD.top + plotH;

  const tendency = now.change3h === null ? null : pressureTendency(now.change3h);
  const direction = now.change3h === null || Math.abs(now.change3h) < 0.5 ? 'flat' : now.change3h > 0 ? 'up' : 'down';
  const label = key === 'msl' ? 'Sea-level pressure' : 'Surface pressure';

  // The hour under the pointer, or picked with the arrow keys.
  const picked = hover !== null ? shown[Math.min(hover, shown.length - 1)] : null;
  const nowIndex = shown.findIndex(hour => hour.time === nowTime);
  const pickAt = (clientX, element) => {
    const time = start + ((clientX - element.getBoundingClientRect().left - PAD.left) / plotW) * 2 * SPAN_MS;
    let best = 0;
    shown.forEach((hour, index) => { if (Math.abs(hour.time - time) < Math.abs(shown[best].time - time)) best = index; });
    setHover(best);
  };
  const onKeyDown = (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (event.key === 'Escape') setHover(null);
    if (!step) return;
    event.preventDefault();
    setHover(index => Math.max(0, Math.min(shown.length - 1, (index ?? nowIndex) + step)));
  };

  const stats = [
    ['Sea level', hpa(mslNow.value), 'hPa'],
    surfaceNow ? ['Surface', hpa(surfaceNow.value), 'hPa'] : null,
    ['3 h change', signed(now.change3h), 'hPa'],
    ['24 h high', hpa(now.dayMax), 'hPa'],
    ['24 h low', hpa(now.dayMin), 'hPa'],
    ['24 h range', now.dayMax === null ? '–' : hpa(now.dayMax - now.dayMin), 'hPa']
  ].filter(Boolean);

  return (
    <section className="ww-card wt-pressure" aria-label="Pressure">
      <div className="wt-pressure__head">
        <h2 className="wt-card-title">Pressure</h2>
        {tendency && <span className={`chg${direction === 'up' ? ' chg--up' : ''}`}><TrendIcon direction={direction} />{tendency}</span>}
        {hasSurface && (
          <div className="seg wt-pressure__seg" role="group" aria-label="Pressure series">
            {Object.entries(SERIES).map(([value, name]) => (
              <button
                key={value}
                type="button"
                className={series === value ? 'is-on' : undefined}
                aria-pressed={series === value}
                onClick={() => { setChoice(value); setHover(null); }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      <dl className="wt-pressure__stats">
        {stats.map(([name, value, unit]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd className="num">{value}{value !== '–' && <small>{unit}</small>}</dd>
          </div>
        ))}
      </dl>
      <div
        className="wt-pressure__chart"
        ref={chartRef}
        tabIndex={0}
        role="group"
        aria-label={`${label} over the past 48 hours and the next 48`}
        onPointerDown={(event) => pickAt(event.clientX, event.currentTarget)}
        onPointerMove={(event) => pickAt(event.clientX, event.currentTarget)}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHover(null); }}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} aria-hidden="true">
            <defs>
              <linearGradient id="wt-pressure-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--w-accent)', stopOpacity: 0.2 }} />
                <stop offset="1" style={{ stopColor: 'var(--w-accent)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            {ticks.map(tick => (
              <g key={tick}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={Y(tick)} y2={Y(tick)} className="wt-pressure__grid" />
                <text x={PAD.left - 6} y={Y(tick) + 3.5} textAnchor="end" className="wt-pressure__axis">{tick}</text>
              </g>
            ))}
            {past.length > 1 && (
              <>
                <path d={`${path(past)}L${past[past.length - 1][0].toFixed(1)},${base}L${past[0][0].toFixed(1)},${base}Z`} fill="url(#wt-pressure-fill)" />
                <path d={path(past)} className="wt-pressure__line" />
              </>
            )}
            {future.length > 1 && <path d={path(future)} className="wt-pressure__forecast" />}
            <line x1={nowX} x2={nowX} y1={PAD.top} y2={base} className="wt-pressure__now" />
            <circle cx={nowX} cy={nowY} r="4.5" className="wt-pressure__dot" />
            {picked && (
              <>
                <line x1={X(picked.time)} x2={X(picked.time)} y1={PAD.top} y2={base} className="wt-pressure__guide" />
                <circle cx={X(picked.time)} cy={Y(picked[key])} r="4" className="wt-pressure__pick" />
              </>
            )}
            <text x={PAD.left} y={HEIGHT - 4} className="wt-pressure__axis">48 h ago</text>
            <text x={nowX} y={HEIGHT - 4} textAnchor="middle" className="wt-pressure__axis">Now</text>
            <text x={PAD.left + plotW} y={HEIGHT - 4} textAnchor="end" className="wt-pressure__axis">In 48 h</text>
          </svg>
        )}
        <div
          className="wt-pressure__tip"
          role="status"
          hidden={!picked || !width}
          style={picked && width ? { left: `${Math.min(Math.max(X(picked.time), 70), width - 70)}px` } : undefined}
        >
          {picked && (
            <>
              <b>{hpa(picked[key])} hPa</b>
              <span>{picked.time === nowTime ? 'Now' : hourAt(picked.time, utcOffsetSeconds)}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default PressureData;
