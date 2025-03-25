import React, { useState, useMemo } from 'react';
import { Card, Row, Col, Nav, Container } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import moment from 'moment';
import '../../styling/PressureData.css';

const PressureData = ({ pressureData }) => {
  const [pressureChartTab, setPressureChartTab] = useState('msl');

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
    
    let datasets = [];
    if (tabType === 'msl') {
      datasets.push({
        label: 'Mean Sea Level Pressure (hPa)',
        data: chartData.pressureMsl,
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        tension: 0.1,
      });
    }
    if (tabType === 'surface') {
      datasets.push({
        label: 'Surface Pressure (hPa)',
        data: chartData.surfacePressure,
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.1,
      });
    }
    
    return { labels, datasets };
  };

  const chartData = useMemo(() => preparePressureChartData(pressureChartTab), [pressureData, pressureChartTab]);

  const pressureChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true },
      tooltip: { callbacks: { title: formatTooltipTitle } },
    },
    scales: {
      y: {
        beginAtZero: false,
        title: { display: true, text: 'Pressure (hPa)' },
      },
    },
  };

  return (
    <Container fluid>
      <Card className="mb-4 card-bg">
        <Card.Body>
          <h5 className="text-colour">Barometric Pressure Visualization</h5>
          
          <Nav variant="tabs" className="mb-3" activeKey={pressureChartTab} onSelect={setPressureChartTab}>
            <Nav.Item><Nav.Link eventKey="msl" className="nav-link">MSL Pressure</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="surface" className="nav-link">Surface Pressure</Nav.Link></Nav.Item>
          </Nav>
          
          <div style={{ height: '300px' }}>
            {chartData ? (
              <Line data={chartData} options={pressureChartOptions} />
            ) : (
              <div className="d-flex align-items-center justify-content-center h-100">
                <p className="text-muted">No pressure data available for chart</p>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      <Card className="card-bg">
        <Card.Body>
          <Row>
            <Col xs={12} md={6} className="mb-3 mb-md-0">
              <h5 className="text-center text-colour">About Barometric Pressure</h5>
              <p className="text-left text-colour">Barometric pressure (atmospheric pressure) is the force exerted by the atmosphere at a given point. It's measured in hectopascals (hPa).</p>
              <ul className="no-bullets mt-3 text-left text-colour">
                <li><strong>Mean Sea Level Pressure (MSL)</strong> - Pressure adjusted to sea level for comparison purposes</li>
                <li><strong>Surface Pressure</strong> - Actual pressure measured at the station's elevation</li>
              </ul>
              <p className="mt-3 text-center text-colour">
                <strong>Typical range:</strong> 980-1040 hPa<br />
                <strong>Standard pressure:</strong> 1013.25 hPa
              </p>
            </Col>

            <Col xs={12} md={6}>
              <h5 className="text-colour">Pressure Statistics</h5>
              {pressureData?.pressureMsl ? (
                <>
                  <div className="d-flex justify-content-between mb-2 text-colour">
                    <span>Current MSL Pressure:</span>
                    <strong>{pressureData.pressureMsl[0]} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-2 text-colour">
                    <span>Current Surface Pressure:</span>
                    <strong>{pressureData.surfacePressure[0]} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-2 text-colour">
                    <span>Difference:</span>
                    <strong>{(pressureData.pressureMsl[0] - pressureData.surfacePressure[0]).toFixed(1)} hPa</strong>
                  </div>
                  <hr />
                  <div className="d-flex justify-content-between mb-2 text-colour">
                    <span>24hr Max MSL:</span>
                    <strong>{Math.max(...pressureData.pressureMsl.slice(0, 24)).toFixed(1)} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between mb-2 text-colour">
                    <span>24hr Min MSL:</span>
                    <strong>{Math.min(...pressureData.pressureMsl.slice(0, 24)).toFixed(1)} hPa</strong>
                  </div>
                  <div className="d-flex justify-content-between text-colour">
                    <span>24hr Range:</span>
                    <strong>
                      {(Math.max(...pressureData.pressureMsl.slice(0, 24)) - 
                       Math.min(...pressureData.pressureMsl.slice(0, 24))).toFixed(1)} hPa
                    </strong>
                  </div>
                </>
              ) : (
                <p className="text-muted">No pressure data available</p>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default PressureData;