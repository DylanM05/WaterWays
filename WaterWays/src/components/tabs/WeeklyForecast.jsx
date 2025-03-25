import React from 'react';
import { Card, Row, Col, Badge } from 'react-bootstrap';
import moment from 'moment';

// Weather code mapping for descriptions
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

function WeeklyForecast({ weeklyData }) {
  // Helper function to determine background color based on temperature
  const getTempColor = (temp) => {
    if (temp < 0) return '#e0f3ff'; // Cold
    if (temp < 10) return '#e6f2ff'; // Cool
    if (temp < 20) return '#fff4e0'; // Mild
    if (temp < 30) return '#fff0d1'; // Warm
    return '#ffdbdb'; // Hot
  };

  // Helper function to determine text color based on UV index
  const getUvIndexColor = (uvIndex) => {
    if (uvIndex < 3) return 'success';     // Low (green)
    if (uvIndex < 6) return 'warning';     // Moderate (yellow)
    if (uvIndex < 8) return 'danger';      // High (orange-red)
    return 'danger';                       // Very high/Extreme (purple)
  };
  
  // Helper to check if there's precipitation on this day
  const hasPrecipitation = (index) => {
    if (!weeklyData?.precipitation) return false;
    
    return (
      (weeklyData.precipitation.total && weeklyData.precipitation.total[index] > 0) ||
      (weeklyData.precipitation.rain && weeklyData.precipitation.rain[index] > 0) ||
      (weeklyData.precipitation.showers && weeklyData.precipitation.showers[index] > 0) ||
      (weeklyData.precipitation.snow && weeklyData.precipitation.snow[index] > 0)
    );
  };

  // If data isn't loaded yet, show loading message
  if (!weeklyData || !weeklyData.dates) {
    return (
      <Card style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
        <Card.Body className="text-center">
          <p style={{ color: 'var(--text-colour)' }}>Loading weekly forecast data...</p>
        </Card.Body>
      </Card>
    );
  }

  const today = moment().startOf('day');
  
  return (
    <Card style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
      <Card.Body>
        <h5 className="mb-4 text-center" style={{ color: 'var(--text-colour)' }}>7-Day Weather Forecast</h5>
        
        {weeklyData.dates.map((date, index) => {
          // Determine if this is today
          const forecastDate = moment(weeklyData.rawDates[index]);
          const isToday = forecastDate.isSame(today, 'day');
          
          return (
            <Card 
              key={index} 
              className="mb-3" 
              style={{ 
                backgroundColor: getTempColor(weeklyData.temperature.max[index]),
                transition: "all 0.2s ease",
                border: isToday ? '2px solid var(--primary-colour)' : '1px solid var(--border-colour)'
              }}
            >
              <Card.Body>
                <Row>
                  {/* Date & Day */}
                  <Col xs={12} md={2} className="d-flex flex-column justify-content-center align-items-center mb-3 mb-md-0">
                    <h6 className="mb-1 label">
                      {isToday ? 'Today' : moment(weeklyData.rawDates[index]).format('dddd')}
                    </h6>
                    <h5 className="mb-0" style={{ color: 'var(--text-colour)' }}>{date.split(' ').slice(0, 2).join(' ')}</h5>
                  </Col>
                  
                  {/* Weather condition */}
                  <Col xs={12} md={2} className="d-flex flex-column justify-content-center align-items-center mb-3 mb-md-0">
                    <div className="text-center">
                      <strong><p className="mb-0" style={{ color: 'var(--text-colour)' }}>{weatherCodeMapping[weeklyData.weather.codes[index]] || 'Unknown'}</p></strong>
                    </div>
                  </Col>
                  
                  {/* Temperature */}
                  <Col xs={12} md={2} className="d-flex flex-column justify-content-center align-items-center mb-3 mb-md-0">
                    <div className="text-center">
                      <h4 className="mb-1" style={{ color: 'var(--text-colour)' }}>
                        {weeklyData.temperature.max[index]}{weeklyData.temperature.units}
                      </h4>
                      <p className="mb-0 label">
                       Feels like {weeklyData.temperature.min[index]}{weeklyData.temperature.units}
                      </p>
                    </div>
                  </Col>
                  
                  {/* Sun data */}
                  <Col xs={12} md={3} className="mb-3 mb-md-0">
                    <div className="text-start text-md-center">
                      <div className="mb-2">
                        <small className='label'><strong>Sunrise:</strong></small>
                        <div style={{ color: 'var(--text-colour)' }}>{weeklyData.sun.sunrise[index]}</div>
                      </div>
                      <div className="mb-2">
                        <small className='label'><strong>Sunset</strong></small>
                        <div style={{ color: 'var(--text-colour)' }}>{weeklyData.sun.sunset[index]}</div>
                      </div>
                      <div className="mb-2">
                        <small className='label'><strong>Daylight</strong></small>
                        <div style={{ color: 'var(--text-colour)' }}>{weeklyData.sun.daylightDuration[index]}</div>
                      </div>
                    </div>
                  </Col>

                  {/* Details */}
                  <Col xs={12} md={3}>
                    <div className="text-start text-md-center">
                      <div className="mb-2">
                        <span className='label'><strong>Wind</strong></span>
                        <div style={{ color: 'var(--text-colour)' }}>{weeklyData.wind.maxSpeed[index]} {weeklyData.wind.units}</div>
                      </div>

                      <div className="mb-2">
                        <span className='label'><strong>Precipitation</strong></span>
                        <div style={{ color: 'var(--text-colour)' }}>
                          {hasPrecipitation(index) ? (
                            <>
                              {weeklyData.precipitation.total[index]} {weeklyData.precipitation.units.rain}
                              {weeklyData.precipitation.snow[index] > 0 && ` (Snow: ${weeklyData.precipitation.snow[index]} ${weeklyData.precipitation.units.snow})`}
                            </>
                          ) : 'None'}
                        </div>
                      </div>

                      <div className="mb-2">
                        <span className='label'><strong>UV Index</strong></span>
                        <div>
                          <Badge bg={getUvIndexColor(weeklyData.uv.max[index])}>
                            {weeklyData.uv.max[index].toFixed(1)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          );
        })}
      </Card.Body>
    </Card>
  );
}

export default WeeklyForecast;