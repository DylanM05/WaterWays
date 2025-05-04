import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate, Outlet } from 'react-router-dom';
import ThemeToggle from '../components/buttons/ThemeToggle';
import FooterAd from '../components/ads/FooterAd';
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

  //const API_BASE_URL = 'http://localhost:42069';
  const API_BASE_URL = 'https://backend.dylansserver.top'; // Uncomment this line to use the production server
  useEffect(() => {
    if (selectedProvince) {
      const fetchRivers = async () => {
        setLoading(true);
        try {
          const response = await axios.get(`${API_BASE_URL}/details/rivers/${selectedProvince.abbreviation.toLowerCase()}`);
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


  const handleBackClick = () => {
    setSelectedProvince(null);
    setError(null);
  };

  const handleLakeClick = (riverName) => {
    navigate(`/river/${riverName}`);
    setSidebarOpen(false);
  };

  const handleSearchChange = async (e) => {
    setSearchQuery(e.target.value);
    if (e.target.value.length > 2) {
      try {
        // If no province is selected, search across all provinces
        if (!selectedProvince) {
          const response = await axios.get(`${API_BASE_URL}/search/search-all-rivers?query=${e.target.value}`);
          setSearchResults(response.data);
        } else {
          const filteredResults = Object.keys(rivers)
            .filter(riverName => riverName.toLowerCase().includes(e.target.value.toLowerCase()))
            .map(riverName => {
              const firstSection = rivers[riverName][0];
              return {
                stationName: riverName,
                baseName: riverName, 
                station_id: firstSection.station_id,
                province: selectedProvince.abbreviation
              };
            });
          setSearchResults(filteredResults);
        }
      } catch (error) {
        console.error('Error searching for stations:', error);
        setError(error.response?.data?.error || 'Error searching for stations');
        setSearchResults([]);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleSearchResultClick = (result) => {
    try {
      console.log("Search result clicked:", result);
      
      const riverName = result.stationName;
      
      if (!rivers[riverName] && result.province) {
        const province = provincesAndTerritories.find(p => 
          p.abbreviation === result.province);
        
        if (province) {
          setSelectedProvince(province);
        }
      }
      
      navigate(`/river/${riverName}`);
      
      setSidebarOpen(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error) {
      console.error("Error handling search result click:", error);
      setError("Failed to navigate to river page");
    }
  };


  const filteredRivers = selectedProvince && Object.keys(rivers).length > 0
    ? Object.keys(rivers).filter(riverName =>
        riverName.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

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
              className="w-full px-3 py-2 pr-8 rounded border border-border-colour bg-background-colour text-text-colour search-text-box"
            />
            {searchQuery && (
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-text-colour clear-search-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          {searchQuery && searchQuery.length > 2 ? (
            <div>
              {searchResults.length > 0 ? (
                searchResults.map((result, index) => (
                  <div 
                  key={index}
                  onClick={() => handleSearchResultClick(result)}
                  className="sidebar-item"
                >
                  {result.stationName} ({result.province})
                </div>
                ))
              ) : (
                <div className="p-4 text-center text-text-colour">No results found</div>
              )}
            </div>
          ) : selectedProvince ? (
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

      {/* Add this new overlay div */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} 
        onClick={() => setSidebarOpen(false)}
      ></div>

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
                {/* Footer */}
                <FooterAd />
      </div>
    </div>
  );
};

export default Canada;