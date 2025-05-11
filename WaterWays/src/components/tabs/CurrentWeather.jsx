import React, { useContext } from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import { ThemeContext } from '../utility/contexts/Theme';
import { useSettings } from '../utility/contexts/SettingsContext';

const CurrentWeather = ({ weatherData, localWeatherTime }) => {
  const { darkMode } = useContext(ThemeContext);
  const { formatTemperature } = useSettings();
  
  // Add the isValidNumber function
  const isValidNumber = (value) => value !== undefined && value !== null && !isNaN(value);
  
  return (
    <Card className="mb-4" style={{ 
      backgroundColor: 'var(--card-bg-colour)', 
      borderColor: 'var(--border-colour)',
      width: '100%',
      borderRadius: window.innerWidth < 768 ? '0' : '0.25rem',
      border: '1px solid var(--border-colour)',
      borderLeft: window.innerWidth < 768 ? 'none' : '',
      borderRight: window.innerWidth < 768 ? 'none' : ''
    }}>
      <Card.Body className={window.innerWidth < 768 ? "p-2 pb-3" : "p-3"}>
        <Row className="g-3">
          {/* Left Column - Temperature & Weather Display */}
          <Col xs={12} md={6} className="mb-3 mb-md-0">
            <div
              className="text-center p-3 rounded d-flex flex-column justify-content-center"
              style={{
                backgroundColor: weatherData?.isDay 
                  ? darkMode ? '#1e293b' : '#f0f6ff' 
                  : darkMode ? '#0f172a' : '#e2e8f0',
                height: '100%',
                minHeight: '160px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                borderRadius: '8px'
              }}
            >
              <h2 className="my-0" style={{ 
                color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)',
                fontSize: window.innerWidth < 576 ? '3.5rem' : '4rem',  // Increased font size here
                fontWeight: '600'
              }}>
                {isValidNumber(weatherData?.temperature) ? formatTemperature(weatherData.temperature) : 'N/A'}
              </h2>

              {weatherData?.apparentTemperature !== undefined && (
                <p className="mb-2" style={{ 
                  color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)',
                  opacity: 0.85,
                  fontSize: window.innerWidth < 576 ? '1rem' : '1.2rem'  // Slightly increased from before
                }}>
                  Feels like {isValidNumber(weatherData.apparentTemperature) ? formatTemperature(weatherData.apparentTemperature) : 'N/A'}
                </p>
              )}

              <h5 className="mt-2" style={{ 
                color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)',
                fontWeight: '500',
                fontSize: window.innerWidth < 576 ? '1.2rem' : '1.4rem'
              }}>
                {weatherData?.weather || 'N/A'}
              </h5>

              <div className="mt-2" style={{ 
                color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)',
                opacity: 0.9
              }}>
                {weatherData?.precipitation && (
                  <p className="mb-1" style={{
                    fontSize: window.innerWidth < 576 ? '0.9rem' : '1rem'
                  }}>
                    {weatherData.precipitation.total} mm{' '}
                    {weatherData.precipitation.type === 'rain' ? 'rain' : weatherData.precipitation.type === 'snow' ? 'snow' : ''}
                  </p>
                )}
              </div>
            </div>
          </Col>

          {/* Right Column - Weather Info */}
          <Col xs={12} md={6}>
            <h5 className="mb-3" style={{ 
              color: 'var(--text-colour)',
              fontSize: window.innerWidth < 576 ? '1.15rem' : '1.25rem',
              borderBottom: '1px solid var(--border-colour)',
              paddingBottom: '0.5rem'
            }}>
              Current Weather Conditions
            </h5>
            
            <div className="weather-details">
              <Row className="g-2 mb-2 align-items-center">
                <Col xs={4} sm={3} className="text-nowrap">
                  <strong style={{ color: 'var(--text-colour)' }}>Humidity:</strong>
                </Col>
                <Col>
                  <span style={{ color: 'var(--text-colour)' }}>
                    {weatherData?.humidity !== undefined ? `${weatherData.humidity}%` : 'N/A'}
                  </span>
                </Col>
              </Row>

              {weatherData?.precipitation && (
                <Row className="g-2 mb-2 align-items-center">
                  <Col xs={4} sm={3} className="text-nowrap">
                    <strong style={{ color: 'var(--text-colour)' }}>Precipitation:</strong>
                  </Col>
                  <Col>
                    <span style={{ color: 'var(--text-colour)' }}>
                      {weatherData.precipitation.total} mm{' '}
                      {weatherData.precipitation.type === 'rain' ? ' (Rain)' : weatherData.precipitation.type === 'snow' ? ' (Snow)' : ''}
                    </span>
                  </Col>
                </Row>
              )}

              <Row className="g-2 mb-2 align-items-center">
                <Col xs={4} sm={3} className="text-nowrap">
                  <strong style={{ color: 'var(--text-colour)' }}>Pressure:</strong>
                </Col>
                <Col>
                  <span style={{ color: 'var(--text-colour)' }}>
                    {weatherData?.pressure ? (
                      <>
                        MSL: {weatherData.pressure.msl} hPa
                        <span className={window.innerWidth < 576 ? "d-block mt-1" : "ms-2"}>
                          Surface: {weatherData.pressure.surface} hPa
                        </span>
                      </>
                    ) : 'N/A'}
                  </span>
                </Col>
              </Row>

              <Row className="g-2 mb-2 align-items-center">
                <Col xs={4} sm={3} className="text-nowrap">
                  <strong style={{ color: 'var(--text-colour)' }}>Wind:</strong>
                </Col>
                <Col>
                  <div style={{ color: 'var(--text-colour)' }}>
                    {weatherData?.wind ? (
                      <>
                        {weatherData.wind} km/h {weatherData.windDirection || ''}
                        {weatherData.windGusts && (
                          <span className={window.innerWidth < 576 ? "d-block mt-1" : "ms-2"}>
                            (Gusts: {weatherData.windGusts} km/h)
                          </span>
                        )}
                      </>
                    ) : 'N/A'}
                  </div>
                </Col>
              </Row>

              {weatherData?.cloudCover !== undefined && (
                <Row className="g-2 mb-2 align-items-center">
                  <Col xs={4} sm={3} className="text-nowrap">
                    <strong style={{ color: 'var(--text-colour)' }}>Cloud Cover:</strong>
                  </Col>
                  <Col>
                    <span style={{ color: 'var(--text-colour)' }}>{weatherData.cloudCover}%</span>
                  </Col>
                </Row>
              )}

              <Row className="g-2 mb-2 align-items-center">
                <Col xs={4} sm={3} className="text-nowrap">
                  <strong style={{ color: 'var(--text-colour)' }}>Updated:</strong>
                </Col>
                <Col>
                  <span style={{ color: 'var(--text-colour)' }}>{localWeatherTime || 'N/A'}</span>
                </Col>
              </Row>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default CurrentWeather;