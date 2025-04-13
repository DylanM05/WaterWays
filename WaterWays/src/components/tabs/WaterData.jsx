import React, { useEffect, useState, useRef, useContext } from 'react';
import { Card, Nav, Table, ButtonGroup, Button, Form, Container, Alert } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import moment from 'moment';
import '../../styling/waterData.css';
import { ThemeContext } from '../contexts/Theme';

Chart.register(...registerables, zoomPlugin);

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

const RecordButton = ({ number, isActive, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '2px 8px',
      backgroundColor: isActive 
        ? 'var(--primary-colour)' 
        : 'var(--button-bg)',
      color: isActive 
        ? 'var(--primary-text-colour)' 
        : 'var(--text-colour)',
      border: '1px solid var(--border-colour)',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '0.75rem',
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
    {number}
  </button>
);

const WaterData = ({ 
  waterData = [], 
  waterChartTab, 
  setWaterChartTab,
  recordsPerPage, 
  setRecordsPerPage, 
  currentPage, 
  setCurrentPage,
  error
}) => {
  const { darkMode } = useContext(ThemeContext);
  const [timeWindow, setTimeWindow] = useState(1);
  const chartRef = useRef(null);
  
  const sortedWaterData = [...waterData].sort((a, b) => 
    new Date(b.date_time) - new Date(a.date_time)
  );
  
  const hasWaterLevelData = waterData.some(entry => entry.water_level !== undefined && entry.water_level !== null);
  const hasDischargeData = waterData.some(entry => entry.discharge !== undefined && entry.discharge !== null);

  useEffect(() => {
    if (!hasWaterLevelData && hasDischargeData) {
      setWaterChartTab('discharge');
    } else if (!hasDischargeData && hasWaterLevelData) {
      setWaterChartTab('level');
    } else if (!hasWaterLevelData && !hasDischargeData) {
      setWaterChartTab(null);
    }
  }, [hasWaterLevelData, hasDischargeData, setWaterChartTab]);

  useEffect(() => {
    setWaterChartTab(prevTab => prevTab);
  }, [darkMode]);

  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.update();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

const prepareChartData = (dataType) => {
  if (!sortedWaterData || sortedWaterData.length === 0) return null;

  const validDataPoints = sortedWaterData.filter(entry => 
    entry && entry.date_time && 
    (dataType === 'level' ? 
      (entry.water_level !== undefined && entry.water_level !== null) : 
      (entry.discharge !== undefined && entry.discharge !== null))
  );
  
  if (validDataPoints.length === 0) return null;
  
  const mostRecentData = validDataPoints[0];
  const mostRecentDate = new Date(mostRecentData.date_time);
  const cutoffDate = new Date(mostRecentDate);
  cutoffDate.setDate(cutoffDate.getDate() - timeWindow);

  const filteredData = validDataPoints.filter(entry => {
    const entryDate = new Date(entry.date_time);
    return entryDate >= cutoffDate;
  });

  if (filteredData.length === 0) return null;

  const sortedFilteredData = [...filteredData].sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
  
  let decimatedData = sortedFilteredData;
  let decimationFactor = 1;
  
  if (sortedFilteredData.length > 500) {
    if (timeWindow >= 30) {
      decimationFactor = Math.ceil(sortedFilteredData.length / 150);
    } else if (timeWindow >= 14) {
      decimationFactor = Math.ceil(sortedFilteredData.length / 200);
    } else if (timeWindow >= 7) {
      decimationFactor = Math.ceil(sortedFilteredData.length / 300);
    } else {
      decimationFactor = Math.ceil(sortedFilteredData.length / 500);
    }
    
    decimatedData = sortedFilteredData.filter((_, index) => index % decimationFactor === 0);
    
    if (decimatedData[0] !== sortedFilteredData[0]) {
      decimatedData.unshift(sortedFilteredData[0]);
    }
    if (decimatedData[decimatedData.length - 1] !== sortedFilteredData[sortedFilteredData.length - 1]) {
      decimatedData.push(sortedFilteredData[sortedFilteredData.length - 1]);
    }
  }
  
  const labels = decimatedData.map(entry => moment(entry.date_time).format('MM/DD HH:mm'));

  const primaryColor = '#646cff';
  const secondaryColor = '#f5456b';
  
  return {
    labels,
    datasets: [{
      label: dataType === 'level' ? 'Water Level (m)' : 'Discharge (m³/s)',
      data: decimatedData.map(entry => dataType === 'level' ? entry.water_level : entry.discharge),
      borderColor: dataType === 'level' ? primaryColor : secondaryColor,
      backgroundColor: dataType === 'level' ? 'rgba(100, 108, 255, 0.1)' : 'rgba(245, 69, 107, 0.1)',
      pointBackgroundColor: dataType === 'level' ? primaryColor : secondaryColor,
      pointBorderColor: dataType === 'level' ? primaryColor : secondaryColor,
      fill: false,
      borderWidth: 2,
      pointRadius: timeWindow >= 14 ? 2 : 3,
      tension: 0.1,
    }],
  };
};

  const formatTooltipTitle = (tooltipItems) => {
    return moment(tooltipItems[0].label, 'MM/DD HH:mm').format('MMMM Do YYYY, h:mm a');
  };

  const resetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: timeWindow >= 14 ? 0 : 1000,
    },
    elements: {
      point: {
        radius: timeWindow >= 14 ? 2 : 3,
        hitRadius: 10,
        hoverRadius: 5,
      },
      line: {
        tension: 0.1, 
      }
    },
    plugins: {
      legend: { 
        position: window.innerWidth < 600 ? 'bottom' : 'top',
        labels: {
          color: darkMode ? '#ffffff' : '#213547',
          usePointStyle: true,
          pointStyle: 'rectRounded',
          boxWidth: 15,
          boxHeight: 15,
          padding: window.innerWidth < 600 ? 10 : 15,
          font: {
            size: window.innerWidth < 600 ? 10 : 12
          }
        }
      },
      decimation: {
        enabled: true,
        algorithm: 'min-max',
      },
      title: {
        display: true,
        text: waterChartTab === 'level' ? 'Water Level Trend' : 'Discharge Trend',
        color: darkMode ? '#ffffff' : '#213547',
        font: {
          size: window.innerWidth < 600 ? 14 : 16
        }
      },
      tooltip: {
        callbacks: { 
          title: formatTooltipTitle,
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += window.innerWidth < 600 ? 
                context.parsed.y.toFixed(2) : 
                context.parsed.y.toFixed(2) + (waterChartTab === 'level' ? ' m' : ' m³/s');
            }
            return label;
          }
        },
        backgroundColor: darkMode ? '#1a1a1a' : '#f9f9f9',
        titleColor: darkMode ? '#ffffff' : '#213547',
        bodyColor: darkMode ? '#ffffff' : '#213547',
        borderColor: darkMode ? '#333' : '#e0e0e0',
        borderWidth: 1,
        displayColors: true,
        boxWidth: window.innerWidth < 600 ? 8 : 10
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'x',
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: 'x',
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: darkMode ? '#ffffff' : '#213547',
          maxRotation: 45,
          minRotation: window.innerWidth < 600 ? 45 : 0,
          font: {
            size: window.innerWidth < 600 ? 8 : 10
          },
          callback: function(val, index) {
            const labels = this.chart.data.labels;
            if (window.innerWidth < 600) {
              return index % Math.ceil(labels.length / 6) === 0 ? labels[index] : '';
            }
            return labels[index];
          }
        },
        grid: {
          color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          display: window.innerWidth < 600 ? false : true
        }
      },
      y: { 
        beginAtZero: false,
        title: { 
          display: window.innerWidth < 600 ? false : true,
          text: waterChartTab === 'level' ? 'Water Level (m)' : 'Discharge (m³/s)',
          color: darkMode ? '#ffffff' : '#213547'
        },
        ticks: {
          color: darkMode ? '#ffffff' : '#213547',
          font: {
            size: window.innerWidth < 600 ? 8 : 10
          },
          maxTicksLimit: window.innerWidth < 600 ? 5 : 10
        },
        grid: {
          color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        }
      },
    },
  };

  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentWaterData = sortedWaterData.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(sortedWaterData.length / recordsPerPage);

  return (
    <Container fluid className="px-0">
      {error && (
        <Alert variant="danger" className="mb-2">
          {error}
        </Alert>
      )}
      {waterChartTab && (
        <Card className="mb-2" style={{ 
          width: '100%',
          borderRadius: window.innerWidth < 768 ? '0' : '0.25rem',
          border: window.innerWidth < 768 ? '1px solid var(--border-colour)' : '1px solid var(--border-colour)',
          borderLeft: window.innerWidth < 768 ? 'none' : '',
          borderRight: window.innerWidth < 768 ? 'none' : ''
        }}>
          <Card.Body className={window.innerWidth < 768 ? "p-2 pb-3" : "p-2 p-sm-3"}>
            <h5 className="mb-2">Water Data Visualization</h5>
            <div className="d-flex justify-content-between align-items-center flex-wrap mb-2">
              <div style={{ 
                display: 'flex', 
                marginBottom: '0.5rem',
                overflow: 'visible',
                border: '1px solid var(--border-colour)', 
                borderRadius: '4px',
                maxWidth: '100%'  
              }}>
                <ToggleButton 
                  label="Water Level" 
                  isActive={waterChartTab === 'level'}
                  onClick={() => setWaterChartTab('level')} 
                />
                <ToggleButton 
                  label="Discharge" 
                  isActive={waterChartTab === 'discharge'}
                  onClick={() => setWaterChartTab('discharge')} 
                />
              </div>
              
              <div className="d-flex gap-1 flex-wrap" style={{ maxWidth: '100%' }}>
                {[1, 3, 7, 14, 30].map(days => (
                  <button 
                    key={days}
                    style={{
                      padding: window.innerWidth < 576 ? '4px 6px' : '6px 10px',
                      fontSize: window.innerWidth < 576 ? '0.7rem' : '0.75rem',
                      backgroundColor: timeWindow === days ? 'var(--primary-colour)' : 'var(--button-bg)',
                      color: timeWindow === days ? 'var(--primary-text-colour)' : 'var(--text-colour)',
                      border: '1px solid var(--border-colour)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      flex: window.innerWidth < 576 ? '1' : 'initial'
                    }}
                    onMouseOver={(e) => {
                      if (timeWindow !== days) {
                        e.currentTarget.style.backgroundColor = 'var(--hover-colour)';
                        e.currentTarget.style.color = 'var(--primary-text-colour)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (timeWindow !== days) {
                        e.currentTarget.style.backgroundColor = 'var(--button-bg)';
                        e.currentTarget.style.color = 'var(--text-colour)';
                      }
                    }}
                    onClick={() => setTimeWindow(days)}
                  >
                    {days}{days === 1 ? 'D' : 'D'}
                  </button>
                ))}
              </div>
            </div>
            <div className="chart-container position-relative" style={{ 
              height: '300px',
              minHeight: '250px',
              width: '100%',
              backgroundColor: darkMode ? '#0c0c0c' : '#f3f0f0',
              borderRadius: window.innerWidth < 768 ? '0' : '4px',
              padding: window.innerWidth < 768 ? '6px 0' : '8px',
              overflowX: 'auto',
              overflowY: 'hidden'
            }}>
              <div style={{
                minWidth: '300px',
                width: '100%',
                height: '100%'
              }}>
                {sortedWaterData.length > 0 ? (
                  (() => {
                    const chartData = prepareChartData(waterChartTab);
                    return chartData ? (
                      <>
                        <Line ref={chartRef} data={chartData} options={chartOptions} />
                        <div className="text-center mt-2">
                          <button 
                            style={{
                              padding: '6px 12px',
                              backgroundColor: 'var(--button-bg)',
                              color: 'var(--text-colour)',
                              border: '1px solid var(--border-colour)',
                              borderRadius: '4px',
                              fontSize: '0.875rem',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--primary-colour)';
                              e.currentTarget.style.color = 'var(--primary-text-colour)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--button-bg)';
                              e.currentTarget.style.color = 'var(--text-colour)';
                            }}
                            onClick={resetZoom}
                          >
                            Reset Zoom
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="d-flex align-items-center justify-content-center h-100">
                        <p style={{ color: darkMode ? '#ffffff' : '#213547', opacity: 0.7 }}>
                          No data available for the selected time period
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100">
                    <p style={{ color: darkMode ? '#ffffff' : '#213547', opacity: 0.7 }}>
                      No data available for chart
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Card.Body>
        </Card>
      )}
      <Card>
        <Card.Body className="p-2 p-sm-3">
          <div className="table-responsive">
            <Table 
              className={`table table-striped table-hover ${darkMode ? 'table-dark' : ''} mb-1`} 
              style={{ width: '100%', marginBottom: '0.5rem' }}
            >
              <thead className="table-header">
                <tr>
                  <th className="px-2">Date/Time</th> 
                  <th className="px-2">Water Level</th>
                  <th className="px-2">Discharge</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {currentWaterData.filter(entry => entry && entry.date_time).map((entry, index) => (
                  <tr key={index}>
                    <td className="px-2">{moment(entry.date_time).format('MMMM Do YYYY, h:mm a')}</td>
                    <td className="px-2">{entry.water_level !== null && entry.water_level !== undefined ? `${entry.water_level} m` : 'N/A'}</td>
                    <td className="px-2">{entry.discharge !== null && entry.discharge !== undefined ? `${entry.discharge} m³/s` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '1rem' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-colour)' }}>Records per page:</span>
                {[10, 25, 50, 100].map(num => (
                  <RecordButton 
                    key={num}
                    number={num} 
                    isActive={recordsPerPage === num}
                    onClick={() => {
                      setRecordsPerPage(num);
                      setCurrentPage(1);
                    }} 
                  />
                ))}
              </div>
            </div>
            <div className="label small">
              Showing {indexOfFirstRecord + 1}-{Math.min(indexOfLastRecord, sortedWaterData.length)} of {sortedWaterData.length}
            </div>
          </div>
          <div className="d-flex justify-content-center mt-3 pagination-container">
            <div className="d-flex gap-1">
              <button
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--text-colour)',
                  border: '1px solid var(--border-colour)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                onMouseOver={(e) => {
                  if (currentPage !== 1) {
                    e.currentTarget.style.borderColor = 'var(--primary-colour)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-colour)';
                }}
              >
                First
              </button>
              <button
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--text-colour)',
                  border: '1px solid var(--border-colour)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                onMouseOver={(e) => {
                  if (currentPage !== 1) {
                    e.currentTarget.style.borderColor = 'var(--primary-colour)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-colour)';
                }}
              >
                Previous
              </button>
              <button
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--text-colour)',
                  border: '1px solid var(--border-colour)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                onMouseOver={(e) => {
                  if (currentPage !== totalPages) {
                    e.currentTarget.style.borderColor = 'var(--primary-colour)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-colour)';
                }}
              >
                Next
              </button>
              <button
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--text-colour)',
                  border: '1px solid var(--border-colour)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                onMouseOver={(e) => {
                  if (currentPage !== totalPages) {
                    e.currentTarget.style.borderColor = 'var(--primary-colour)';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-colour)';
                }}
              >
                Last
              </button>
            </div>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default WaterData;