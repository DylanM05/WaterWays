import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useNavigate, Outlet } from 'react-router-dom';
import './styling/canada.css';
import Sidebar from '../components/sidebar/sidebar';

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

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
      <Sidebar 
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        selectedProvince={selectedProvince}
        loading={loading}
        error={error}
        filteredRivers={filteredRivers}
        provincesAndTerritories={provincesAndTerritories}
        handleSearchChange={handleSearchChange}
        handleSearchResultClick={handleSearchResultClick}
        handleBackClick={handleBackClick}
        handleLakeClick={handleLakeClick}
        setSelectedProvince={setSelectedProvince}
        searchRef={searchRef}
      />

      {/* Main content container */}
      <div className={`content ${!sidebarOpen ? 'full-width' : ''}`}>
        <Outlet />
      </div>
    </div>
  );
};

export default Canada;