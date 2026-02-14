import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';
import { FaHeart, FaRegHeart, FaTint, FaWater } from 'react-icons/fa';
import { WiTime4 } from 'react-icons/wi';
import FavouritesSubscribeToast from '../components/toasts/subscriptionRequiredToast';
import '../pages/styling/RiverSection.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const RiverSections = ({ rivers }) => {
  const { riverName } = useParams();
  const [sections, setSections] = useState([]);
  const [latestWaterData, setLatestWaterData] = useState({});
  const [favorites, setFavorites] = useState({});
  const [favoriteLoading, setFavoriteLoading] = useState({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState({ subscribed: false });
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  
  const isMounted = useRef(true);
  
  const { isSignedIn, getToken } = useAuth();
  
  useEffect(() => {
    if (rivers && rivers[riverName]) {
      setSections(rivers[riverName]);
    } else {
      setSections([]);
    }
  }, [rivers, riverName]);

  useEffect(() => {
    if (!isSignedIn || !sections.length) return;

    const checkFavorites = async () => {
      try {
        const token = await getToken();
        
        const favoritesStatus = {};
        for (const section of sections) {
          try {
            setFavoriteLoading(prev => ({ ...prev, [section.station_id]: true }));
            const response = await axios.get(`${API_BASE_URL}/u/favorites/check/${section.station_id}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            favoritesStatus[section.station_id] = response.data.isFavorite;
          } catch (err) {
            console.error(`Error checking favorite for ${section.station_id}:`, err);
            favoritesStatus[section.station_id] = false;
          } finally {
            if (isMounted.current) {
              setFavoriteLoading(prev => ({ ...prev, [section.station_id]: false }));
            }
          }
        }
        
        if (isMounted.current) {
          setFavorites(favoritesStatus);
        }
      } catch (err) {
        console.error('Error checking favorites status:', err);
      }
    };
    
    checkFavorites();
  }, [isSignedIn, sections, getToken]);

  useEffect(() => {
    if (isSignedIn) {
      checkSubscription();
    }
  }, [isSignedIn]);

  const checkSubscription = async () => {
    if (!isSignedIn) return;
    
    try {
      setCheckingSubscription(true);
      const token = await getToken();
      const response = await axios.get(`${API_BASE_URL}/sub/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSubscriptionStatus(response.data);
    } catch (err) {
      console.error('Error checking subscription status:', err);
      setSubscriptionStatus({ subscribed: false });
    } finally {
      setCheckingSubscription(false);
    }
  };

  const toggleFavorite = async (e, section) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isSignedIn) return;
    
    const stationId = section.station_id;
    
    try {
      setFavoriteLoading(prev => ({ ...prev, [stationId]: true }));
      const token = await getToken();
      
      if (!subscriptionStatus.subscribed) {
        setToastMessage('You need a premium subscription to access favorites. Please upgrade your plan.');
        setShowToast(true);
        return;
      }
      
      if (favorites[stationId]) {
        await axios.delete(`${API_BASE_URL}/u/favorites/${stationId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post(`${API_BASE_URL}/u/favorites`, {
          stationId,
          stationName: section.section || `Station ${stationId}`,
          province: section.province || 'Unknown'
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      setFavorites(prev => ({
        ...prev,
        [stationId]: !prev[stationId]
      }));
    } catch (err) {
      console.error('Error toggling favorite:', err);
    } finally {
      setFavoriteLoading(prev => ({ ...prev, [stationId]: false }));
    }
  };

  useEffect(() => {
    isMounted.current = true;

    const fetchLatestWaterData = async () => {
      if (sections.length === 0) return;

      try {
        const dataPromises = sections.map(async (section) => {
          try {
            const response = await axios.get(
              `${API_BASE_URL}/details/latest-water-data/${section.station_id}`
            );
            const dateTime = new Date(response.data.date_time);
            const formattedTime = dateTime.toLocaleString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              hour12: true,
            });
            return { stationId: section.station_id, data: response.data, time: formattedTime };
          } catch (error) {
            console.error(
              `Error fetching latest water data for station ${section.station_id}:`,
              error
            );
            return { stationId: section.station_id, data: null, time: null };
          }
        });

        const data = await Promise.all(dataPromises);
        const dataMap = data.reduce((acc, item) => {
          acc[item.stationId] = item;
          return acc;
        }, {});

        if (isMounted.current) {
          setLatestWaterData(dataMap);
        }
      } catch (error) {
        console.error('Error in fetchLatestWaterData:', error);
      }
    };

    fetchLatestWaterData();

    return () => {
      isMounted.current = false;
    };
  }, [sections]);

  if (!sections.length) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-6" style={{ color: 'var(--primary-colour)' }}>
          {riverName}
        </h1>
        <div 
          className="text-center p-8 rounded-lg"
          style={{ 
            backgroundColor: 'var(--card-bg-colour)',
            borderColor: 'var(--border-colour)',
            border: '1px solid'
          }}
        >
          <p style={{ color: 'var(--text-colour)', opacity: '0.7' }}>
            Loading sections or no data available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 mb-5">
      <h1 
        className="text-2xl font-bold text-center mb-5" 
        style={{ color: 'var(--text-colour)' }}
      >
        {riverName}
      </h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {sections.map((section, index) => {
          const waterData = latestWaterData[section.station_id];
          const isLoading = !waterData;
          
          return (
            <div 
              key={index} 
              className="river-section-card"
              style={{
                backgroundColor: 'var(--card-bg-colour)',
                border: '1px solid var(--border-colour)',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                transform: hoveredCard === section.station_id ? 'translateY(-3px)' : 'translateY(0)',
                boxShadow: hoveredCard === section.station_id ? '0 4px 12px rgba(0, 0, 0, 0.1)' : 'none',
                position: 'relative',
                cursor: 'pointer'
              }}
              onMouseEnter={() => setHoveredCard(section.station_id)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              {/* Card Header */}
              <div 
                className="px-3 py-2 d-flex justify-content-between align-items-center"
                style={{
                  borderBottom: '1px solid var(--border-colour)',
                  backgroundColor: 'rgba(var(--primary-colour-rgb), 0.05)'
                }}
              >
                <div style={{ flex: 1 }}>
                  <span 
                    className="badge"
                    style={{ 
                      backgroundColor: 'var(--primary-colour)', 
                      color: 'var(--primary-text-colour)',
                      fontSize: '0.7rem',
                      padding: '3px 6px'
                    }}
                  >
                    {section.province || 'N/A'}
                  </span>
                </div>
                
                {isSignedIn && (
                  <button
                    onClick={(e) => toggleFavorite(e, section)}
                    disabled={favoriteLoading[section.station_id]}
                    className="favorite-btn"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '6px',
                      cursor: 'pointer',
                      color: favorites[section.station_id] ? 'var(--primary-colour)' : 'var(--text-colour)',
                      opacity: favoriteLoading[section.station_id] ? 0.6 : 1,
                      position: 'relative',
                      zIndex: 10,
                      transition: 'transform 0.2s ease, color 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    aria-label={favorites[section.station_id] ? "Remove from favorites" : "Add to favorites"}
                  >
                    {favorites[section.station_id] ? <FaHeart size={16} /> : <FaRegHeart size={16} />}
                  </button>
                )}
              </div>

              {/* Card Body */}
              <div className="p-3">
                <h2 
                  className="text-base font-semibold mb-2 text-center"
                  style={{ 
                    color: 'var(--text-colour)',
                    borderBottom: '1px solid var(--border-colour)',
                    paddingBottom: '0.4rem'
                  }}
                >
                  {section.section}
                </h2>
                
                <div className="text-center mb-2">
                  <span style={{ color: 'var(--text-colour)', fontSize: '0.8rem', opacity: 0.8 }}>
                    ID: <strong>{section.station_id}</strong>
                  </span>
                </div>

                {/* Water Data */}
                {isLoading ? (
                  <div className="text-center my-2">
                    <div className="spinner-border spinner-border-sm" style={{ color: 'var(--text-colour)' }} role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                  </div>
                ) : waterData?.data ? (
                  <div className="space-y-2">
                    {waterData.data.water_level !== undefined && waterData.data.water_level !== null && (
                      <div 
                        className="p-2 rounded text-center"
                        style={{ backgroundColor: 'rgba(var(--primary-colour-rgb), 0.1)' }}
                      >
                        <FaTint 
                          size={16} 
                          style={{ color: 'var(--text-colour)', marginBottom: '0.15rem' }} 
                        />
                        <div className="mt-1">
                          <div className="small" style={{ color: 'var(--text-colour)', opacity: 0.8, fontSize: '0.75rem' }}>
                            Water Level
                          </div>
                          <div 
                            className="fw-bold" 
                            style={{ fontSize: '0.95rem', color: 'var(--text-colour)' }}
                          >
                            {typeof waterData.data.water_level === 'number' 
                              ? waterData.data.water_level.toFixed(2) 
                              : waterData.data.water_level} m
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {waterData.data.discharge !== undefined && waterData.data.discharge !== null && (
                      <div 
                        className="p-2 rounded text-center"
                        style={{ backgroundColor: 'rgba(var(--primary-colour-rgb), 0.05)' }}
                      >
                        <FaWater 
                          size={16} 
                          style={{ color: 'var(--text-colour)', marginBottom: '0.15rem' }} 
                        />
                        <div className="mt-1">
                          <div className="small" style={{ color: 'var(--text-colour)', opacity: 0.8, fontSize: '0.75rem' }}>
                            Discharge
                          </div>
                          <div 
                            className="fw-bold" 
                            style={{ fontSize: '0.95rem', color: 'var(--text-colour)' }}
                          >
                            {typeof waterData.data.discharge === 'number' 
                              ? waterData.data.discharge.toFixed(2) 
                              : waterData.data.discharge} m³/s
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div 
                    className="p-2 rounded text-center"
                    style={{ 
                      backgroundColor: 'rgba(var(--primary-colour-rgb), 0.05)',
                      color: 'var(--text-colour)',
                      opacity: 0.7,
                      fontSize: '0.8rem'
                    }}
                  >
                    No data available
                  </div>
                )}
              </div>

              {/* Card Footer */}
              {waterData?.time && waterData.time !== "Invalid Date" && (
                <div 
                  className="px-3 py-1 text-center"
                  style={{ 
                    borderTop: '1px solid var(--border-colour)',
                    fontSize: '0.7rem',
                    color: 'var(--text-colour)',
                    opacity: 0.7
                  }}
                >
                  <WiTime4 size={14} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                  <span>Last Updated: {waterData.time}</span>
                </div>
              )}

              {/* Stretched Link for Navigation */}
              <Link 
                to={`/station-details/${section.station_id}`}
                className="stretched-link"
                aria-label={`View details for ${section.section}`}
                style={{ position: 'absolute', inset: 0, zIndex: 1 }}
              />
            </div>
          );
        })}
      </div>
      
      <FavouritesSubscribeToast 
        showToast={showToast}
        setShowToast={setShowToast}
        toastMessage={toastMessage}
      />
    </div>
  );
};

export default RiverSections;