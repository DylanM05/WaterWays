import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sparkline from '../stations/Sparkline';
import { HeartFilledIcon, HeartIcon, TrendIcon } from '../icons/Icons';

const WORDS = { up: 'Rising', down: 'Falling' };

/** A 24 h change: arrow and amount, or "Steady". The unit is left off where the column already says it. */
const Change = ({ cell, flow = false, unit = true }) => {
  const change = cell?.change;
  if (!change) return null;
  if (change.direction === 'flat') {
    return <span className="chg"><TrendIcon direction="flat" />Steady</span>;
  }
  return (
    <span className={`chg${change.direction === 'up' ? ' chg--up' : ''}${flow ? ' chg--flow' : ''}`}>
      <TrendIcon direction={change.direction} />
      <span className="visually-hidden">{WORDS[change.direction]} </span>
      {change.amount}{unit && ` ${cell.metric.unit}`}
    </span>
  );
};

const Value = ({ cell }) => (cell
  ? <span className="num river-value">{cell.metric.format(cell.value)}<small>{cell.metric.unit}</small></span>
  : <span className="river-none" aria-label="No reading">—</span>);

// Clicks on the line fall through to the row or link around it.
const Line = ({ line }) => line && (
  <Sparkline
    points={line.points}
    minSpan={line.minSpan}
    format={(value) => `${line.metric.format(value)} ${line.metric.unit}`}
    label={`${line.metric.label} over the past 24 hours, from ${line.metric.format(line.points[0].value)} to ${line.metric.format(line.points[line.points.length - 1].value)} ${line.metric.unit}`}
  />
);

const stationPath = (id) => `/station-details/${encodeURIComponent(id)}`;

/**
 * The river's reporting stations as a table (desktop). Each row opens its station; the name is the link, so the
 * row is reachable by keyboard. saved/onSave are omitted for signed-out visitors, which hides the hearts.
 */
export const RiverStationTable = ({ rows, saved, saving, onSave, showProvince }) => {
  const navigate = useNavigate();
  const openRow = (event, id) => {
    // Links and buttons in the row do their own thing.
    if (event.target.closest('a, button')) return;
    navigate(stationPath(id));
  };

  return (
    <div className="ww-card river-table-card">
      <table className="river-table">
        <thead>
          <tr>
            <th scope="col">Station</th>
            <th scope="col" className="river-table__r">Level</th>
            <th scope="col"><span className="visually-hidden">Level change over </span>24 h</th>
            <th scope="col" className="river-table__r">Flow</th>
            <th scope="col"><span className="visually-hidden">Flow change over </span>24 h</th>
            <th scope="col" className="river-table__line">Past 24 hours</th>
            <th scope="col">Updated</th>
            <th scope="col" className="river-table__save"><span className="visually-hidden">Save</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, name, province, row }) => {
            const isSaved = Boolean(saved?.[id]);
            return (
              <tr key={id} className={isSaved ? 'is-saved' : undefined} onClick={(event) => openRow(event, id)}>
                <td className="river-table__name">
                  <Link to={stationPath(id)}>{name}</Link>
                  <span><span className="mono">{id}</span>{showProvince && province && <span className="river-table__prov">{province}</span>}</span>
                </td>
                <td className="river-table__r"><Value cell={row.level} /></td>
                <td><Change cell={row.level} /></td>
                <td className="river-table__r"><Value cell={row.flow} /></td>
                <td><Change cell={row.flow} flow unit={false} /></td>
                <td className="river-table__line"><Line line={row.line} /></td>
                <td className="faint river-table__time">
                  {row.updated && <time dateTime={row.time.toISOString()} title={row.time.toLocaleString('en-CA')}>{row.updated}</time>}
                </td>
                <td className="river-table__save">
                  {onSave && (
                    <button
                      type="button"
                      className={`river-heart${isSaved ? ' is-on' : ''}`}
                      onClick={() => onSave(id)}
                      disabled={saving?.[id]}
                      aria-label={isSaved ? `Remove ${name} from saved` : `Save ${name}`}
                      aria-pressed={isSaved}
                    >
                      {isSaved ? <HeartFilledIcon /> : <HeartIcon />}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/** The same stations as a list of rows (phone): name and time, a small line, and the level with its change. */
export const RiverStationList = ({ rows }) => (
  <ul className="ww-card river-list">
    {rows.map(({ id, name, row }) => {
      const main = row.level || row.flow;
      return (
        <li key={id}>
          <Link to={stationPath(id)} className="river-list__row">
            <span className="river-list__name">
              <b>{name}</b>
              <span className="faint">{row.updated || id}</span>
            </span>
            <div className="river-list__line"><Line line={row.line} /></div>
            <span className="river-list__val">
              <Value cell={main} />
              <Change cell={main} flow={!row.level} unit={false} />
            </span>
          </Link>
        </li>
      );
    })}
  </ul>
);
