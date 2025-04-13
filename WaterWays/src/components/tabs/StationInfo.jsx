import React, { useState, useEffect, useRef } from 'react';
import { Card, Alert, Row, Col, Spinner } from 'react-bootstrap';
import { useParams } from 'react-router-dom';

const provinceMapping = {
  'MB': 'Manitoba',
  'ON': 'Ontario',
  'QC': 'Quebec',
  'BC': 'British Columbia',
  'AB': 'Alberta',
  'SK': 'Saskatchewan',
  'NS': 'Nova Scotia',
  'NB': 'New Brunswick',
  'NL': 'Newfoundland and Labrador',
  'PE': 'Prince Edward Island',
  'NT': 'Northwest Territories',
  'YT': 'Yukon',
  'NU': 'Nunavut'
};

const StationInfo = ({ stationInfo, stationId }) => {
  const [mapUrl, setMapUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const mapContainerRef = useRef(null);
  const params = useParams();
  const displayStationId = stationId || params.stationId;
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 768);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
  
    if (stationInfo?.latitude && stationInfo?.longitude) {
      setIsLoading(true);
      setError(null);
  
      const baseUrl = process.env.NODE_ENV === 'development' 
        ? 'https://backend.dylansserver.top'
        : 'http://localhost:42069';
  
      try {
        const lat = parseFloat(stationInfo.latitude);
        const lng = parseFloat(stationInfo.longitude);
  
        if (isNaN(lat) || isNaN(lng)) {
          throw new Error('Invalid coordinates');
        }
  
        fetch(`${baseUrl}/api/proxy-maps/${lat}/${lng}`)
          .then(res => {
            if (!res.ok) throw new Error(`Server responded with status: ${res.status}`);
            return res.json();
          })
          .then(data => {
            if (isMounted) {
              if (data && data.mapUrl) {
                setMapUrl(data.mapUrl);
              } else {
                throw new Error('Invalid response format from map proxy');
              }
            }
          })
          .catch(err => {
            if (isMounted) {
              console.error('Failed to fetch map:', err);
              setError('Unable to load map. Please try again later.');
            }
          })
          .finally(() => {
            if (isMounted) setIsLoading(false);
          });
      } catch (err) {
        if (isMounted) {
          console.error('Error processing coordinates:', err);
          setError('Invalid location data');
          setIsLoading(false);
        }
      }
    }
  
    return () => {
      isMounted = false;
    };
  }, [stationInfo?.latitude, stationInfo?.longitude]);
  
  
  return (
    <Card 
      className="mb-4" 
      style={{ 
        backgroundColor: 'var(--card-bg-colour)', 
        borderColor: 'var(--border-colour)',
        width: '100%',
        borderRadius: windowWidth < 768 ? '0' : '0.25rem',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--border-colour)',
        borderBottomWidth: '1px',
        borderBottomStyle: 'solid',
        borderBottomColor: 'var(--border-colour)',
        borderLeftWidth: windowWidth < 768 ? '0' : '1px',
        borderLeftStyle: 'solid',
        borderLeftColor: 'var(--border-colour)',
        borderRightWidth: windowWidth < 768 ? '0' : '1px',
        borderRightStyle: 'solid',
        borderRightColor: 'var(--border-colour)'
      }}
    >
      <Card.Body className={windowWidth < 768 ? "p-2 pb-3" : "p-3"}>
        <h5 
          style={{ 
            color: 'var(--text-colour)',
            fontSize: windowWidth < 576 ? '1.15rem' : '1.25rem',
            marginBottom: '1rem',
            paddingBottom: '0.5rem',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--border-colour)'
          }}
        >
          Station Information
        </h5>
        
        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
          </Alert>
        )}
        
        <Row className="mb-4">
          <Col xs={12} md={5} className="mb-3 mb-md-0">
            <div className="station-details">
              <div className="mb-3">
                <small className="label mb-1 d-block">
                  Station ID
                </small>
                <strong style={{ color: 'var(--text-colour)' }}>
                  {displayStationId || 'N/A'}
                </strong>
              </div>
              
              <div className="mb-3">
                <small className="label mb-1 d-block">
                  Province
                </small>
                <strong style={{ color: 'var(--text-colour)' }}>
                  {provinceMapping[stationInfo?.province] || stationInfo?.province || 'N/A'}
                </strong>
              </div>
              
              <div className="mb-3">
                <small className="label mb-1 d-block">
                  Location
                </small>
                <strong style={{ color: 'var(--text-colour)' }}>
                  {stationInfo?.latitude && stationInfo?.longitude ? 
                    `${parseFloat(stationInfo.latitude).toFixed(4)}°, ${parseFloat(stationInfo.longitude).toFixed(4)}°` : 
                    'Coordinates unavailable'}
                </strong>
              </div>
            </div>
          </Col>
          
          <Col xs={12} md={7}>
            <div 
              ref={mapContainerRef}
              className="map-container"
              style={{
                borderRadius: "8px", 
                overflow: "hidden",
                height: '400px',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--border-colour)'
              }}
            >
              {isLoading ? (
                <div className="d-flex align-items-center justify-content-center bg-light h-100">
                  <Spinner animation="border" role="status" variant="primary">
                    <span className="visually-hidden">Loading map...</span>
                  </Spinner>
                </div>
              ) : mapUrl ? (
                <iframe
                  src={mapUrl} 
                  allowFullScreen
                  referrerPolicy="no-referrer"
                  title="Station Location Map"
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    borderWidth: '0',
                    borderStyle: 'none',
                    borderColor: 'transparent',
                    borderRadius: '8px'
                  }}
                />           
              ) : (
                <div className="d-flex align-items-center justify-content-center bg-light h-100"> 
                  <p className="text-muted">
                    {!stationInfo?.latitude ? "Location data unavailable" : "Unable to load map"}
                  </p>
                </div>
              )}
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default StationInfo;