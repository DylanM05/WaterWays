import React, { useState } from 'react';

const GAP_MS = 90 * 60 * 1000;

/**
 * A small line of the last day's hourly values ({ time: ms, value }, oldest first), with the newest point
 * marked in the accent colour. Hovering shows the value at that hour. minSpan is the smallest range the
 * height stands for, so a nearly flat river doesn't look jagged.
 */
const Sparkline = ({ points, minSpan, format, label, onClick }) => {
  const [hovered, setHovered] = useState(null);
  const usable = points.filter(point => Number.isFinite(point.time) && Number.isFinite(point.value));
  if (usable.length < 2) return null;

  const first = usable[0].time;
  const last = usable[usable.length - 1].time;
  const values = usable.map(point => point.value);
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high - low < minSpan) {
    const middle = (high + low) / 2;
    low = middle - minSpan / 2;
    high = middle + minSpan / 2;
  }
  const padding = (high - low) * 0.12;
  low -= padding;
  high += padding;

  // Both axes run 0–100 in the SVG and stretch to the box; the stroke keeps its width.
  const x = (time) => ((time - first) / (last - first)) * 100;
  const y = (value) => (1 - (value - low) / (high - low)) * 100;

  // A new run starts after a gap of more than 90 minutes, so missing hours aren't drawn as a straight line.
  const runs = [];
  usable.forEach((point, index) => {
    if (index === 0 || point.time - usable[index - 1].time > GAP_MS) runs.push([]);
    runs[runs.length - 1].push(point);
  });
  const line = runs.map(run => run.map((point, index) => `${index ? 'L' : 'M'}${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join('')).join('');
  const areas = runs.filter(run => run.length > 1).map(run =>
    `M${x(run[0].time).toFixed(2)},100${run.map(point => `L${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join('')}L${x(run[run.length - 1].time).toFixed(2)},100Z`);

  const newest = usable[usable.length - 1];
  const shown = hovered ?? newest;

  const handleMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const time = first + ((event.clientX - box.left) / box.width) * (last - first);
    setHovered(usable.reduce((best, point) => (Math.abs(point.time - time) < Math.abs(best.time - time) ? point : best)));
  };
  const hourLabel = (time) => new Date(time).toLocaleString('en-CA', { weekday: 'short', hour: 'numeric' });

  return (
    <div
      className="sparkline"
      role="img"
      aria-label={label}
      onPointerMove={handleMove}
      onPointerLeave={() => setHovered(null)}
      onClick={onClick}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {areas.map((area, index) => <path key={index} className="sparkline__area" d={area} />)}
        <path className="sparkline__line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>
      {hovered && <span className="sparkline__crosshair" style={{ left: `${x(hovered.time)}%` }} />}
      <span className="sparkline__dot" style={{ left: `${x(shown.time)}%`, top: `${y(shown.value)}%` }} />
      {hovered && (
        <span className={`sparkline__tooltip${x(hovered.time) > 60 ? ' sparkline__tooltip--left' : ''}`} style={{ left: `${x(hovered.time)}%` }}>
          <strong>{format(hovered.value)}</strong> {hourLabel(hovered.time)}
        </span>
      )}
    </div>
  );
};

export default Sparkline;
