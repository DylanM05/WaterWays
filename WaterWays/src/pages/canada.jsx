import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate, Outlet } from 'react-router-dom';
import ThemeToggle from '../components/buttons/ThemeToggle';
import '../styling/canada.css';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const navigate = useNavigate();
  const searchRef = useRef(null);

  useEffect(() => {
    if (selectedProvince) {
      const fetchRivers = async () => {
        setLoading(true);
        try {
          const response = await axios.get(`https://backend.dylansserver.top/details/rivers/${selectedProvince.abbreviation.toLowerCase()}`);
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

  const handleSearchChange = async (e) => {
    setSearchQuery(e.target.value);
    if (e.target.value.length > 2) {
      try {
        const response = await axios.get(`https://backend.dylansserver.top/search/search?name=${e.target.value}`);
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

  const filteredRivers = Object.keys(rivers).filter(riverName =>
    riverName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-background-colour relative">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'visible' : 'hidden'}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-center">
            <ThemeToggle />
          </div>
          <div className="sidebar-header-right">
            <button 
              onClick={() => setSidebarOpen(false)}
              className="sidebar-close-btn"
              aria-label="Close sidebar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Search box */}
        <div className="sidebar-search">
          <div className="relative" ref={searchRef}>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search..."
              className="w-full px-3 py-2 pr-8 rounded border border-border-colour bg-background-colour text-text-colour"
            />
            {searchQuery && (
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-text-colour"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
          
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((result, index) => (
                <div 
                  key={index}
                  className="p-2 hover:bg-hover-colour cursor-pointer text-text-colour"
                  onClick={() => handleSearchResultClick(result.station_id)}
                >
                  {result.stationName}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-content">
          {selectedProvince ? (
            <div>
              <div 
                className="sidebar-item"
                onClick={handleBackClick}
              >
                <span>← Back</span>
              </div>
              
              {loading ? (
                <div className="p-4 text-center text-text-colour">Loading...</div>
              ) : error ? (
                <div className="p-4 text-red-500">{error}</div>
              ) : (
                filteredRivers.map((riverName, index) => (
                  <div 
                    key={index}
                    onClick={() => handleLakeClick(riverName)}
                    className="sidebar-item"
                  >
                    {riverName}
                  </div>
                ))
              )}
            </div>
          ) : (
            provincesAndTerritories.map((province, index) => (
              <div 
                key={index}
                onClick={() => setSelectedProvince(province)}
                className="sidebar-item"
              >
                {province.name}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Toggle button when sidebar is closed */}
      {!sidebarOpen && (
        <button 
          onClick={() => setSidebarOpen(true)}
          className="sidebar-toggle fixed-toggle"
          aria-label="Open sidebar"
        >
          ☰
        </button>
      )}

      {/* Main content container */}
      <div className={`content ${!sidebarOpen ? 'full-width' : ''}`}>
        <Outlet />
      </div>
    </div>
  );
};

export default Canada;