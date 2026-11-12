import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import Spinner from '../components/spinners/Spinner';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '../components/icons/Icons';
import { displayTitle, PROVINCE_NAMES } from '../components/utility/names';
import './styling/province.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** A province's rivers and lakes. The list is passed up so the river page can open without asking again. */
const Province = ({ setRivers }) => {
  const { code } = useParams();
  const province = code.toUpperCase();
  const name = PROVINCE_NAMES[province];
  const [rivers, setLocalRivers] = useState(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!name) return undefined;
    let cancelled = false;
    setLocalRivers(null);
    setFailed(false);
    axios.get(`${API_BASE_URL}/details/rivers/${province.toLowerCase()}`)
      .then(({ data }) => {
        if (cancelled) return;
        setLocalRivers(data);
        setRivers(data);
      })
      .catch(error => {
        console.error('Error loading rivers:', error);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [province, name, setRivers]);

  if (!name) {
    return (
      <div className="page">
        <Link to="/" className="ww-back"><ChevronLeftIcon />Explore</Link>
        <h1 className="disp province__title">No province or territory “{code}”</h1>
        <p className="muted">Choose one from the Explore page.</p>
      </div>
    );
  }

  // Alphabetical, as the server returns them in database order.
  const names = rivers ? Object.keys(rivers).sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'en-CA')) : [];
  const text = filter.trim().toLowerCase();
  const shown = text ? names.filter(river => displayTitle(river).toLowerCase().includes(text)) : names;
  const stationCount = names.reduce((sum, river) => sum + rivers[river].length, 0);

  return (
    <div className="page province">
      <Link to="/" className="ww-back"><ChevronLeftIcon />Explore</Link>
      <header className="province__head">
        <div>
          <h1 className="disp province__title">{name}</h1>
          {rivers && <p className="province__meta">{names.length} rivers and lakes, {stationCount} stations</p>}
        </div>
        {rivers && names.length > 12 && (
          <label className="ww-filter">
            <SearchIcon />
            <input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter rivers and lakes" aria-label={`Filter ${name}’s rivers and lakes`} />
          </label>
        )}
      </header>

      {failed ? (
        <div className="ww-empty">
          <b>Couldn’t load {name}’s rivers</b>
          <span>Check your connection and refresh to try again.</span>
        </div>
      ) : !rivers ? (
        <Spinner message="Loading rivers…" />
      ) : shown.length === 0 ? (
        <div className="ww-empty">
          <b>No rivers or lakes match “{filter.trim()}”</b>
          <span>Try part of the name, like “{displayTitle(names[0] || 'Fraser River').split(' ')[0]}”.</span>
        </div>
      ) : (
        <ul className="ww-card province__list">
          {shown.map(river => (
            <li key={river}>
              <Link to={`/river/${encodeURIComponent(river)}`}>
                <span className="province__river">{displayTitle(river)}</span>
                <span className="province__count">{rivers[river].length}</span>
                <ChevronRightIcon className="province__chev" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Province;
