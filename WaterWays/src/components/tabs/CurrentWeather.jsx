import React from 'react';
import { Card, Row, Col } from 'react-bootstrap';

const CurrentWeather = ({ weatherData, localWeatherTime }) => {
  return (
    <Card className="mb-4" style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
      <Card.Body>
        <Row>
          {/* Left Column - Temperature & Weather Display */}
          <Col xs={12} md={6}>
            <div
              className="text-center p-4 rounded d-flex flex-column justify-content-center"
              style={{
                backgroundColor: weatherData?.isDay ? 'var(--background-colour)' : 'var(--bg)',
                height: '100%',
              }}
            >
              <h3 style={{ color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)' }}>
                {weatherData?.temperature !== undefined ? `${weatherData.temperature}°C` : 'N/A'}
              </h3>

              {weatherData?.apparentTemperature !== undefined && (
                <p style={{ color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)' }}>
                  Feels like {weatherData.apparentTemperature}°C
                </p>
              )}

              <h5 style={{ color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)' }}>
                {weatherData?.weather || 'N/A'}
              </h5>

              <div className="mt-3" style={{ color: weatherData?.isDay ? 'var(--text-colour)' : 'var(--primary-text-colour)' }}>
                {weatherData?.precipitation && (
                  <p className="mb-1">
                    {weatherData.precipitation.total} mm{' '}
                    {weatherData.precipitation.type === 'rain' ? 'rain' : weatherData.precipitation.type === 'snow' ? 'snow' : ''}
                  </p>
                )}
              </div>
            </div>
          </Col>

          {/* Right Column - Weather Info */}
          <Col xs={12} md={6}>
            <h5 className="mb-3" style={{ color: 'var(--text-colour)' }}>Current Weather Conditions</h5>
            
            <div className="mb-2" style={{ color: 'var(--text-colour)' }}>
              <strong>Humidity:</strong> {weatherData?.humidity !== undefined ? `${weatherData.humidity}%` : 'N/A'}
            </div>

            {weatherData?.precipitation && (
              <div className="mb-2" style={{ color: 'var(--text-colour)' }}>
                <strong>Precipitation:</strong>{' '}
                {weatherData.precipitation.total} mm{' '}
                {weatherData.precipitation.type === 'rain' ? ' (Rain)' : weatherData.precipitation.type === 'snow' ? ' (Snow)' : ''}
              </div>
            )}

            <div className="mb-2" style={{ color: 'var(--text-colour)' }}>
              <strong>Pressure:</strong> 
              {weatherData?.pressure ? (
                <> MSL: {weatherData.pressure.msl} hPa, Surface: {weatherData.pressure.surface} hPa</>
              ) : 'N/A'}
            </div>

            <div className="mb-2" style={{ color: 'var(--text-colour)' }}>
              <strong>Wind:</strong>
              {weatherData?.wind ? (
                <> {weatherData.wind} km/h {weatherData.windDirection || ''}
                  {weatherData.windGusts && <span className="ms-2">(Gusts: {weatherData.windGusts} km/h)</span>}
                </>
              ) : 'N/A'}
            </div>

            {weatherData?.cloudCover !== undefined && (
              <div className="mb-2" style={{ color: 'var(--text-colour)' }}>
                <strong>Cloud Cover:</strong> {weatherData.cloudCover}%
              </div>
            )}

            <div className="mb-2" style={{ color: 'var(--text-colour)' }}>
              <strong>Updated:</strong> {localWeatherTime || 'N/A'}
            </div>
          </Col>

        </Row>
      </Card.Body>
    </Card>
  );
};

export default CurrentWeather;