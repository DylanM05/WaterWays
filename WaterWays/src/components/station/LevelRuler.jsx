import React, { useId } from 'react';
import './levelRuler.css';

const f1 = (value) => Math.round(value * 10) / 10;

const STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

/**
 * The numbered step and how many ticks divide it: 1s and 10s in tenths, 2s in quarters, 5s in fifths, coarser
 * when the ticks would crowd.
 */
const scale = (metresPerPx) => {
  const major = STEPS.find(step => step / metresPerPx >= 24) ?? STEPS[STEPS.length - 1];
  const leading = Math.round(major / 10 ** Math.floor(Math.log10(major)));
  const options = leading === 1 ? [10, 5, 2, 1] : leading === 2 ? [4, 2, 1] : [5, 1];
  const divisions = options.find(n => major / n / metresPerPx >= 3.5) ?? 1;
  return { major, divisions };
};

/**
 * The level on a ruler: ticks every centimetre (or as fine as fits), longer ones halfway, numbered ones, and
 * whole metres in the gauge red. The water is shaded up to the level, a pointer marks it, and a bar beside the
 * ruler spans the 30-day low to high. The scale runs a little beyond the range. Matches the iOS app's ruler.
 */
const LevelRuler = ({ value, low, high, height = 168, rulerWidth = 40, fontSize = 10 }) => {
  const clipId = `ruler-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const pointer = 7;
  const rulerX = pointer + 2;
  const barX = rulerX + rulerWidth + 6;
  const width = barX + 4;

  const pad = Math.max(0.1, (high - low) * 0.12);
  const min = Math.min(low, value) - pad;
  const max = Math.max(high, value) + pad;
  const top = 4;
  const rulerHeight = height - 8;
  const y = (v) => top + rulerHeight * (1 - (v - min) / (max - min));
  const waterY = y(value);

  const { major, divisions } = scale((max - min) / rulerHeight);
  const minor = major / divisions;
  const decimals = major >= 1 ? 0 : major >= 0.1 ? 1 : 2;
  const ticks = [];
  for (let k = Math.ceil(min / minor); k <= Math.floor(max / minor); k += 1) {
    const v = k * minor;
    const isMajor = k % divisions === 0;
    const isMid = !isMajor && divisions % 2 === 0 && divisions > 2 && k % (divisions / 2) === 0;
    const isMetre = isMajor && Math.abs(v - Math.round(v)) < 1e-9;
    const cls = isMetre ? 'r-metre' : 'r-mark';
    const length = isMajor ? 15 : isMid ? 10 : 6;
    const tickY = f1(y(v));
    ticks.push(
      <line key={k} x1={rulerX} x2={rulerX + length} y1={tickY} y2={tickY} className={cls} strokeWidth={isMajor ? 1.5 : 1} />
    );
    // Numbers stay clear of the ruler's ends and of the water line, where the pointer already marks the level.
    if (isMajor && tickY > top + 6 && tickY < top + rulerHeight - 6 && Math.abs(tickY - waterY) > 7) {
      ticks.push(
        <text key={`${k}n`} x={rulerX + rulerWidth - 3} y={tickY} textAnchor="end" dominantBaseline="central" className={`r-num ${cls}`} style={{ fontSize }}>
          {v.toFixed(isMetre ? 0 : decimals)}
        </text>
      );
    }
  }

  const highY = y(high);
  const lowY = y(low);

  return (
    <svg
      className="level-ruler"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Level ${value.toFixed(2)} m, between the 30-day low of ${low.toFixed(2)} and high of ${high.toFixed(2)}`}
    >
      <defs>
        <clipPath id={clipId}><rect x={rulerX} y={top} width={rulerWidth} height={rulerHeight} rx="4" /></clipPath>
      </defs>
      <rect x={rulerX} y={top} width={rulerWidth} height={rulerHeight} rx="4" className="r-plate" />
      <g clipPath={`url(#${clipId})`}>
        <rect x={rulerX} y={f1(waterY)} width={rulerWidth} height={f1(top + rulerHeight - waterY)} className="r-water" />
        {ticks}
        <line x1={rulerX} x2={rulerX + rulerWidth} y1={f1(waterY)} y2={f1(waterY)} className="r-surf" />
      </g>
      <rect x={rulerX} y={top} width={rulerWidth} height={rulerHeight} rx="4" className="r-edge" />
      <path d={`M0,${f1(waterY - 5)}L${pointer},${f1(waterY)}L0,${f1(waterY + 5)}Z`} className="r-pointer" />
      <rect x={barX} y={f1(highY)} width="4" height={f1(Math.max(lowY - highY, 2))} rx="2" className="r-bar" />
    </svg>
  );
};

export default LevelRuler;
