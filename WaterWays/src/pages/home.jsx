import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { SignedIn } from '@clerk/clerk-react';
import { FaHeart, FaSearch } from 'react-icons/fa';
import axios from 'axios';
import { displayTitle } from '../components/utility/names';
import './styling/home.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** Rivers whose name matches, from the server's search across every province. */
function useRiverSearch(query) {
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    // Wait for a pause in typing before asking the server.
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/search/search-all-rivers`, { params: { query: text } });
        if (!cancelled) setResults(data.slice(0, 8));
      } catch (error) {
        console.error('Error searching rivers:', error);
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);
  return { results, searching };
}

const Home = () => {
  const { provinces, openProvince } = useOutletContext();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const { results, searching } = useRiverSearch(query);
  const showResults = query.trim().length >= 3;

  const openRiver = (name) => navigate(`/river/${encodeURIComponent(name)}`);

  return (
    <div className="home">
      <header className="home__hero">
        <h1 className="home__title">WaterWays</h1>
        <p className="home__tagline">
          Live river levels and flows from Environment Canada&apos;s monitoring stations, with the weather and forecast at each one.
        </p>

        <form className="home__search" role="search" onSubmit={(event) => { event.preventDefault(); if (results[0]) openRiver(results[0].stationName); }}>
          <FaSearch className="home__search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search for a river or lake"
            aria-label="Search for a river or lake"
          />
        </form>
        {showResults && (
          <ul className="home__results" aria-live="polite">
            {results.map(result => (
              <li key={`${result.province}|${result.stationName}`}>
                <button type="button" onClick={() => openRiver(result.stationName)}>
                  <span>{displayTitle(result.stationName)}</span>
                  <span className="home__results-province">{result.province}</span>
                </button>
              </li>
            ))}
            {!searching && results.length === 0 && <li className="home__results-empty">No rivers or lakes match “{query.trim()}”.</li>}
          </ul>
        )}

        <SignedIn>
          <Link to="/favourites" className="home__favourites">
            <FaHeart aria-hidden="true" /> Your favourites
          </Link>
        </SignedIn>
      </header>

      <section className="home__section">
        <h2 className="home__heading">Browse by province or territory</h2>
        <div className="home__provinces">
          {provinces.map(province => (
            <button key={province.abbreviation} type="button" className="home__province" onClick={() => openProvince(province)}>
              <span className="home__province-code">{province.abbreviation}</span>
              {province.name}
            </button>
          ))}
        </div>
      </section>

      <section className="home__section home__features">
        <div>
          <h3>Water</h3>
          <p>Levels and flows every 10 minutes, the change over the last day and week, and how today compares with the past month.</p>
        </div>
        <div>
          <h3>Weather</h3>
          <p>Current conditions, hourly and 7-day forecasts, pressure trends and Environment Canada weather alerts for each station.</p>
        </div>
        <div>
          <h3>Premium</h3>
          <p>Save stations and whole rivers, and see years of history and official record highs and lows. <Link to="/pricing">See plans</Link></p>
        </div>
      </section>

      <details className="home__install">
        <summary>Add WaterWays to your phone&apos;s home screen</summary>
        <div className="home__install-steps">
          <div>
            <h3>iPhone (Safari)</h3>
            <ol>
              <li>Open WaterWays in Safari.</li>
              <li>Tap the Share button.</li>
              <li>Choose &quot;Add to Home Screen&quot;, then &quot;Add&quot;.</li>
            </ol>
          </div>
          <div>
            <h3>Android (Chrome)</h3>
            <ol>
              <li>Open WaterWays in Chrome.</li>
              <li>Tap the ⋮ menu.</li>
              <li>Choose &quot;Add to Home screen&quot;, then &quot;Add&quot;.</li>
            </ol>
          </div>
        </div>
      </details>
    </div>
  );
};

export default Home;
