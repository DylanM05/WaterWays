import React, { useState, useContext, useMemo, useRef, useEffect } from 'react';
import { Card, Row, Col, Container, Alert } from 'react-bootstrap';
import moment from 'moment';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import './styling/PressureData.css';
import { ThemeContext } from '../utility/contexts/Theme';
import Spinner from '../spinners/Spinner';

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

const PressureData = ({ pressureData, error, loading }) => {
  const { darkMode } = useContext(ThemeContext);
  const [pressureChartTab, setPressureChartTab] = useState('msl');
  const chartRef = useRef(null);
  const uplotInstance = useRef(null);
  
  // Prepare data for the uPlot chart
  const plotData = useMemo(() => {
    if (!pressureData?.pressureMsl || !pressureData?.surfacePressure || !pressureData?.localTime) {
      return null;
    }
    
    const dataLength = Math.min(48, pressureData.pressureMsl.length);
    
    // Convert dates to timestamps
    const times = pressureData.localTime.slice(0, dataLength).map(timeString => 
      moment(timeString, 'MMMM Do YYYY, h:mm:ss a').valueOf() / 1000
    );
    
    const mslValues = pressureData.pressureMsl.slice(0, dataLength);
    const surfaceValues = pressureData.surfacePressure.slice(0, dataLength);
    
    // Return appropriate data based on selected tab
    if (pressureChartTab === 'msl') {
      return [times, mslValues];
    } else { // surface
      return [times, surfaceValues];
    }
  }, [pressureData, pressureChartTab]);

  // Create and update the chart when data or theme changes
  useEffect(() => {
    if (!chartRef.current || !plotData || !plotData[0].length) return;

    // Clean up existing chart instance
    if (uplotInstance.current) {
      uplotInstance.current.destroy();
      uplotInstance.current = null;
    }

    const isDark = darkMode;
    const COLORS = {
      background: isDark ? '#1a1a1a' : '#f9f9f9',
      text: isDark ? '#ffffff' : '#213547',
      grid: isDark ? '#333' : '#e0e0e0',
      primary: '#646cff',
      secondary: '#f25366',
      mslFill: 'rgba(100, 108, 255, 0.2)',
      surfaceFill: 'rgba(235, 94, 110, 0.15)'
    };

    // Set up series array based on selected tab
    let series = [
      {
        label: "Time",
        scale: "x"
      }
    ];

    if (pressureChartTab === 'msl') {
      series.push({
        label: 'MSL Pressure',
        stroke: COLORS.primary,
        width: 2,
        fill: COLORS.mslFill,
        points: { show: false },
      });
    } else { // surface
      series.push({
        label: 'Surface Pressure',
        stroke: COLORS.secondary,
        width: 2,
        fill: COLORS.surfaceFill,
        points: { show: false },
      });
    }

    const opts = {
      width: chartRef.current.offsetWidth,
      height: 300,
      title: 'Barometric Pressure Over Time',
      scales: {
        x: { time: true, show: true },
        y: { auto: true },
      },
      axes: [
        {
          stroke: COLORS.text,
          grid: { show: true, stroke: COLORS.grid },
          label: 'Date/Time',
          size: 60,
          values: (self, ticks) => {
            const format = "MM/DD HH:mm";
            const tickSpacing = Math.ceil(ticks.length / (chartRef.current.offsetWidth / 100));
            
            return ticks.map((tick, i) => {
              if (i % tickSpacing !== 0) return "";
              return moment(tick * 1000).format(format);
            });
          }
        },
        {
          label: 'Pressure (hPa)',
          stroke: COLORS.text,
          grid: { stroke: COLORS.grid },
          labelGap: 8, // Add gap between label and axis
          size: 70, // Increase size to accommodate label
        }
      ],
      series: series,
      cursor: {
        y: false,
        drag: { x: true, y: false }
      },
      legend: {
        show: true,
        live: true,
      },
      hooks: {
        draw: [
          (u) => {
            const legend = u.root.querySelector(".u-legend");
            if (legend) {
              legend.style.color = COLORS.text;
            }
          }
        ],
      }
    };

    uplotInstance.current = new uPlot(opts, plotData, chartRef.current);

    const handleResize = () => {
      if (uplotInstance.current) {
        uplotInstance.current.setSize({
          width: chartRef.current.offsetWidth,
          height: 300,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (uplotInstance.current) uplotInstance.current.destroy();
    };
  }, [plotData, darkMode, pressureChartTab]);

  return (
    <Container fluid>
      {error && (
        <Alert variant="danger">{error}</Alert>
      )}
      <Card className="mb-4" style={{ backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
            <h5 style={{ color: 'var(--text-colour)' }}>Barometric Pressure Visualization</h5>
          
            <div className="d-flex" style={{ overflow: 'hidden', border: '1px solid var(--border-colour)', borderRadius: '4px', width: 'fit-content' }}>
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
            </div>
          </div>
          
          {loading ? (
            <div className="d-flex justify-content-center align-items-center" style={{ height: '300px' }}>
              <Spinner size="60px" color="var(--primary-colour)" message="Fetching pressure data..." />
            </div>
          ) : !plotData ? (
            <div className="d-flex align-items-center justify-content-center" style={{ height: '300px', backgroundColor: darkMode ? '#0c0c0c' : '#f3f0f0', borderRadius: '4px' }}>
              <p style={{ color: darkMode ? '#ffffff' : '#213547', opacity: 0.7 }}>
                No pressure data available for chart
              </p>
            </div>
          ) : (
            <div ref={chartRef} className="uplot-wrapper mb-3" style={{ width: '100%' }} />
          )}
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