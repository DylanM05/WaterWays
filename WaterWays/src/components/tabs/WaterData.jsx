import React, { useEffect, useState, useRef, useContext } from 'react';
import { Card, Nav, Table, ButtonGroup, Button, Pagination, Form, Container, Alert } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import moment from 'moment';
import '../../styling/waterData.css';
import { ThemeContext } from '../contexts/Theme'; // Import ThemeContext

// Register Chart.js components and plugins
Chart.register(...registerables, zoomPlugin);

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
  const { darkMode } = useContext(ThemeContext); // Access darkMode from ThemeContext
  const [timeWindow, setTimeWindow] = useState(1);
  const chartRef = useRef(null);
  
  // Sort waterData by date_time (newest first)
  const sortedWaterData = [...waterData].sort((a, b) => 
    new Date(b.date_time) - new Date(a.date_time)
  );
  
  // Determine available data
  const hasWaterLevelData = waterData.some(entry => entry.water_level !== undefined && entry.water_level !== null);
  const hasDischargeData = waterData.some(entry => entry.discharge !== undefined && entry.discharge !== null);

  // Set the default tab based on available data
  useEffect(() => {
    if (!hasWaterLevelData && hasDischargeData) {
      setWaterChartTab('discharge');
    } else if (!hasDischargeData && hasWaterLevelData) {
      setWaterChartTab('level');
    } else if (!hasWaterLevelData && !hasDischargeData) {
      setWaterChartTab(null);
    }
  }, [hasWaterLevelData, hasDischargeData, setWaterChartTab]);


const prepareChartData = (dataType) => {
  if (!sortedWaterData || sortedWaterData.length === 0) return null;

  const mostRecentData = sortedWaterData[0];
  const mostRecentDate = new Date(mostRecentData.date_time);
  const cutoffDate = new Date(mostRecentDate);
  cutoffDate.setDate(cutoffDate.getDate() - timeWindow);

  const filteredData = sortedWaterData.filter(entry => {
    const entryDate = new Date(entry.date_time);
    return entryDate >= cutoffDate && (dataType === 'level' ? entry.water_level !== undefined : entry.discharge !== undefined);
  });

  if (filteredData.length === 0) return null;

  const sortedFilteredData = [...filteredData].sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
  const labels = sortedFilteredData.map(entry => moment(entry.date_time).format('MM/DD HH:mm'));

  return {
    labels,
    datasets: [{
      label: dataType === 'level' ? 'Water Level (m)' : 'Discharge (m³/s)',
      data: sortedFilteredData.map(entry => dataType === 'level' ? entry.water_level : entry.discharge),
      borderColor: dataType === 'level' ? '#646cff' : '#ff648b',
      backgroundColor: dataType === 'level' ? '#646cff' : '#ff648b',
      color: '#ffffff',
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
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: waterChartTab === 'level' ? 'Water Level Trend' : 'Discharge Trend',
      },
      tooltip: {
        callbacks: { title: formatTooltipTitle }
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
    scales: { y: { beginAtZero: false } },
  };

  // Use sortedWaterData for pagination
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentWaterData = sortedWaterData.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(sortedWaterData.length / recordsPerPage);

  return (
    <Container fluid>
      {error && (
        <Alert variant="danger">{error}</Alert>
      )}
      {waterChartTab && (
        <Card>
          <Card.Body>
            <h5>Water Data Visualization</h5>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <Nav className='tabs' variant="tabs" activeKey={waterChartTab} onSelect={(k) => setWaterChartTab(k)}>
                {hasWaterLevelData && <Nav.Item><Nav.Link eventKey="level">Water Level</Nav.Link></Nav.Item>}
                {hasDischargeData && <Nav.Item><Nav.Link eventKey="discharge">Discharge</Nav.Link></Nav.Item>}
              </Nav>
              
              <ButtonGroup size="sm" >
                {[1, 3, 7, 14, 30].map(days => (
                  <Button 
                  className={`time-window-button ${timeWindow === days ? 'active' : ''}`}
                    key={days} 
                    variant={timeWindow === days ? "primary" : "outline-primary"} 
                    onClick={() => setTimeWindow(days)}
                  >
                    {days} {days === 1 ? 'Day' : 'Days'}
                  </Button>
                ))}
              </ButtonGroup>
            </div>
            <div className="chart-container" style={{ height: '300px' }}>
              {sortedWaterData.length > 0 ? (
                (() => {
                  const chartData = prepareChartData(waterChartTab);
                  return chartData ? (
                    <>
                      <Line ref={chartRef} data={chartData} options={chartOptions} />
                      <div className="text-center mt-2">
                        <Button 
                          size="sm" 
                          variant="outline-secondary" 
                          onClick={resetZoom}
                        >
                          Reset Zoom
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-100">
                      <p className="text-muted">No data available for the selected time period</p>
                    </div>
                  );
                })()
              ) : (
                <div className="d-flex align-items-center justify-content-center h-100">
                  <p className="text-muted">No data available for chart</p>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>
      )}
      <Card>
        <Card.Body>
          <div className="table-responsive">
            <Table className={`table table-striped table-hover ${darkMode ? 'table-dark' : ''}`}>
              <thead className="table-header">
                <tr>
                  <th>Date/Time</th>
                  <th>Water Level</th>
                  <th>Discharge</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {currentWaterData.map((entry, index) => (
                  <tr key={index}>
                    <td>{moment(entry.date_time).format('MMMM Do YYYY, h:mm a')}</td>
                    <td>{entry.water_level !== null ? `${entry.water_level} m` : 'N/A'}</td>
                    <td>{entry.discharge !== null ? `${entry.discharge} m³/s` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div>
              <Form.Group className="d-inline-flex align-items-center">
                <Form.Label className="me-2 mb-0 label">Records:</Form.Label>
                <Form.Select 
                  size="sm"
                  style={{ width: '80px' }}
                  value={recordsPerPage}
                  onChange={(e) => {
                    setRecordsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {[5, 10, 20, 50].map(val => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="label small">
              Showing {indexOfFirstRecord + 1}-{Math.min(indexOfLastRecord, sortedWaterData.length)} of {sortedWaterData.length}
            </div>
          </div>
          <div className="d-flex justify-content-center mt-3 pagination-container">
            <Pagination>
              <Pagination.Item disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
                First
              </Pagination.Item>
              <Pagination.Item disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>
                Previous
              </Pagination.Item>
              <Pagination.Item disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>
                Next
              </Pagination.Item>
              <Pagination.Item disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
                Last
              </Pagination.Item>
            </Pagination>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default WaterData;