import React, { useId } from 'react';
import './staffGauge.css';

const f1 = (value) => Math.round(value * 10) / 10;

/**
 * A staff gauge like the enamel plates at gauging stations: E marks every 10 cm on alternating sides, red at
 * each whole metre with that metre's numeral, water up to the current level, a tag on the left with the level
 * now, and the 30-day range as a bar on the right with its two ends labelled. The scale runs about 0.1 m
 * beyond the range.
 */
const StaffGauge = ({ value, low, high, height = 236, plate = 36, fontSize = 14 }) => {
  const clipId = `gauge-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const pad = Math.max(0.1, (high - low) * 0.08);
  const min = Math.min(low, value) - pad;
  const max = Math.max(high, value) + pad;

  const valueText = value.toFixed(2);
  const highText = high.toFixed(2);
  const lowText = low.toFixed(2);
  const tagWidth = Math.max(44, valueText.length * 7.2 + 14);
  const labelWidth = Math.max(60, (5 + Math.max(highText.length, lowText.length)) * 6.6 + 6);

  const top = 10;
  const plateHeight = height - 20;
  const left = tagWidth + 7;
  const half = plate / 2;
  const barX = left + plate + 9;
  const width = barX + 4 + 10 + labelWidth;
  const y = (v) => top + plateHeight * (1 - (v - min) / (max - min));

  // Marks are drawn every decimetre while they stay readable; a tall range draws every half metre or metre.
  const pxPerDm = plateHeight / ((max - min) * 10);
  const step = pxPerDm >= 3 ? 1 : pxPerDm * 5 >= 3 ? 5 : 10;
  const pxPerCm = pxPerDm / 10;

  const marks = [];
  for (let d = Math.floor(min * 10); d < max * 10; d += 1) {
    if (d % step !== 0) continue;
    const v0 = d / 10;
    const onLeft = (d / step) % 2 === 0;
    const metre = d % 10 === 0;
    const cls = metre ? 'g-mr' : 'g-mk';
    const x0 = onLeft ? left + 3 : left + half + 1;
    const x1 = onLeft ? left + half - 1 : left + plate - 3;
    const bar = (x, w, a, b, key) => (
      <rect key={key} x={f1(x)} y={f1(y(b))} width={f1(w)} height={f1(Math.max(0.9, y(a) - y(b)))} className={cls} />
    );
    if (step === 1 && pxPerCm >= 1.5) {
      // An E: the spine, then three 1 cm bars.
      const spine = Math.max(1.6, (x1 - x0) * 0.24);
      marks.push(bar(onLeft ? x1 - spine : x0, spine, v0, v0 + 0.05, `${d}s`));
      marks.push(bar(x0, x1 - x0, v0, v0 + 0.01, `${d}a`), bar(x0, x1 - x0, v0 + 0.02, v0 + 0.03, `${d}b`), bar(x0, x1 - x0, v0 + 0.04, v0 + 0.05, `${d}c`));
    } else {
      marks.push(bar(x0, x1 - x0, v0, v0 + Math.min(0.05, step / 20), `${d}s`));
    }
    if (metre) {
      // Long numerals (lake levels above sea level, say) shrink to stay inside their half of the plate.
      const digits = String(d / 10).length;
      const size = Math.min(fontSize, (half - 3) / (0.62 * digits));
      marks.push(
        <text key={`${d}n`} x={f1(onLeft ? left + half * 1.5 : left + half * 0.5)} y={f1(y(v0 + 0.025) + size * 0.36)} textAnchor="middle" className="g-m" style={{ fontSize: size }}>
          {d / 10}
        </text>
      );
    }
  }

  const waterY = y(value);
  const tagY = Math.min(Math.max(waterY, 10.5), height - 10.5);
  const highY = y(high);
  const lowY = y(low);

  // Range labels sit level with the bar's ends, pushed apart when the range is too narrow for both.
  let highLabel = highY + 4;
  let lowLabel = lowY + 4;
  if (lowLabel - highLabel < 15) {
    const middle = (highLabel + lowLabel) / 2;
    highLabel = middle - 7.5;
    lowLabel = middle + 7.5;
  }
  highLabel = Math.max(highLabel, 11);
  lowLabel = Math.min(Math.max(lowLabel, highLabel + 15), height - 2);

  return (
    <svg
      className="staff-gauge"
      viewBox={`0 0 ${f1(width)} ${height}`}
      width={f1(width)}
      height={height}
      role="img"
      aria-label={`Staff gauge: ${valueText} m now; 30-day high ${highText} m, low ${lowText} m`}
    >
      <defs>
        <clipPath id={clipId}><rect x={left} y={top} width={plate} height={plateHeight} rx="2" /></clipPath>
      </defs>
      <rect x={left} y={top} width={plate} height={plateHeight} rx="2" className="g-plate" />
      <g clipPath={`url(#${clipId})`}>
        {marks}
        <rect x={left} y={f1(waterY)} width={plate} height={f1(top + plateHeight - waterY)} className="g-water" />
        <line x1={left} x2={left + plate} y1={f1(waterY)} y2={f1(waterY)} className="g-surf" />
      </g>
      <line x1={left + plate} x2={barX - 1} y1={f1(waterY)} y2={f1(waterY)} className="g-lead" />
      <rect x="0" y={f1(tagY - 10.5)} width={f1(tagWidth)} height="21" rx="4" className="g-tag" />
      <path d={`M${f1(tagWidth)},${f1(tagY - 4)}L${f1(tagWidth + 5)},${f1(tagY)}L${f1(tagWidth)},${f1(tagY + 4)}Z`} className="g-tag" />
      <text x={f1(tagWidth / 2)} y={f1(tagY + 4.2)} textAnchor="middle" className="g-tagt">{valueText}</text>
      <rect x={barX} y={f1(highY)} width="4" height={f1(Math.max(lowY - highY, 2))} rx="2" className="g-bar" />
      <text x={barX + 12} y={f1(highLabel)} className="g-lab">High <tspan className="g-labv">{highText}</tspan></text>
      <text x={barX + 12} y={f1(lowLabel)} className="g-lab">Low <tspan className="g-labv">{lowText}</tspan></text>
    </svg>
  );
};

export default StaffGauge;
