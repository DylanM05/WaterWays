import React from 'react';
import { Card, Alert } from 'react-bootstrap';
import moment from 'moment';
import '../../styling/HourlyForecast.css';

const HourlyForecast = ({ forecastData, pressureData }) => {
  const now = moment();

  const futureForecasts = forecastData?.localTime?.map((timeString, index) => {
    const forecastTime = moment(timeString, 'MMMM Do YYYY, h:mm:ss a');
    if (forecastTime.isBefore(now)) return null;

    const datePart = timeString.split(',')[0];
    const timePart = timeString.split(',')[1].trim();
    const formattedTime = timePart.replace(':00:00', '');

    return (
      <Card key={index} className="forecast-card" style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
        <Card.Header className="forecast-card-header" style={{ backgroundColor: 'var(--primary-colour)', color: 'var(--primary-text-colour)' }}>
          <small>{datePart}</small>
        </Card.Header>
        <Card.Body className="forecast-card-body">
          <div className="forecast-time">
            <h6 style={{ color: 'var(--text-colour)' }}>{formattedTime}</h6>
          </div>

          <div className="temperature-section">
            <span className="temperature" style={{ color: 'var(--text-colour)' }}>{forecastData.temperature[index]}°C</span>
            {forecastData.apparentTemperature && (
              <div className="feels-like" style={{ color: 'var(--text-colour)' }}>
                Feels like {forecastData.apparentTemperature[index]}°C
              </div>
            )}
          </div>

          <div className="metrics-section">
            <div className="metric">
              <i className="bi bi-droplet-fill" style={{ color: 'var(--primary-colour)' }}></i>
              <strong><span style={{ color: 'var(--text-colour)' }}>Percipitation</span></strong>
              <span style={{ color: 'var(--text-colour)' }}>{forecastData.precipitationProbability[index]}%</span>
            </div>

            {forecastData.relativeHumidity && (
              <div className="metric">
                <i className="bi bi-moisture" style={{ color: 'var(--primary-colour)' }}></i>
                <strong><span style={{ color: 'var(--text-colour)' }}>Humidity</span></strong>
                <span style={{ color: 'var(--text-colour)' }}>{forecastData.relativeHumidity[index]}%</span>
              </div>
            )}

            {pressureData?.pressureMsl && (
              <div className="metric">
                <i className="bi bi-speedometer2" style={{ color: 'var(--primary-colour)' }}></i>
                <strong><span style={{ color: 'var(--text-colour)' }}>Pressure</span></strong>
                <span style={{ color: 'var(--text-colour)' }}>{pressureData.pressureMsl[index]} hPa</span>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>
    );
  }).filter(Boolean);

  return (
    <Card className="hourly-forecast" style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
      <Card.Body>
        <h5 style={{ color: 'var(--text-colour)' }}>Hourly Forecast</h5>
        <p className="text-muted">All times shown in your local timezone</p>

        <div className="forecast-container">
          {futureForecasts.length > 0 ? futureForecasts : (
            <Alert variant="info">
              No future forecast data available at this time.
            </Alert>
          )}
        </div>
      </Card.Body>
    </Card>
  );
};

export default HourlyForecast;