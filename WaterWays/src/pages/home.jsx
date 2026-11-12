import React from 'react';
import { Link } from 'react-router-dom';
import RiverSearch from '../components/riverSearch/RiverSearch';
import SavedStations from '../components/home/SavedStations';
import useMediaQuery from '../components/home/useMediaQuery';
import { ChevronRightIcon } from '../components/icons/Icons';
import { PROVINCES } from '../components/utility/names';
import './styling/home.css';

const provinces = PROVINCES.filter(province => !province.territory);
const territories = PROVINCES.filter(province => province.territory);

// Tiles on wider screens; on phones, rows in one card as in the iPhone app.
const Places = ({ title, places, rows }) => (
  <>
    <h2 className="disp home__heading">{title}</h2>
    {rows ? (
      <ul className="ww-card home__rows">
        {places.map(place => (
          <li key={place.code}>
            <Link to={`/province/${place.code.toLowerCase()}`}>
              <span className="home__badge">{place.code}</span>
              <span className="home__row-name">{place.name}</span>
              <ChevronRightIcon className="home__chev" />
            </Link>
          </li>
        ))}
      </ul>
    ) : (
      <ul className="home__tiles">
        {places.map(place => (
          <li key={place.code}>
            <Link to={`/province/${place.code.toLowerCase()}`} className="home__tile">
              <b>{place.code}</b>
              <span>{place.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    )}
  </>
);

const Home = () => {
  // One search at a time, since each animates its own river.
  const phone = useMediaQuery('(max-width: 767px)');

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
          <Places title="Provinces" places={provinces} rows={phone} />
          <Places title="Territories" places={territories} rows={phone} />
        </section>
      </div>
    </div>
  );
};

export default Home;
