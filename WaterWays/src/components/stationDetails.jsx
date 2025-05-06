import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import moment from 'moment';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth, useUser } from '@clerk/clerk-react';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

import StationInfo from './tabs/StationInfo';
import HourlyForecast from './tabs/HourlyForecast';
import CurrentWeatherTab from './tabs/CurrentWeather';
import PressureData from './tabs/PressureData';
import WaterData from './tabs/WaterData';
import WeeklyForecast from './tabs/WeeklyForecast';
import { convertToLocalTime, convertTimeArrayToLocal } from './tabs/utility';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const API_BASE_URL = 'https://backend.dylansserver.top';

/* const API_BASE_URL = 'http://localhost:42069'; // For local development */
const ENDPOINTS = {
  coordinates: (id) => `${API_BASE_URL}/details/coordinates/${id}`,
  waterData: (id) => `${API_BASE_URL}/details/${id}`,
  weather: (id) => `${API_BASE_URL}/details/weather/${id}`,
  forecast: (id) => `${API_BASE_URL}/details/weather/hourly/${id}`,
  pressure: (id) => `${API_BASE_URL}/details/pressure/${id}`,
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [waterChartTab, setWaterChartTab] = useState('level');
  const [pressureChartTab, setPressureChartTab] = useState('both');
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [stationInfo, setStationInfo] = useState(null);
  const [waterData, setWaterData] = useState([]);
  const [weatherData, setWeatherData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [pressureData, setPressureData] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [waterDataError, setWaterDataError] = useState(null);
  const [weatherDataError, setWeatherDataError] = useState(null);
  const [forecastDataError, setForecastDataError] = useState(null);
  const [pressureDataError, setPressureDataError] = useState(null);
  const [weeklyDataError, setWeeklyDataError] = useState(null);
  const [stationInfoError, setStationInfoError] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

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
    const fetchStationData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const coordinatesResponse = await axios.get(ENDPOINTS.coordinates(stationId));
        setStationInfo(coordinatesResponse.data);
      } catch (err) {
        console.error('Error fetching station info:', err);
        setStationInfoError('Failed to load station information.');
      }

      // Fetch water data
      try {
        const waterDataResponse = await axios.get(ENDPOINTS.waterData(stationId));
        setWaterData(waterDataResponse.data || []);
      } catch (err) {
        console.error('Error fetching water data:', err);
        const endDate = moment().format('YYYY-MM-DD');
        const startDate = moment().subtract(7, 'days').format('YYYY-MM-DD');
        setWaterDataError(
          <>
            Failed to load water data.
            <br />
            We either have not retrieved any data for this station, or the station is not recording any data.
            <br />
            You can view the master data <a href={`https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${stationId}&mode=Table&startDate=${startDate}&endDate=${endDate}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-secondary underline">here</a>!
          </>
        );
        setWaterData([]);
      }

      try {
        const weatherResponse = await axios.get(ENDPOINTS.weather(stationId));
        setWeatherData(weatherResponse.data);
      } catch (err) {
        console.error('Error fetching weather data:', err);
        setWeatherDataError('Failed to load weather data.');
      }

      try {
        const forecastResponse = await axios.get(ENDPOINTS.forecast(stationId));
        if (forecastResponse.data && forecastResponse.data.time) {
          forecastResponse.data.localTime = convertTimeArrayToLocal(forecastResponse.data.time);
        }
        setForecastData(forecastResponse.data);
      } catch (err) {
        console.error('Error fetching forecast data:', err);
        setForecastDataError('Failed to load forecast data.');
      }

      try {
        const pressureResponse = await axios.get(ENDPOINTS.pressure(stationId));
        if (pressureResponse.data && pressureResponse.data.time) {
          pressureResponse.data.localTime = convertTimeArrayToLocal(pressureResponse.data.time);
        }
        setPressureData(pressureResponse.data);
      } catch (err) {
        console.error('Error fetching pressure data:', err);
        setPressureDataError('Failed to load pressure data.');
      }

      try {
        const weeklyResponse = await axios.get(`${API_BASE_URL}/details/weather/weekly/${stationId}`);
        setWeeklyData(weeklyResponse.data);
      } catch (err) {
        console.error('Error fetching weekly data:', err);
        setWeeklyDataError('Failed to load weekly forecast data.');
      }

      setLoading(false);
    };

    fetchStationData();
  }, [stationId]);

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

  if (loading) {
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
            waterData={waterData} 
            waterChartTab={waterChartTab} 
            setWaterChartTab={setWaterChartTab} 
            recordsPerPage={recordsPerPage} 
            setRecordsPerPage={setRecordsPerPage} 
            currentPage={currentPage} 
            setCurrentPage={setCurrentPage}
            error={waterDataError} 
          />
        )}
        {activeKey === 'weather' && (
          <CurrentWeatherTab 
            weatherData={weatherData} 
            localWeatherTime={localWeatherTime} 
            error={weatherDataError} 
          />
        )}
        {activeKey === 'hourlyforecast' && (
          <HourlyForecast 
            forecastData={forecastData} 
            pressureData={pressureData} 
            error={forecastDataError} 
          />
        )}
        {activeKey === 'pressure' && (
          <PressureData 
            pressureData={pressureData} 
            error={pressureDataError} 
          />
        )}
        {activeKey === 'weeklyforecast' && (
          <WeeklyForecast 
            weeklyData={weeklyData} 
            error={weeklyDataError} 
          />
        )}
      </div>
    </div>
  );
};

export default StationDetails;
