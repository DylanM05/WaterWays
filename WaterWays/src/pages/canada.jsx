import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Navbar, ListGroup, Button, Container, FormControl, Form } from 'react-bootstrap';
import { useNavigate, Outlet } from 'react-router-dom';
import '../styling/canada.css';
import ThemeToggle from '../components/buttons/ThemeToggle';


const provincesAndTerritories = [
  { name: 'Alberta', abbreviation: 'AB' },
  { name: 'British Columbia', abbreviation: 'BC' },
  { name: 'Manitoba', abbreviation: 'MB' },
  { name: 'New Brunswick', abbreviation: 'NB' },
  { name: 'Newfoundland and Labrador', abbreviation: 'NL' },
  { name: 'Nova Scotia', abbreviation: 'NS' },
  { name: 'Ontario', abbreviation: 'ON' },
  { name: 'Prince Edward Island', abbreviation: 'PE' },
  { name: 'Quebec', abbreviation: 'QC' },
  { name: 'Saskatchewan', abbreviation: 'SK' },
  { name: 'Northwest Territories', abbreviation: 'NT' },
  { name: 'Nunavut', abbreviation: 'NU' },
  { name: 'Yukon', abbreviation: 'YT' }
];

const Canada = ({ setRivers, rivers }) => {
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expanding, setExpanding] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const navigate = useNavigate();
  const searchRef = useRef(null);

  useEffect(() => {
    if (selectedProvince) {
      const fetchRivers = async () => {
        setLoading(true);
        try {
          const response = await axios.get(`http://localhost:3000/details/rivers/${selectedProvince.abbreviation.toLowerCase()}`);
          setRivers(response.data);
          setLoading(false);
        } catch (err) {
          setError(err.response ? err.response.data.error : 'Error fetching rivers');
          setLoading(false);
        }
      };

      fetchRivers();
    }
  }, [selectedProvince, setRivers]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchResults([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleBackClick = () => {
    setSelectedProvince(null);
    setRivers({});
    setError(null);
  };

  const handleLakeClick = (lakeName) => {
    navigate(`/canada/river/${lakeName}`);
    setSidebarOpen(false);
  };

  const handleToggleClick = () => {
    if (!sidebarOpen) {
      setExpanding(true);
      setTimeout(() => {
        setSidebarOpen(true);
        setExpanding(false);
      }, 300); // Match the duration of the animation
    } else {
      setSidebarOpen(false);
    }
  };

  const handleSearchChange = async (e) => {
    setSearchQuery(e.target.value);
    if (e.target.value.length > 2) {
      try {
        const response = await axios.get(`http://localhost:3000/search/search?name=${e.target.value}`);
        setSearchResults(response.data);
      } catch (error) {
        console.error('Error searching for stations:', error);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleSearchResultClick = (stationId) => {
    navigate(`/canada/station-details/${stationId}`);
    setSearchQuery('');
    setSearchResults([]);
    setSidebarOpen(false);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  const filteredRivers = Object.keys(rivers).filter(riverName =>
    riverName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="canada-container">
      {/* Navbar - Toggle button always fixed when sidebar is closed */}
      {!sidebarOpen && (
        <div className='fixed-controls'>
        <Button className="sidebar-toggle fixed-toggle" onClick={handleToggleClick}>
          ☰
        </Button>
        <ThemeToggle />
        </div>
      )}

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "visible" : "hidden"}`}>
        {/* Move toggle button inside sidebar when open */}
        {sidebarOpen && (
        <div className="sidebar-header">
        {sidebarOpen && (
          <Button className="sidebar-toggle inside-sidebar" onClick={handleToggleClick}>
            ☰
          </Button>
        )}
        {sidebarOpen && <ThemeToggle />}
      </div>
        )}
        <Form ref={searchRef} className="d-flex position-relative" style={{ padding: '10px 15px', marginTop: '40px' }}>
          <FormControl
            type="text"
            placeholder="Search"
            className="search-bar"
            style={{ height: '38px', zIndex: 1, backgroundColor: 'white' }} // Set a fixed height and z-index
            value={searchQuery}
            onChange={handleSearchChange}
          />
          {searchQuery && (
            <Button variant="link" className="clear-search" onClick={handleClearSearch} style={{ position: 'absolute', right: '20px', top: '10px', zIndex: 2 }}>
              ✖
            </Button>
          )}
          {searchResults.length > 0 && (
            <ListGroup className="search-results" style={{ position: 'absolute', top: '100%', width: '100%', zIndex: 1 }}>
              {searchResults.map((result, index) => (
                <ListGroup.Item key={index} onClick={() => handleSearchResultClick(result.station_id)}>
                  {result.stationName}
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Form>
        <ListGroup className="sidebar-content">
          {selectedProvince ? (
            <>
              <ListGroup.Item className='sidebar-item'>
                <Button variant="link" onClick={handleBackClick} className='sidebar-item-button'>Back</Button>
              </ListGroup.Item>
              {loading ? (
                <ListGroup.Item>Loading...</ListGroup.Item>
              ) : error ? (
                <ListGroup.Item>{error}</ListGroup.Item>
              ) : (
                filteredRivers.map((riverName, index) => (
                  <ListGroup.Item key={index} className='sidebar-item'>
                    <Button variant="link" onClick={() => handleLakeClick(riverName)} className='sidebar-item-button'>{riverName}</Button>
                  </ListGroup.Item>
                ))
              )}
            </>
          ) : (
            provincesAndTerritories.map((province, index) => (
              <ListGroup.Item key={index} className="sidebar-item">
                <Button variant="link" onClick={() => setSelectedProvince(province)} className='sidebar-item-button'>{province.name}</Button>
              </ListGroup.Item>
            ))
          )}
        </ListGroup>
      </div>

      {/* Content */}
      <div className={`content ${sidebarOpen ? "" : "full-width"}`}>
        <Outlet />
      </div>
    </div>
  );
};

export default Canada;