import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TrendIcon } from '../icons/Icons';
import { HOUR_MS, pressureHours, pressureNow, pressureTendency } from '../utility/pressure';
import './styling/PressureData.css';

const SPAN_MS = 48 * HOUR_MS;
const PAD = { left: 38, right: 8, top: 8, bottom: 22 };

/** The element's width, so the chart is drawn at its real size and its text isn't stretched. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const path = (points) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');

/** Sea-level pressure over the past two days (solid) and the next two (dashed), with where it is now. */
const PressureData = ({ pressureData, error, loading }) => {
  const hours = useMemo(() => pressureHours(pressureData), [pressureData]);
  const now = useMemo(() => pressureNow(hours), [hours]);
  const [ref, width] = useWidth();

  if (!now) {
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

  const nowTime = now.current.time;
  const shown = hours.filter(hour => hour.msl !== null && Math.abs(hour.time - nowTime) <= SPAN_MS);
  const values = shown.map(hour => hour.msl);
  // Ticks every 5 hPa, with at least 10 hPa of range so a calm spell doesn't look stormy.
  let min = Math.floor((Math.min(...values) - 1) / 5) * 5;
  let max = Math.ceil((Math.max(...values) + 1) / 5) * 5;
  if (max - min < 10) { min -= 5; max += 5; }
  const ticks = [];
  for (let tick = min + 5; tick < max; tick += 5) ticks.push(tick);

  const height = 132;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const X = (time) => PAD.left + ((time - (nowTime - SPAN_MS)) / (2 * SPAN_MS)) * plotW;
  const Y = (value) => PAD.top + (1 - (value - min) / (max - min)) * plotH;
  const past = shown.filter(hour => hour.time <= nowTime).map(hour => [X(hour.time), Y(hour.msl)]);
  const future = shown.filter(hour => hour.time >= nowTime).map(hour => [X(hour.time), Y(hour.msl)]);
  const nowX = X(nowTime);
  const nowY = Y(now.current.msl);
  const base = PAD.top + plotH;

  const tendency = now.change3h === null ? null : pressureTendency(now.change3h);
  const direction = now.change3h === null || Math.abs(now.change3h) < 0.5 ? 'flat' : now.change3h > 0 ? 'up' : 'down';
  const summary = `${Math.round(now.current.msl)} hPa${tendency ? `, ${tendency.toLowerCase()}` : ''}`;

  return (
    <section className="ww-card wt-pressure" aria-label="Pressure">
      <div className="wt-pressure__head">
        <h2 className="wt-card-title">Pressure</h2>
        <span className="chg"><TrendIcon direction={direction} />{summary}</span>
      </div>
      <div className="wt-pressure__chart" ref={ref}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`Sea-level pressure over the past 48 hours and the next 48: ${summary} now`}>
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
            <text x={PAD.left} y={height - 4} className="wt-pressure__axis">48 h ago</text>
            <text x={nowX} y={height - 4} textAnchor="middle" className="wt-pressure__axis">Now</text>
            <text x={PAD.left + plotW} y={height - 4} textAnchor="end" className="wt-pressure__axis">In 48 h</text>
          </svg>
        )}
      </div>
    </section>
  );
};

export default PressureData;
