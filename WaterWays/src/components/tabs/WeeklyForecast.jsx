import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Badge, Container, Alert } from 'react-bootstrap';
import moment from 'moment';
import '../../styling/WeeklyForecast.css';
import { useSettings } from '../../contexts/SettingsContext'; // Add this import

const weatherCodeMapping = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail'
};

function WeeklyForecast({ weeklyData, error }) {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 768
  );
  const { formatTemperature } = useSettings(); // Add this hook

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getTempColor = (temp) => {
    if (temp < 0) return '#e0f3ff'; 
    if (temp < 10) return '#e6f2ff'; 
    if (temp < 20) return '#fff4e0'; 
    if (temp < 30) return '#fff0d1'; 
    return '#ffdbdb'; 
  };

  const getUvIndexColor = (uvIndex) => {
    if (uvIndex < 3) return 'success';    
    if (uvIndex < 6) return 'warning';    
    if (uvIndex < 8) return 'danger';     
    return 'danger';               
  };
  
  const hasPrecipitation = (index) => {
    if (!weeklyData?.precipitation) return false;
    
    return (
      (weeklyData.precipitation.total && weeklyData.precipitation.total[index] > 0) ||
      (weeklyData.precipitation.rain && weeklyData.precipitation.rain[index] > 0) ||
      (weeklyData.precipitation.showers && weeklyData.precipitation.showers[index] > 0) ||
      (weeklyData.precipitation.snow && weeklyData.precipitation.snow[index] > 0)
    );
  };

  const today = moment().startOf('day');
  
  return (
    <Container fluid className="px-0">
      {error && (
        <Alert variant="danger" className="mb-2">
          {error}
        </Alert>
      )}
      
      <Card style={{ 
        backgroundColor: 'var(--card-bg-colour)', 
        borderColor: 'var(--border-colour)',
        width: '100%',
        borderRadius: windowWidth < 768 ? '0' : '0.25rem',
        border: '1px solid var(--border-colour)',
        borderLeft: windowWidth < 768 ? 'none' : '',
        borderRight: windowWidth < 768 ? 'none' : ''
      }}>
        <Card.Body className={windowWidth < 768 ? "p-2 pb-3" : "p-3"}>
          <h5 
            className="mb-3" 
            style={{ 
              color: 'var(--text-colour)', 
              fontSize: windowWidth < 576 ? '1.15rem' : '1.25rem'
            }}
          >
            7-Day Weather Forecast
          </h5>
          
          {!weeklyData || !weeklyData.dates ? (
            <div className="text-center p-4">
              <p style={{ color: 'var(--text-colour)', opacity: 0.8 }}>Loading weekly forecast data...</p>
            </div>
          ) : (
            <div className="weekly-forecast-container">
              {weeklyData.dates.map((date, index) => {
                const forecastDate = moment(weeklyData.rawDates[index]);
                const isToday = forecastDate.isSame(today, 'day');
                
                return (
                  <Card 
                    key={index} 
                    className="mb-3" 
                    style={{ 
                      backgroundColor: getTempColor(weeklyData.temperature.max[index]),
                      transition: "all 0.2s ease",
                      border: isToday ? '2px solid var(--primary-colour)' : '1px solid var(--border-colour)',
                      borderRadius: '6px'
                    }}
                  >
                    <Card.Body className={windowWidth < 576 ? "p-2" : "p-3"}>
                      <Row className="g-2">
                        {/* Date & Day */}
                        <Col xs={6} md={2} className="mb-2 mb-md-0">
                          <div className="d-flex flex-column align-items-start">
                            <small className="label mb-1">
                              {isToday ? 'Today' : moment(weeklyData.rawDates[index]).format('dddd')}
                            </small>
                            <strong style={{ color: 'var(--text-colour)', fontSize: windowWidth < 576 ? '1rem' : '1.1rem' }}>
                              {date.split(' ').slice(0, 2).join(' ')}
                            </strong>
                          </div>
                        </Col>
                        
                        {/* Weather condition */}
                        <Col xs={6} md={2} className="mb-2 mb-md-0">
                          <div className={`d-flex ${windowWidth < 576 ? 'flex-column align-items-end' : 'flex-column align-items-start'}`}>
                            <strong style={{ color: 'var(--text-colour)' }}>
                              {weatherCodeMapping[weeklyData.weather.codes[index]] || 'Unknown'}
                            </strong>
                          </div>
                        </Col>
                        
                        {/* Temperature */}
                        <Col xs={6} md={2} className="mb-2 mb-md-0">
                          <div className="d-flex flex-column align-items-start">
                            <small className="label mb-1">Temperature</small>
                            <span>
                              <span style={{ 
                                color: 'var(--text-colour)', 
                                fontWeight: '600',
                                fontSize: windowWidth < 576 ? '1rem' : '1.1rem'
                              }}>
                                {formatTemperature(weeklyData.temperature.max[index])}
                              </span>
                              <small className="ms-1 label">
                                (feels {formatTemperature(weeklyData.temperature.min[index])})
                              </small>
                            </span>
                          </div>
                        </Col>
                        
                        {/* Sun data - collapsed on mobile */}
                        <Col xs={6} md={3} className="mb-2 mb-md-0">
                          {windowWidth >= 576 ? (
                            <div className="d-flex flex-column">
                              <div className="d-flex justify-content-between">
                                <div>
                                  <small className="d-block label mb-1">Sunrise</small>
                                  <span style={{ color: 'var(--text-colour)' }}>
                                    {weeklyData.sun.sunrise[index]}
                                  </span>
                                </div>
                                <div>
                                  <small className="d-block label mb-1">Sunset</small>
                                  <span style={{ color: 'var(--text-colour)' }}>
                                    {weeklyData.sun.sunset[index]}
                                  </span>
                                </div>
                                <div>
                                  <small className="d-block label mb-1">Hours</small>
                                  <span style={{ color: 'var(--text-colour)' }}>
                                    {weeklyData.sun.daylightDuration[index].replace('hours', 'h')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="d-flex flex-column align-items-end">
                              <small className="label mb-1">Sunrise/Sunset</small>
                              <strong style={{ color: 'var(--text-colour)', fontSize: '0.85rem' }}>
                                {weeklyData.sun.sunrise[index]} / {weeklyData.sun.sunset[index]}
                              </strong>
                            </div>
                          )}
                        </Col>

                        {/* Details */}
                        <Col xs={12} md={3}>
                          <div className="d-flex flex-wrap justify-content-between mt-2 mt-md-0">
                            <div className="me-2 mb-2">
                              <small className="d-block label mb-1">Wind</small>
                              <strong style={{ color: 'var(--text-colour)' }}>
                                {weeklyData.wind.maxSpeed[index]} {weeklyData.wind.units}
                              </strong>
                            </div>

                            <div className="me-2 mb-2">
                              <small className="d-block label mb-1">Precip</small>
                              <strong style={{ color: 'var(--text-colour)' }}>
                                {hasPrecipitation(index) ? (
                                  <>
                                    {weeklyData.precipitation.total[index]} {weeklyData.precipitation.units.rain}
                                    {weeklyData.precipitation.snow && weeklyData.precipitation.snow[index] > 0 && (
                                      <small className="d-block mt-1">
                                        Snow: {weeklyData.precipitation.snow[index]} {weeklyData.precipitation.units.snow}
                                      </small>
                                    )}
                                  </>
                                ) : 'None'}
                              </strong>
                            </div>

                            <div className="mb-2">
                              <small className="d-block label mb-1">UV Index</small>
                              <Badge bg={getUvIndexColor(weeklyData.uv.max[index])} style={{ fontSize: '0.8rem', padding: '0.35em 0.65em' }}>
                                {weeklyData.uv.max[index].toFixed(1)}
                              </Badge>
                            </div>
                          </div>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>
                );
              })}
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
}

export default WeeklyForecast;