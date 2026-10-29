import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSettings } from '../components/utility/contexts/SettingsContext';
import { useAuth } from '@clerk/clerk-react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';

import StationInfo from '../components/tabs/StationInfo';
import HourlyForecast from '../components/tabs/HourlyForecast';
import CurrentWeatherTab from '../components/tabs/CurrentWeather';
import PressureData from '../components/tabs/PressureData';
import WaterData from '../components/tabs/WaterData';
import WeeklyForecast from '../components/tabs/WeeklyForecast';
import { convertToLocalTime, convertTimeArrayToLocal } from '../components/utility/utility';
import FavouritesSubscribeToast from '../components/toasts/subscriptionRequiredToast';
import WeatherAlerts from '../components/tabs/WeatherAlerts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const ENDPOINTS = {
  coordinates: (id) => `${API_BASE_URL}/details/coordinates/${id}`,
  weather: (id) => `${API_BASE_URL}/details/weather/${id}`,
  forecast: (id) => `${API_BASE_URL}/details/weather/hourly/${id}`,
  pressure: (id) => `${API_BASE_URL}/details/pressure/${id}`,
};

// Add this object to track water data cache
const WATER_DATA_CACHE = {};

const TabButton = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '8px 16px',
      fontSize: '0.875rem',
      fontWeight: '500',
      borderBottom: isActive 
        ? '2px solid var(--primary-colour)' 
        : '2px solid transparent',
      color: isActive 
        ? 'var(--primary-colour)' 
        : 'var(--text-colour)',
      background: 'transparent',
      whiteSpace: 'nowrap',
      transition: 'all 0.2s',
      borderTop: 'none',
      borderLeft: 'none',
      borderRight: 'none',
      cursor: 'pointer'
    }}
    onMouseOver={(e) => {
      if (!isActive) e.currentTarget.style.color = 'var(--hover-colour)';
    }}
    onMouseOut={(e) => {
      if (!isActive) e.currentTarget.style.color = 'var(--text-colour)';
    }}
  >
    {label}
  </button>
);

const ActionButton = ({ label, onClick, icon }) => (
  <button 
    onClick={onClick}
    style={{
      padding: '8px 16px',
      backgroundColor: 'var(--primary-colour)',
      color: 'var(--primary-text-colour)',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      transition: 'background-color 0.2s',
      marginTop: '-8px',
      marginBottom: '10px',
    }}
    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-colour)'}
    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--primary-colour)'}
  >
    {icon && <span>{icon}</span>}
    {label}
  </button>
);

const StationDetails = () => {
  const { stationId } = useParams();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [activeKey, setActiveKey] = useState(settings.defaultTab);
  const [initialLoading, setInitialLoading] = useState(true);
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [stationInfo, setStationInfo] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [pressureData, setPressureData] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [weatherDataError, setWeatherDataError] = useState(null);
  const [forecastDataError, setForecastDataError] = useState(null);
  const [pressureDataError, setPressureDataError] = useState(null);
  const [weeklyDataError, setWeeklyDataError] = useState(null);
  const [stationInfoError, setStationInfoError] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState({ subscribed: false });
  const [waterData, setWaterData] = useState({});
  const [waterDataLoading, setWaterDataLoading] = useState({});
  const [waterDataError, setWaterDataError] = useState({});

  const { isSignedIn, getToken } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const fetchStationCoordinates = async () => {
      setInitialLoading(true);
      
      try {
        const coordinatesResponse = await axios.get(ENDPOINTS.coordinates(stationId));
        setStationInfo(coordinatesResponse.data);
        
      } catch (err) {
        console.error('Error fetching station info:', err);
        setStationInfoError('Failed to load station information.');
      } finally {
        setInitialLoading(false);
      }

      // After loading basic station info and 1-day water data, fetch other data in parallel
      fetchSecondaryData();
    };

    fetchStationCoordinates();
  }, [stationId]);

  const fetchWaterData = async (days) => {
    const windows = [1, 3, 7, 14, 30];
    if (waterData[days]) return;

    const cachedWindows = WATER_DATA_CACHE[`${stationId}-30`];
    if (cachedWindows) {
      setWaterData(prev => ({ ...prev, ...cachedWindows }));
      return;
    }

    if (windows.some(windowDays => waterDataLoading[windowDays])) return;

    setWaterDataLoading(prev => ({
      ...prev,
      ...Object.fromEntries(windows.map(windowDays => [windowDays, true]))
    }));
    setWaterDataError(prev => ({
      ...prev,
      ...Object.fromEntries(windows.map(windowDays => [windowDays, null]))
    }));
    
    try {
      const response = await axios.get(`${API_BASE_URL}/details/water-data/${stationId}/30`);
      const now = Date.now();
      const dataByWindow = Object.fromEntries(windows.map(windowDays => [
        windowDays,
        response.data.filter(entry => {
          const timestamp = Date.parse(`${entry.date_time.replace(' ', 'T')}Z`);
          return timestamp >= now - windowDays * 24 * 60 * 60 * 1000 && timestamp <= now;
        })
      ]));

      WATER_DATA_CACHE[`${stationId}-30`] = dataByWindow;
      setWaterData(prev => ({ ...prev, ...dataByWindow }));
    } catch (err) {
      console.error('Error fetching 30-day water data:', err);
      setWaterDataError(prev => ({
        ...prev,
        ...Object.fromEntries(windows.map(windowDays => [
          windowDays,
          `Failed to fetch ${windowDays}-day water data.`
        ]))
      }));
    } finally {
      setWaterDataLoading(prev => ({
        ...prev,
        ...Object.fromEntries(windows.map(windowDays => [windowDays, false]))
      }));
    }
  };

  const fetchSecondaryData = async () => {
    setSecondaryLoading(true);
    
    try {
      const promises = [
        // Fetch the longest range once; shorter ranges are derived locally.
        fetchWaterData(30),
        
        // Weather data
        axios.get(ENDPOINTS.weather(stationId))
          .then(res => setWeatherData(res.data))
          .catch(err => {
            console.error('Error fetching weather data:', err);
            setWeatherDataError('Failed to load weather data.');
          }),
        
        // Forecast data; its times are already in the station's time zone.
        axios.get(ENDPOINTS.forecast(stationId))
          .then(res => setForecastData(res.data))
          .catch(err => {
            console.error('Error fetching forecast data:', err);
            setForecastDataError('Failed to load forecast data.');
          }),
        
        // Pressure data
        axios.get(ENDPOINTS.pressure(stationId))
          .then(res => {
            if (res.data && res.data.time) {
              res.data.localTime = convertTimeArrayToLocal(res.data.time);
            }
            setPressureData(res.data);
          })
          .catch(err => {
            console.error('Error fetching pressure data:', err);
            setPressureDataError('Failed to load pressure data.');
          }),
        
        // Environment Canada weather alerts for the station; without them the page just shows none.
        axios.get(`${API_BASE_URL}/details/alerts/${stationId}`)
          .then(res => setAlerts(res.data.alerts || []))
          .catch(() => setAlerts([])),

        // Weekly forecast data
        axios.get(`${API_BASE_URL}/details/weather/weekly/${stationId}`)
          .then(res => setWeeklyData(res.data))
          .catch(err => {
            console.error('Error fetching weekly data:', err);
            setWeeklyDataError('Failed to load weekly forecast data.');
          })
      ];
      
      // Wait for all promises to settle
      await Promise.allSettled(promises);
    } finally {
      setSecondaryLoading(false);
    }
  };

  useEffect(() => {
    if (isSignedIn) {
      checkSubscription();
    }
  }, [isSignedIn]);

  const checkSubscription = async () => {
    if (!isSignedIn) return;
    
    try {
       const token = await getToken();
         const response = await axios.get(`${API_BASE_URL}/sub/status`, {
           headers: { Authorization: `Bearer ${token}` }
         });
         
         setSubscriptionStatus(response.data);
    } catch (err) {
      console.error('Error checking subscription status:', err);
      setSubscriptionStatus({ subscribed: false });
    }
  };

  useEffect(() => {
    const checkFavoriteStatus = async () => {
      if (!isSignedIn || !stationId) return;
      
      try {
        setFavoriteLoading(true);
        const token = await getToken();
        const response = await axios.get(`${API_BASE_URL}/u/favorites/check/${stationId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsFavorite(response.data.isFavorite);
      } catch (err) {
        console.error('Error checking favorite status:', err);
      } finally {
        setFavoriteLoading(false);
      }
    };
    
    checkFavoriteStatus();
  }, [isSignedIn, stationId, getToken]);

  const toggleFavorite = async () => {
    if (!isSignedIn) {
      return;
    }
    
    try {
      setFavoriteLoading(true);
      const token = await getToken();
      
      if (!subscriptionStatus.subscribed) {
        setToastMessage('You need a premium subscription to access favorites. Please upgrade your plan.');
        setShowToast(true);
        return;
      }
      
      if (isFavorite) {
        await axios.delete(`${API_BASE_URL}/u/favorites/${stationId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post(`${API_BASE_URL}/u/favorites`, {
          stationId,
          stationName: stationInfo?.stationName || `Station ${stationId}`,
          province: stationInfo?.province || 'Unknown'
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      setIsFavorite(!isFavorite);
    } catch (err) {
      console.error('Error toggling favorite:', err);
    } finally {
      setFavoriteLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (stationInfoError) {
    return (
      <div className="container mx-auto px-4 mt-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{stationInfoError}</p>
        </div>
      </div>
    );
  }

  const localWeatherTime = weatherData?.time ? convertToLocalTime(weatherData.time) : '';

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6" style={{
        padding: windowWidth < 768 ? '0 8px' : '0'
      }}>
        <div style={{ 
          marginLeft: windowWidth < 480 ? '16px' : (windowWidth < 768 ? '8px' : '0'),
          transition: 'margin 0.3s ease'
        }}>
          <ActionButton label="Back" onClick={() => navigate(-1)} icon="←" />
        </div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-colour)' }}>
          {stationInfo?.stationName}
        </h2>
        
        {isSignedIn && (
          <button
            onClick={toggleFavorite}
            disabled={favoriteLoading}
            className="favorite-btn mr-2"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '8px',
              cursor: favoriteLoading ? 'default' : 'pointer',
              color: isFavorite ? 'var(--primary-colour)' : 'var(--text-colour)',
              opacity: favoriteLoading ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              transition: 'all 0.2s'
            }}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            onMouseOver={(e) => {
              if (!favoriteLoading) {
                e.currentTarget.style.backgroundColor = 'rgba(var(--primary-colour-rgb), 0.1)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {isFavorite ? <FaHeart size={22} /> : <FaRegHeart size={22} />}
          </button>
        )}
        {!isSignedIn && <div className="w-10"></div>}
      </div>

      {/* Add Toast notification */}
      <FavouritesSubscribeToast 
        showToast={showToast}
        setShowToast={setShowToast}
        toastMessage={toastMessage}
      />
      
      <WeatherAlerts alerts={alerts} />

      {/* Tab Navigation */}
      <div style={{ borderBottom: '1px solid var(--border-colour)', marginBottom: '1.5rem' }}>
        <div className="flex overflow-x-auto hide-scrollbar">
          <TabButton 
            label="Water Data" 
            isActive={activeKey === 'water'} 
            onClick={() => setActiveKey('water')} 
          />
          <TabButton 
            label="Pressure Data" 
            isActive={activeKey === 'pressure'} 
            onClick={() => setActiveKey('pressure')} 
          />
          <TabButton 
            label="Current Weather" 
            isActive={activeKey === 'weather'} 
            onClick={() => setActiveKey('weather')} 
          />
          <TabButton 
            label="Hourly Forecast" 
            isActive={activeKey === 'hourlyforecast'} 
            onClick={() => setActiveKey('hourlyforecast')} 
          />
          <TabButton 
            label="Weekly Forecast" 
            isActive={activeKey === 'weeklyforecast'} 
            onClick={() => setActiveKey('weeklyforecast')} 
          />
          <TabButton 
            label="Map" 
            isActive={activeKey === 'map'} 
            onClick={() => setActiveKey('map')} 
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6 min-h-screen">
        {activeKey === 'map' && <StationInfo stationInfo={stationInfo} />}
        {activeKey === 'water' && (
          <WaterData 
            stationId={stationId} 
            waterData={waterData}
            waterDataLoading={waterDataLoading}
            waterDataError={waterDataError}
            onFetchWaterData={fetchWaterData}
          />
        )}
        {activeKey === 'weather' && (
          <CurrentWeatherTab 
            weatherData={weatherData} 
            localWeatherTime={localWeatherTime} 
            error={weatherDataError} 
            loading={secondaryLoading && !weatherData}
          />
        )}
        {activeKey === 'hourlyforecast' && (
          <HourlyForecast 
            forecastData={forecastData} 
            pressureData={pressureData} 
            error={forecastDataError} 
            loading={secondaryLoading && !forecastData}
          />
        )}
        {activeKey === 'pressure' && (
          <PressureData 
            pressureData={pressureData} 
            error={pressureDataError} 
            loading={secondaryLoading && !pressureData}
          />
        )}
        {activeKey === 'weeklyforecast' && (
          <WeeklyForecast 
            weeklyData={weeklyData} 
            error={weeklyDataError} 
            loading={secondaryLoading && !weeklyData}
          />
        )}
      </div>
    </div>
  );
};

export default StationDetails;