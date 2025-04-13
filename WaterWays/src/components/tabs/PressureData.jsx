import React, { useState, useMemo, useContext, useEffect } from 'react';
import { Card, Row, Col, Container, Alert } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import moment from 'moment';
import '../../styling/PressureData.css';
import { ThemeContext } from '../contexts/Theme';

const ToggleButton = ({ label, isActive, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '6px 12px',
      backgroundColor: isActive 
        ? 'var(--primary-colour)' 
        : 'var(--button-bg)',
      color: isActive 
        ? 'var(--primary-text-colour)' 
        : 'var(--text-colour)',
      border: '1px solid var(--border-colour)',
      borderRadius: '0',
      cursor: 'pointer',
      fontSize: '0.875rem',
      transition: 'all 0.2s'
    }}
    onMouseOver={(e) => {
      if (!isActive) {
        e.currentTarget.style.backgroundColor = 'var(--hover-colour)';
        e.currentTarget.style.color = 'var(--primary-text-colour)';
      }
    }}
    onMouseOut={(e) => {
      if (!isActive) {
        e.currentTarget.style.backgroundColor = 'var(--button-bg)';
        e.currentTarget.style.color = 'var(--text-colour)';
      }
    }}
  >
    {label}
  </button>
);

const PressureData = ({ pressureData, error }) => {
  const { darkMode } = useContext(ThemeContext); 
  const [pressureChartTab, setPressureChartTab] = useState('msl');
  
  useEffect(() => {
    setPressureChartTab(prevTab => prevTab);
  }, [darkMode]);

  const formatTooltipTitle = (tooltipItems) => {
    return moment(tooltipItems[0].label, 'MM/DD HH:mm').format('MMMM Do YYYY, h:mm a');
  };

  const preparePressureChartData = (tabType) => {
    if (!pressureData?.pressureMsl || !pressureData?.surfacePressure) {
      return null;
    }
    
    const dataLength = Math.min(48, pressureData.pressureMsl.length);
    const chartData = {
      pressureMsl: [...pressureData.pressureMsl].slice(0, dataLength),
      surfacePressure: [...pressureData.surfacePressure].slice(0, dataLength),
      time: [...pressureData.localTime].slice(0, dataLength),
    };
    
    const labels = chartData.time.map(timeString => 
      moment(timeString, 'MMMM Do YYYY, h:mm:ss a').format('MM/DD HH:mm')
    );
    
    const primaryColor = '#646cff';
    const secondaryColor = '#f5456b';
    
    let datasets = [];
    if (tabType === 'msl' || tabType === 'both') {
      datasets.push({
        label: 'Mean Sea Level Pressure (hPa)',
        data: chartData.pressureMsl,
        borderColor: primaryColor,
        backgroundColor: 'rgba(100, 108, 255, 0.1)',
        pointBackgroundColor: primaryColor,
        pointBorderColor: primaryColor,
        fill: false,
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.1,
      });
    }
    if (tabType === 'surface' || tabType === 'both') {
      datasets.push({
        label: 'Surface Pressure (hPa)',
        data: chartData.surfacePressure,
        borderColor: secondaryColor,
        backgroundColor: 'rgba(245, 69, 107, 0.1)',
        pointBackgroundColor: secondaryColor,
        pointBorderColor: secondaryColor,
        fill: false,
        borderWidth: 2,
        pointRadius: 3,
        tension: 0.1,
      });
    }
    
    return { labels, datasets };
  };

  const chartData = useMemo(
    () => preparePressureChartData(pressureChartTab), 
    [pressureData, pressureChartTab, darkMode]
  );

  const pressureChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { 
        position: 'top',
        labels: {
          color: darkMode ? '#ffffff' : '#213547', 
          usePointStyle: true,
          pointStyle: 'rectRounded',
          boxWidth: 15,
          boxHeight: 15,
          padding: 15
        }
      },
      title: { 
        display: true,
        text: 'Barometric Pressure',
        color: darkMode ? '#ffffff' : '#213547' 
      },
      tooltip: {
        callbacks: { title: formatTooltipTitle },
        backgroundColor: darkMode ? '#1a1a1a' : '#f9f9f9', 
        titleColor: darkMode ? '#ffffff' : '#213547', 
        bodyColor: darkMode ? '#ffffff' : '#213547', 
        borderColor: darkMode ? '#333' : '#e0e0e0', 
        borderWidth: 1
      },
    },
    scales: {
      x: {
        ticks: {
          color: darkMode ? '#ffffff' : '#213547' 
        },
        grid: {
          color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        }
      },
      y: {
        beginAtZero: false,
        title: { 
          display: true, 
          text: 'Pressure (hPa)',
          color: darkMode ? '#ffffff' : '#213547' 
        },
        ticks: {
          color: darkMode ? '#ffffff' : '#213547' 
        },
        grid: {
          color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        }
      },
    },
  };

  return (
    <Container fluid>
      {error && (
        <Alert variant="danger">{error}</Alert>
      )}
      <Card className="mb-4" style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
        <Card.Body>
          <h5 style={{ color: 'var(--text-colour)' }}>Barometric Pressure Visualization</h5>
          
          <div className="d-flex mb-3" style={{ overflow: 'hidden', border: '1px solid var(--border-colour)', borderRadius: '4px', width: 'fit-content' }}>
            <ToggleButton 
              label="MSL Pressure" 
              isActive={pressureChartTab === 'msl'}
              onClick={() => setPressureChartTab('msl')} 
            />
            <ToggleButton 
              label="Surface Pressure" 
              isActive={pressureChartTab === 'surface'}
              onClick={() => setPressureChartTab('surface')} 
            />
            <ToggleButton 
              label="Both" 
              isActive={pressureChartTab === 'both'}
              onClick={() => setPressureChartTab('both')} 
            />
          </div>
          
          <div className="chart-container" style={{ 
            height: '300px', 
            backgroundColor: darkMode ? '#0c0c0c' : '#f3f0f0', 
            borderRadius: '4px',
            padding: '10px' 
          }}>
            {chartData ? (
              <Line data={chartData} options={pressureChartOptions} />
            ) : (
              <div className="d-flex align-items-center justify-content-center h-100">
                <p style={{ color: darkMode ? '#ffffff' : '#213547', opacity: 0.7 }}>
                  No pressure data available for chart
                </p>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      <Card style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
        <Card.Body>
          <Row>
            <Col xs={12} md={6} className="mb-3 mb-md-0">
              <h5 className="text-center" style={{ color: 'var(--text-colour)' }}>About Barometric Pressure</h5>
              <p className="text-left" style={{ color: 'var(--text-colour)' }}>
                Barometric pressure (atmospheric pressure) is the force exerted by the atmosphere at a given point. 
                It's measured in hectopascals (hPa).
              </p>
              <ul className="no-bullets mt-3 text-left" style={{ color: 'var(--text-colour)', paddingLeft: 0 }}>
                <li><strong>Mean Sea Level Pressure (MSL)</strong> - Pressure adjusted to sea level for comparison purposes</li>
                <li><strong>Surface Pressure</strong> - Actual pressure measured at the station's elevation</li>
              </ul>
              <p className="mt-3 text-center" style={{ color: 'var(--text-colour)' }}>
                <strong>Typical range:</strong> 980-1040 hPa<br />
                <strong>Standard pressure:</strong> 1013.25 hPa
              </p>
            </Col>

            <Col xs={12} md={6}>
              <h5 style={{ color: 'var(--text-colour)' }}>Pressure Statistics</h5>
              {pressureData?.pressureMsl ? (
                <>
                  <div className="d-flex justify-content-between mb-2" style={{ color: 'var(--text-colour)' }}>
                    <span>Current MSL Pressure:</span>
                    <strong>{pressureData.pressureMsl[0]} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-2" style={{ color: 'var(--text-colour)' }}>
                    <span>Current Surface Pressure:</span>
                    <strong>{pressureData.surfacePressure[0]} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-2" style={{ color: 'var(--text-colour)' }}>
                    <span>Difference:</span>
                    <strong>{(pressureData.pressureMsl[0] - pressureData.surfacePressure[0]).toFixed(1)} hPa</strong>
                  </div>
                  <hr style={{ borderColor: 'var(--border-colour)' }} />
                  <div className="d-flex justify-content-between mb-2" style={{ color: 'var(--text-colour)' }}>
                    <span>24hr Max MSL:</span>
                    <strong>{Math.max(...pressureData.pressureMsl.slice(0, 24)).toFixed(1)} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-2" style={{ color: 'var(--text-colour)' }}>
                    <span>24hr Min MSL:</span>
                    <strong>{Math.min(...pressureData.pressureMsl.slice(0, 24)).toFixed(1)} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between" style={{ color: 'var(--text-colour)' }}>
                    <span>24hr Range:</span>
                    <strong>
                      {(Math.max(...pressureData.pressureMsl.slice(0, 24)) - 
                       Math.min(...pressureData.pressureMsl.slice(0, 24))).toFixed(1)} hPa
                    </strong>
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--text-colour)', opacity: 0.7 }}>No pressure data available</p>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default PressureData;