import React from 'react';
import { Card, Alert, Container } from 'react-bootstrap';
import { BsDropletFill, BsMoisture, BsSpeedometer2 } from 'react-icons/bs';
import { parseLongDateTime } from '../utility/dates';
import './styling/HourlyForecast.css';
import { useSettings } from '../utility/contexts/SettingsContext';

const HOUR_MS = 60 * 60 * 1000;

const HourlyForecast = ({ forecastData, pressureData, error }) => {
  const now = Date.now();
  const { formatTemperature } = useSettings(); // Add this hook

  // Pressure times are UTC while forecast times are station-local, so pair them by the actual hour
  // (rounded, for half-hour time zones such as Newfoundland's) rather than by position.
  const pressureByHour = new Map((pressureData?.time ?? []).map((timeString, index) => [
    Math.round((parseLongDateTime(timeString, { utc: true })?.getTime() ?? NaN) / HOUR_MS),
    pressureData.pressureMsl?.[index]
  ]));

  // `time` is the station's local time for display; rawTime minus the UTC offset gives the real time.
  const futureForecasts = forecastData?.time?.map((timeString, index) => {
    const startsAt = Date.parse(`${forecastData.rawTime?.[index]}Z`) - (forecastData.utcOffsetSeconds ?? 0) * 1000;
    if (startsAt < now) return null;
    const pressure = pressureByHour.get(Math.round(startsAt / HOUR_MS));

    const datePart = timeString.split(',')[0];
    const timePart = timeString.split(',')[1].trim();
    const formattedTime = timePart.replace(':00:00', '');

    return (
      <Card 
        key={index} 
        className="forecast-card" 
        style={{ 
          backgroundColor: 'var(--card-bg-colour)', 
          borderColor: 'var(--border-colour)',
          width: window.innerWidth < 576 ? '100%' : (window.innerWidth < 400 ? '150px' : '180px'),
          margin: window.innerWidth < 576 ? '0 0 12px 0' : '0 8px 12px 0',
          borderRadius: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          flexShrink: 0
        }}
      >
        <Card.Header 
          className="forecast-card-header" 
          style={{ 
            backgroundColor: 'var(--primary-colour)', 
            color: 'var(--primary-text-colour)',
            padding: '6px 10px',
            fontSize: window.innerWidth < 400 ? '0.7rem' : '0.8rem',
            fontWeight: '500',
            borderTopLeftRadius: '5px',
            borderTopRightRadius: '5px'
          }}
        >
          <small>{datePart}</small>
        </Card.Header>
        <Card.Body 
          className="forecast-card-body"
          style={{
            padding: window.innerWidth < 400 ? '0.75rem' : '1rem'
          }}
        >
          <div 
            className="forecast-time"
            style={{
              marginBottom: '6px',
              borderBottom: '1px solid var(--border-colour)',
              paddingBottom: '6px'
            }}
          >
            <h6 style={{ 
              color: 'var(--text-colour)',
              fontSize: window.innerWidth < 400 ? '0.9rem' : '1rem',
              margin: 0
            }}>
              {formattedTime}
            </h6>
          </div>

          <div 
            className="temperature-section"
            style={{
              marginBottom: '10px',
              textAlign: 'center'
            }}
          >
            <span 
              className="temperature" 
              style={{ 
                color: 'var(--text-colour)',
                fontSize: window.innerWidth < 400 ? '1.2rem' : '1.4rem',
                fontWeight: '600',
                display: 'block'
              }}
            >
              {formatTemperature(forecastData.temperature[index])}
            </span>
            {forecastData.apparentTemperature && (
              <div 
                className="feels-like" 
                style={{ 
                  color: 'var(--text-colour)',
                  fontSize: window.innerWidth < 400 ? '0.75rem' : '0.8rem',
                  opacity: 0.85
                }}
              >
                Feels like {formatTemperature(forecastData.apparentTemperature[index])}
              </div>
            )}
          </div>

          <div 
            className="metrics-section"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
          >
            <div 
              className="metric"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: window.innerWidth < 400 ? '0.75rem' : '0.8rem'
              }}
            >
              <BsDropletFill
                aria-hidden="true"
                style={{ 
                  color: 'var(--primary-colour)',
                  fontSize: window.innerWidth < 400 ? '0.8rem' : '0.9rem'
                }}
              />
              <strong>
                <span style={{ color: 'var(--text-colour)' }}>Precipitation:</span>
              </strong>
              <span style={{ color: 'var(--text-colour)', marginLeft: 'auto' }}>
                {forecastData.precipitationProbability[index]}%
              </span>
            </div>

            {forecastData.relativeHumidity && (
              <div 
                className="metric"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: window.innerWidth < 400 ? '0.75rem' : '0.8rem'
                }}
              >
                <BsMoisture
                  aria-hidden="true"
                  style={{ 
                    color: 'var(--primary-colour)',
                    fontSize: window.innerWidth < 400 ? '0.8rem' : '0.9rem'
                  }}
                />
                <strong>
                  <span style={{ color: 'var(--text-colour)' }}>Humidity:</span>
                </strong>
                <span style={{ color: 'var(--text-colour)', marginLeft: 'auto' }}>
                  {forecastData.relativeHumidity[index]}%
                </span>
              </div>
            )}

            {pressure != null && (
              <div 
                className="metric"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: window.innerWidth < 400 ? '0.75rem' : '0.8rem'
                }}
              >
                <BsSpeedometer2
                  aria-hidden="true"
                  style={{ 
                    color: 'var(--primary-colour)',
                    fontSize: window.innerWidth < 400 ? '0.8rem' : '0.9rem'
                  }}
                />
                <strong>
                  <span style={{ color: 'var(--text-colour)' }}>Pressure:</span>
                </strong>
                <span style={{ color: 'var(--text-colour)', marginLeft: 'auto' }}>
                  {pressure} hPa
                </span>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>
    );
  }).filter(Boolean);

  return (
    <Container fluid className="px-0">
      {error && (
        <Alert variant="danger" className="mb-2">
          {error}
        </Alert>
      )}
      
      <Card 
        className="hourly-forecast mb-4" 
        style={{ 
          backgroundColor: 'var(--card-bg-colour)', 
          borderColor: 'var(--border-colour)',
          width: '100%',
          borderRadius: window.innerWidth < 768 ? '0' : '0.25rem',
          border: '1px solid var(--border-colour)',
          borderLeft: window.innerWidth < 768 ? 'none' : '',
          borderRight: window.innerWidth < 768 ? 'none' : ''
        }}
      >
        <Card.Body className={window.innerWidth < 768 ? "p-2 pb-3" : "p-3"}>
          <h5 
            style={{ 
              color: 'var(--text-colour)',
              fontSize: window.innerWidth < 576 ? '1.15rem' : '1.25rem',
              marginBottom: '0.5rem'
            }}
          >
            Hourly Forecast
          </h5>
          <p 
            className="text-muted" 
            style={{ 
              fontSize: window.innerWidth < 576 ? '0.8rem' : '0.875rem',
              marginBottom: '1rem'
            }}
          >
            All times shown in your local timezone
          </p>

          <div 
            className="forecast-container"
            style={{
              padding: '0.25rem 0.25rem 0.5rem',
              marginLeft: '-0.25rem',
              marginRight: '-0.25rem'
            }}
          >
            {futureForecasts.length > 0 ? futureForecasts : (
              <Alert 
                variant="info"
                style={{
                  width: '100%',
                  margin: '0.5rem 0'
                }}
              >
                No future forecast data available at this time.
              </Alert>
            )}
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default HourlyForecast;