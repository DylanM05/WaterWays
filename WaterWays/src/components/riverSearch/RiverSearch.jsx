import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { attachRiver } from './riverEngine';
import useRiverSearch from './useRiverSearch';
import { displayTitle, PROVINCE_NAMES } from '../utility/names';
import { describeChange, metricsOf } from '../utility/readings';
import { DropIcon, SearchIcon, TrendIcon, WavesIcon } from '../icons/Icons';
import './riverSearch.css';

// The matched part of a name in bold.
const highlight = (text, query) => {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>;
};

const Reading = ({ summary }) => {
  const reading = summary?.reading;
  const metric = metricsOf(reading)[0];
  if (!metric) return null;
  const value = reading[metric.field];
  const change = describeChange(summary.trend?.change?.[metric.field], value, metric);
  return (
    <div className="river-search__val">
      <span className="num">{metric.format(value)}<small>{metric.unit}</small></span>
      {change && (
        <span className={`chg${change.direction === 'up' ? ' chg--up' : ''}`}>
          <TrendIcon direction={change.direction} />{change.amount ? `${change.amount} ${metric.unit}` : 'Steady'}
        </span>
      )}
    </div>
  );
};

/**
 * Search for rivers and stations on a river. size is 'lg' (home page), 'md' (phones) or 'sm' (the top bar);
 * ends is 'cut' for a river that runs edge to edge or 'round' for one set inside a page.
 */
const RiverSearch = ({ size = 'lg', ends = 'cut', placeholder = 'Search a river, lake or station', className = '' }) => {
  const navigate = useNavigate();
  const labelRef = useRef(null);
  const inputRef = useRef(null);
  const panelId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useRiverSearch(query);

  useEffect(() => attachRiver(labelRef.current), []);

  const rows = useMemo(() => [
    ...search.rivers.map(river => ({
      key: `river|${river.province}|${river.stationName}`,
      kind: 'river',
      name: displayTitle(river.stationName),
      sub: PROVINCE_NAMES[river.province] || river.province,
      to: `/river/${encodeURIComponent(river.stationName)}`
    })),
    ...search.stations.map(station => ({
      key: `station|${station.station_id}`,
      kind: 'station',
      name: displayTitle(station.stationName),
      id: station.station_id,
      to: `/station-details/${station.station_id}`
    }))
  ], [search.rivers, search.stations]);

  useEffect(() => { setActive(0); }, [rows]);

  const text = query.trim();
  const showPanel = open && search.status !== 'idle' && text.length >= 2;
  const optionId = (index) => `${panelId}-${index}`;

  const choose = (row) => {
    if (!row) return;
    navigate(row.to);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' && showPanel && rows.length) {
      event.preventDefault();
      setActive((active + 1) % rows.length);
    } else if (event.key === 'ArrowUp' && showPanel && rows.length) {
      event.preventDefault();
      setActive((active - 1 + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (showPanel) choose(rows[active]);
    } else if (event.key === 'Escape') {
      if (showPanel) setOpen(false);
      else setQuery('');
    }
  };

  // Keep the active row in view by scrolling the list only, never the page.
  const panelRef = useRef(null);
  useEffect(() => {
    const panel = panelRef.current;
    const row = panel?.querySelector(`[data-index="${active}"]`);
    if (!panel || !row) return;
    if (row.offsetTop < panel.scrollTop) panel.scrollTop = row.offsetTop - 6;
    else if (row.offsetTop + row.offsetHeight > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = row.offsetTop + row.offsetHeight - panel.clientHeight + 6;
    }
  }, [active, showPanel]);

  const renderRow = (row, index) => (
    <div
      key={row.key}
      id={optionId(index)}
      data-index={index}
      role="option"
      aria-selected={index === active}
      className="river-search__row"
      onMouseMove={() => setActive(index)}
      onClick={() => choose(row)}
    >
      <span className="river-search__icon">{row.kind === 'river' ? <WavesIcon /> : <DropIcon />}</span>
      <div className="river-search__text">
        <span className="river-search__name">{highlight(row.name, text)}</span>
        <span className="river-search__sub">{row.kind === 'river' ? row.sub : <span className="mono">{row.id}</span>}</span>
      </div>
      {row.kind === 'station' && <Reading summary={search.summaries[row.id]} />}
    </div>
  );

  const riverRows = rows.filter(row => row.kind === 'river');
  const stationRows = rows.filter(row => row.kind === 'station');

  let panelBody;
  if (search.status === 'failed') {
    panelBody = (
      <div className="river-search__empty">
        <b>Search isn’t working right now</b>
        <span>Check your connection and try again.</span>
      </div>
    );
  } else if (!rows.length && search.status === 'done') {
    panelBody = (
      <div className="river-search__empty">
        <b>No rivers or stations match “{text}”</b>
        <span>Search by the name of a river, lake or the place a station is at.</span>
      </div>
    );
  } else if (!rows.length) {
    panelBody = <div className="river-search__empty"><span>Searching…</span></div>;
  } else {
    panelBody = (
      <>
        {riverRows.length > 0 && <div className="river-search__group">Rivers</div>}
        {riverRows.map(row => renderRow(row, rows.indexOf(row)))}
        {stationRows.length > 0 && <div className="river-search__group">Stations</div>}
        {stationRows.map(row => renderRow(row, rows.indexOf(row)))}
      </>
    );
  }

  return (
    <div className={`river-search ${className}`} data-size={size}>
      <label className="river-search__field" ref={labelRef} data-ends={ends}>
        <span className="river-search__water" />
        <SearchIcon className="river-search__glass" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={placeholder}
          aria-label="Search a river, lake or station"
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={panelId}
          aria-activedescendant={showPanel && rows.length ? optionId(active) : undefined}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </label>
      <div
        ref={panelRef}
        id={panelId}
        role="listbox"
        aria-label="Search results"
        className="river-search__panel"
        hidden={!showPanel}
        onMouseDown={(event) => event.preventDefault()}
      >
        {showPanel && panelBody}
      </div>
    </div>
  );
};

export default RiverSearch;
