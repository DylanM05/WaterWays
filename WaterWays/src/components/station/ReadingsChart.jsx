import React, { useContext, useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { ThemeContext } from '../utility/contexts/Theme';
import { formatNumber } from '../utility/readings';
import './readingsChart.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const FONT = '"Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// "#0B7F8C" -> "rgba(11, 127, 140, a)"
const withAlpha = (hex, alpha) => {
  const value = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

const tickDate = (date) => date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const tickHour = (date) => date.toLocaleTimeString('en-CA', { hour: 'numeric' });
const tipTime = (date) => date.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Readings for one metric as a line over a tinted fill, with the window's average dashed across and the
 * latest reading marked. Hourly averages (older than a week) carry the hour's low and high, drawn as a faint
 * band so short peaks stay visible. readings are oldest first.
 */
const ReadingsChart = ({ readings, metric, days, label }) => {
  const { darkMode } = useContext(ThemeContext);
  const wrapRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || readings.length < 2) return undefined;
    let plot = null;

    // The theme class on <html> is set by the theme provider's effect, which runs after this one; waiting a
    // frame means the colours below are the new theme's.
    const frame = requestAnimationFrame(() => {
      const css = getComputedStyle(document.documentElement);
      const token = (name) => css.getPropertyValue(name).trim();
      const colour = token(metric.field === 'discharge' ? '--w-flow' : '--w-accent');
      const ink2 = token('--w-ink2');
      const ink3 = token('--w-ink3');
      const line = token('--w-line');
      const surface = token('--w-surface');
      const field = metric.field;

      const times = readings.map(reading => reading.time / 1000);
      const values = readings.map(reading => reading[field] ?? null);
      const highs = readings.map((reading, i) => (values[i] === null ? null : reading[`${field}_max`] ?? values[i]));
      const lows = readings.map((reading, i) => (values[i] === null ? null : reading[`${field}_min`] ?? values[i]));
      const present = values.filter(value => value !== null);
      const average = present.reduce((sum, value) => sum + value, 0) / present.length;

      const pr = uPlot.pxRatio;
      const height = () => (wrap.clientWidth < 520 ? 180 : 290);
      const yDecimals = (increment) => (increment < 0.01 ? 3 : increment < 0.1 ? 2 : increment < 1 ? 1 : 0);
      const showHours = days <= 3;

      const tip = document.createElement('div');
      tip.className = 'rchart__tip';
      tip.hidden = true;
      const tipValue = document.createElement('b');
      const tipWhen = document.createElement('span');
      tip.append(tipValue, tipWhen);

      const opts = {
        width: wrap.clientWidth,
        height: height(),
        padding: [12, 14, 0, 0],
        legend: { show: false },
        cursor: {
          y: false,
          points: { size: 9, width: 2, fill: colour, stroke: surface },
          drag: { x: true, y: false }
        },
        scales: {
          x: { time: true },
          y: {
            range: (u, min, max) => {
              const span = Math.max(max - min, metric.minSpan ?? Math.max(Math.abs(max) * 0.04, 0.5));
              const middle = (min + max) / 2;
              return [middle - span * 0.62, middle + span * 0.62];
            }
          }
        },
        axes: [
          {
            stroke: ink3,
            font: `11px ${FONT}`,
            size: 30,
            space: 72,
            gap: 6,
            grid: { show: false },
            ticks: { show: false },
            values: (u, splits) => splits.map(split => {
              const date = new Date(split * 1000);
              return showHours && (date.getHours() || date.getMinutes()) ? tickHour(date) : tickDate(date);
            })
          },
          {
            stroke: ink3,
            font: `11px ${FONT}`,
            space: 40,
            gap: 8,
            size: (u, ticks) => (ticks ? Math.max(...ticks.map(tick => tick.length)) * 6.6 + 16 : 40),
            grid: { stroke: line, width: 1 },
            ticks: { show: false },
            values: (u, splits, axis, space, increment) => splits.map(split => formatNumber(split, yDecimals(increment)))
          }
        ],
        series: [
          {},
          {
            stroke: colour,
            width: 2,
            points: { show: false },
            fill: (u) => {
              const gradient = u.ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
              gradient.addColorStop(0, withAlpha(colour, darkMode ? 0.3 : 0.26));
              gradient.addColorStop(1, withAlpha(colour, 0));
              return gradient;
            }
          },
          { stroke: 'transparent', width: 0, points: { show: false } },
          { stroke: 'transparent', width: 0, points: { show: false } }
        ],
        bands: [{ series: [2, 3], fill: withAlpha(colour, 0.22) }],
        hooks: {
          draw: [
            (u) => {
              const { ctx, bbox } = u;
              ctx.save();

              // The window's average, dashed, labelled at the left where the latest point isn't.
              const ay = u.valToPos(average, 'y', true);
              ctx.strokeStyle = ink3;
              ctx.lineWidth = 1.2 * pr;
              ctx.setLineDash([4 * pr, 4 * pr]);
              ctx.beginPath();
              ctx.moveTo(bbox.left, ay);
              ctx.lineTo(bbox.left + bbox.width, ay);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.font = `600 ${11 * pr}px ${FONT}`;
              ctx.fillStyle = ink2;
              ctx.textBaseline = 'alphabetic';
              ctx.textAlign = 'left';
              const labelY = ay - bbox.top < 16 * pr ? ay + 14 * pr : ay - 6 * pr;
              ctx.fillText(`Average ${metric.format(average)}`, bbox.left + 8 * pr, labelY);

              // The latest reading: a dot with a soft halo.
              let last = values.length - 1;
              while (last >= 0 && values[last] === null) last -= 1;
              if (last >= 0) {
                const x = u.valToPos(times[last], 'x', true);
                const y = u.valToPos(values[last], 'y', true);
                ctx.fillStyle = withAlpha(colour, 0.18);
                ctx.beginPath();
                ctx.arc(x, y, 10 * pr, 0, 2 * Math.PI);
                ctx.fill();
                ctx.fillStyle = colour;
                ctx.strokeStyle = surface;
                ctx.lineWidth = 2.5 * pr;
                ctx.beginPath();
                ctx.arc(x, y, 4.5 * pr, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.fill();
              }
              ctx.restore();
            }
          ],
          setCursor: [
            (u) => {
              const index = u.cursor.idx;
              if (index === null || index === undefined || values[index] === null) {
                tip.hidden = true;
                return;
              }
              tipValue.textContent = `${metric.format(values[index])} ${metric.unit}`;
              tipWhen.textContent = tipTime(new Date(times[index] * 1000));
              tip.hidden = false;
              const x = u.valToPos(times[index], 'x');
              const y = u.valToPos(values[index], 'y');
              const width = tip.offsetWidth;
              tip.style.left = `${Math.min(Math.max(x - width / 2, 0), u.over.clientWidth - width)}px`;
              tip.style.top = `${Math.max(y - tip.offsetHeight - 14, -8)}px`;
            }
          ]
        }
      };

      plot = new uPlot(opts, [times, values, highs, lows], wrap);
      plot.over.appendChild(tip);
    });

    const observer = new ResizeObserver(() => {
      if (plot) plot.setSize({ width: wrap.clientWidth, height: wrap.clientWidth < 520 ? 180 : 290 });
    });
    observer.observe(wrap);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (plot) plot.destroy();
    };
  }, [readings, metric, days, darkMode]);

  if (readings.length < 2) {
    return (
      <div className="ww-empty rchart__empty">
        <b>Not enough {metric.label.toLowerCase()} readings to draw</b>
        <span>{days === 30 ? 'This station hasn’t reported enough in the past 30 days.' : 'Try a longer period.'}</span>
      </div>
    );
  }

  return <div ref={wrapRef} className="rchart" role="img" aria-label={label} />;
};

export default ReadingsChart;
