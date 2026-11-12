import React from 'react';
import { Link } from 'react-router-dom';
import RiverSearch from '../components/riverSearch/RiverSearch';
import SavedStations from '../components/home/SavedStations';
import useMediaQuery from '../components/home/useMediaQuery';
import useProvinceCounts from '../components/home/useProvinceCounts';
import { ChevronRightIcon } from '../components/icons/Icons';
import { PROVINCES } from '../components/utility/names';
import './styling/home.css';

const provinces = PROVINCES.filter(province => !province.territory);
const territories = PROVINCES.filter(province => province.territory);

const stationCount = (counts, code) => {
  const stations = counts?.[code]?.stations;
  if (!stations) return null;
  return `${stations.toLocaleString('en-CA')} ${stations === 1 ? 'station' : 'stations'}`;
};

// Tiles on wider screens; on phones, rows in one card as in the iPhone app.
const Places = ({ title, places, rows, counts }) => (
  <>
    <h2 className="disp home__heading">{title}</h2>
    {rows ? (
      <ul className="ww-card home__rows">
        {places.map(place => {
          const count = stationCount(counts, place.code);
          return (
            <li key={place.code}>
              <Link to={`/province/${place.code.toLowerCase()}`}>
                <span className="home__badge">{place.code}</span>
                <span className="home__row-name">{place.name}</span>
                {count && <span className="home__count">{count}</span>}
                <ChevronRightIcon className="home__chev" />
              </Link>
            </li>
          );
        })}
      </ul>
    ) : (
      <ul className="home__tiles">
        {places.map(place => {
          const count = stationCount(counts, place.code);
          return (
            <li key={place.code}>
              <Link to={`/province/${place.code.toLowerCase()}`} className="home__tile">
                <b>{place.code}</b>
                <span>{place.name}</span>
                {count && <i className="home__count">{count}</i>}
              </Link>
            </li>
          );
        })}
      </ul>
    )}
  </>
);

const Home = () => {
  // One search at a time, since each animates its own river.
  const phone = useMediaQuery('(max-width: 767px)');
  const counts = useProvinceCounts();

  return (
    <div className="home">
      <div className="page home__hero">
        <h1 className="disp home__title">{phone ? 'Explore' : 'How’s the river today?'}</h1>
      </div>
      {phone
        ? <RiverSearch size="md" ends="cut" placeholder="Search" className="home__search" />
        : <RiverSearch size="lg" ends="cut" className="home__search" />}

      <div className="page home__body">
        <SavedStations compact={phone} />
        <section className="home__section home__places" aria-label="Provinces and territories">
          <Places title="Provinces" places={provinces} rows={phone} counts={counts} />
          <Places title="Territories" places={territories} rows={phone} counts={counts} />
        </section>
        <details className="ww-card home__install">
          <summary>Add WaterWays to your phone’s home screen</summary>
          <div className="home__install-steps">
            <div>
              <h3>iPhone (Safari)</h3>
              <ol>
                <li>Tap the Share button.</li>
                <li>Choose “Add to Home Screen”, then “Add”.</li>
              </ol>
            </div>
            <div>
              <h3>Android (Chrome)</h3>
              <ol>
                <li>Tap the ⋮ menu.</li>
                <li>Choose “Add to Home screen”, then “Add”.</li>
              </ol>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default Home;
