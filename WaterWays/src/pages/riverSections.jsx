import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import FavouritesSubscribeToast from '../components/toasts/subscriptionRequiredToast';

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
        console.error('Error fetching water data:', error);
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
        <h1 className="text-3xl font-bold text-center mb-6" style={{ color: 'var(--primary-colour)' }}>{riverName}</h1>
        <p className="text-center" style={{ color: 'var(--text-colour)', opacity: '0.7' }}>Loading sections or no data available.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-6" style={{ color: 'var(--primary-colour)' }}>{riverName}</h1>
      <div className="space-y-6">
        {sections.map((section, index) => (
          <div key={index} className="relative">
            <Link 
              to={`/station-details/${section.station_id}`} 
              className="block"
              style={{ textDecoration: 'none' }}
            >
              <div className="bg-background-card rounded-lg shadow-md border border-border p-6 transition-all hover:-translate-y-1 hover:shadow-lg">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-colour)' }}>{section.section}</h2>
                  
                  {isSignedIn && (
                    <button
                      onClick={(e) => toggleFavorite(e, section)}
                      disabled={favoriteLoading[section.station_id]}
                      className="favorite-btn"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '8px',
                        cursor: 'pointer',
                        color: favorites[section.station_id] ? 'var(--primary-colour)' : 'var(--text-colour)',
                        opacity: favoriteLoading[section.station_id] ? 0.6 : 1,
                        position: 'relative',
                        zIndex: 10
                      }}
                      aria-label={favorites[section.station_id] ? "Remove from favorites" : "Add to favorites"}
                    >
                      {favorites[section.station_id] ? <FaHeart size={20} /> : <FaRegHeart size={20} />}
                    </button>
                  )}
                </div>
                
                <p className="mb-2" style={{ color: 'var(--primary-colour)' }}>
                  <span className="font-bold">Station ID:</span> {section.station_id}
                </p>
                
                {latestWaterData[section.station_id] && latestWaterData[section.station_id].data && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {latestWaterData[section.station_id].data.water_level !== undefined &&
                      latestWaterData[section.station_id].data.water_level !== null && (
                        <div className="bg-bg rounded-md p-4 text-center">
                          <div className="text-xl font-bold" style={{ color: 'var(--text-colour)' }}>
                            Water Level
                            <br />
                            {latestWaterData[section.station_id].data.water_level.toFixed(2)} m
                          </div>
                        </div>
                      )}
                    
                    {latestWaterData[section.station_id].data.discharge !== undefined &&
                      latestWaterData[section.station_id].data.discharge !== null && (
                        <div className="bg-bg rounded-md p-4 text-center">
                          <div className="text-xl font-bold" style={{ color: 'var(--text-colour)' }}>
                            Discharge
                            <br />
                            {latestWaterData[section.station_id].data.discharge.toFixed(2)} m³/s
                          </div>
                        </div>
                      )}
                    
                    {latestWaterData[section.station_id].time &&
                      latestWaterData[section.station_id].time !== "Invalid Date" && (
                        <div className="col-span-1 md:col-span-2 mt-2 text-sm" style={{ color: 'var(--text-colour)', opacity: '0.7' }}>
                          <span className="font-bold">Last updated:</span> {latestWaterData[section.station_id].time}
                        </div>
                      )}
                  </div>
                )}
              </div>
            </Link>
          </div>
        ))}
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
