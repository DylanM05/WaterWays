import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Nav, Tab, Spinner, Alert, Button } from 'react-bootstrap';
import axios from 'axios';
import moment from 'moment';
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
import CurrentWeatherTab from './tabs/currentWeather';
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

const API_BASE_URL = 'http://localhost:3000';
const ENDPOINTS = {
  coordinates: (id) => `${API_BASE_URL}/details/coordinates/${id}`,
  waterData: (id) => `${API_BASE_URL}/details/${id}`,
  weather: (id) => `${API_BASE_URL}/details/weather/${id}`,
  forecast: (id) => `${API_BASE_URL}/details/weather/hourly/${id}`,
  pressure: (id) => `${API_BASE_URL}/details/pressure/${id}`,
};

const StationDetails = () => {
  const { stationId } = useParams();
  const navigate = useNavigate();
  const [activeKey, setActiveKey] = useState('water');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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


  useEffect(() => {
    const fetchStationData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch station info first as it's critical
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
            You can view the master data <a href={`https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${stationId}&mode=Table&startDate=${startDate}&endDate=${endDate}`} target="_blank" rel="noopener noreferrer">here</a>!
          </>
        );
        setWaterData([]);
      }




      // Fetch weather data
      try {
        const weatherResponse = await axios.get(ENDPOINTS.weather(stationId));
        setWeatherData(weatherResponse.data);
      } catch (err) {
        console.error('Error fetching weather data:', err);
        setWeatherDataError('Failed to load weather data.');
      }

      // Fetch forecast data
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

      // Fetch pressure data
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

      // Fetch weekly data
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

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '300px' }}>
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  // Only show critical error if station info is missing
  if (stationInfoError) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">{stationInfoError}</Alert>
      </Container>
    );
  }

  const localWeatherTime = weatherData?.time ? convertToLocalTime(weatherData.time) : '';

  return (
    <Container className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <Button variant="outline-secondary" onClick={() => navigate(-1)}>
          &larr; Back
        </Button>
        <h2>{stationInfo?.stationName}</h2>
        <div style={{ width: '85px' }}></div>
      </div>
      <Tab.Container activeKey={activeKey} onSelect={(k) => setActiveKey(k)}>
        <Nav variant="tabs" className="mb-3">
          <Nav.Item><Nav.Link eventKey="water">Water Data</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="pressure">Pressure Data</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="weather">Current Weather</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="hourlyforecast">Hourly Forecast</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="weeklyforecast">Weekly Forecast</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="map">Map</Nav.Link></Nav.Item>
        </Nav>

        <Tab.Content style={{ minHeight: '100vh', overflow: 'auto' }}>
          <Tab.Pane eventKey="map"><StationInfo stationInfo={stationInfo} /></Tab.Pane>
          <Tab.Pane eventKey="water">
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
          </Tab.Pane>
          <Tab.Pane eventKey="weather">
            <CurrentWeatherTab weatherData={weatherData} localWeatherTime={localWeatherTime} error={weatherDataError} />
          </Tab.Pane>
          <Tab.Pane eventKey="hourlyforecast">
            <HourlyForecast forecastData={forecastData} pressureData={pressureData} error={forecastDataError} />
          </Tab.Pane>
          <Tab.Pane eventKey="pressure">
            <PressureData pressureData={pressureData} error={pressureDataError} />
          </Tab.Pane>
          <Tab.Pane eventKey="weeklyforecast">
            <WeeklyForecast weeklyData={weeklyData} error={weeklyDataError} />
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </Container>
  );
};

export default StationDetails;