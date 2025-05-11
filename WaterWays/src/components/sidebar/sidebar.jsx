import React from 'react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../buttons/ThemeToggle';
import { SignedIn, SignedOut, SignInButton } from '@clerk/clerk-react';
import { FaHeart, FaCog } from 'react-icons/fa';
import '../../pages/styling/canada.css';

const Sidebar = ({
  sidebarOpen,
  setSidebarOpen,
  searchQuery,
  setSearchQuery,
  searchResults,
  selectedProvince,
  loading,
  error,
  filteredRivers,
  provincesAndTerritories,
  handleSearchChange,
  handleSearchResultClick,
  handleBackClick,
  handleLakeClick,
  setSelectedProvince,
  searchRef
}) => {
  const navigate = useNavigate();

  return (
    <>
      <div className={`sidebar ${sidebarOpen ? 'visible' : 'hidden'}`}>
        <div className="sidebar-header">
          <div className="sidebar-header-left">
            <ThemeToggle />
          </div>
          <div className="sidebar-header-center">
            <div className="auth-controls">
              <SignedOut>
                <SignInButton 
                  className="custom-sign-in-button" 
                  style={{
                    backgroundColor: 'var(--card-bg-colour)',
                    color: 'var(--text-colour)',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginLeft: '28px'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--primary-colour)';
                    e.currentTarget.style.color = 'var(--primary-text-colour)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--card-bg-colour)';
                    e.currentTarget.style.color = 'var(--text-colour)';
                  }}
                />
              </SignedOut>
              <SignedIn>
                <div className="auth-buttons">
                  <button 
                    onClick={() => navigate('/favourites')} 
                    className="sidebar-item icon-button"
                    title="Favourites"
                    aria-label="Favourites"
                  >
                    <FaHeart size={18} />
                  </button>
                  <button 
                    onClick={() => navigate('/settings')} 
                    className="sidebar-item icon-button"
                    title="Settings"
                    aria-label="Settings"
                  >
                    <FaCog size={18} />
                  </button>
                </div>
              </SignedIn>
            </div>
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

      {/* Overlay div */}
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
    </>
  );
};

export default Sidebar;