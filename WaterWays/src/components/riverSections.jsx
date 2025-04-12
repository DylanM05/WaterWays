import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Container, Row, Col } from 'react-bootstrap';
import axios from 'axios';
import '../styling/RiverSection.css'; // Import the CSS file for additional styles

const RiverSections = ({ rivers }) => {
  const { riverName } = useParams();
  const [sections, setSections] = useState([]);
  const [latestWaterData, setLatestWaterData] = useState({});
  const isMounted = useRef(true);

  // Handle riverName and rivers loading properly
  useEffect(() => {
    if (rivers && rivers[riverName]) {
      setSections(rivers[riverName]);
    } else {
      setSections([]);
    }
  }, [rivers, riverName]);

  useEffect(() => {
    isMounted.current = true;

    const fetchLatestWaterData = async () => {
      if (sections.length === 0) return; // Prevent fetching if no sections

      try {
        const dataPromises = sections.map(async (section) => {
          try {
            const response = await axios.get(
              `https://backend.dylansserver.top/details/latest-water-data/${section.station_id}`
            );
            const dateTime = new Date(response.data.date_time);
            const formattedTime = dateTime.toLocaleString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              hour12: true,
            });
            return { stationId: section.station_id, data: response.data, time: formattedTime };
          } catch (error) {
            console.error(
              `Error fetching latest water data for station ${section.station_id}:`,
              error
            );
            return { stationId: section.station_id, data: null, time: null };
          }
        });

        const data = await Promise.all(dataPromises);
        const dataMap = data.reduce((acc, item) => {
          acc[item.stationId] = item;
          return acc;
        }, {});

        if (isMounted.current) {
          setLatestWaterData(dataMap);
        }
      } catch (error) {
        console.error('Error fetching water data:', error);
      }
    };

    fetchLatestWaterData();

    return () => {
      isMounted.current = false;
    };
  }, [sections]);

  // Loading State
  if (!sections.length) {
    return (
      <Container>
        <h1 className="river-title">{riverName}</h1>
        <p>Loading sections or no data available.</p>
      </Container>
    );
  }

  return (
    <Container>
      <h1 className="river-title">{riverName}</h1>
      <Row className="justify-content-center">
        {sections.map((section, index) => (
          <Col key={index} xs={12} className="mb-4">
            <Link to={`/canada/station-details/${section.station_id}`} className="section-link">
              <Card className="h-100 section-card">
                <Card.Body>
                  <Card.Title>{section.section}</Card.Title>
<Card.Text as="div">
  <strong>Station ID:</strong> {section.station_id}
  <br />
  {latestWaterData[section.station_id] && latestWaterData[section.station_id].data && (
    <Row>
      {latestWaterData[section.station_id].data.water_level !== undefined &&
        latestWaterData[section.station_id].data.water_level !== null && (
          <Col>
            <div className="river-section-metric">
              Water Level
              <br />
              {latestWaterData[section.station_id].data.water_level.toFixed(2)} m
            </div>
          </Col>
        )}
      {latestWaterData[section.station_id].data.discharge !== undefined &&
        latestWaterData[section.station_id].data.discharge !== null && (
          <Col>
            <div className="river-section-metric">
              Discharge
              <br />
              {latestWaterData[section.station_id].data.discharge.toFixed(2)} m³/s
            </div>
          </Col>
        )}
      {latestWaterData[section.station_id].time &&
        latestWaterData[section.station_id].time !== "Invalid Date" && (
          <Col xs={12}>
            <div className="river-section-time">
              <strong>Last updated:</strong> {latestWaterData[section.station_id].time}
            </div>
          </Col>
        )}
    </Row>
  )}
</Card.Text>

                </Card.Body>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </Container>
  );
};

export default RiverSections;
