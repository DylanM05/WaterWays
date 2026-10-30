import React, { useState, useEffect } from 'react';
import { Card, Row, Col } from 'react-bootstrap';
import { useParams } from 'react-router-dom';
import { displayTitle, PROVINCE_NAMES } from '../utility/names';

// OpenStreetMap's embeddable map: no key or account, and it carries its own attribution. The links open
// the station in the map apps people already use.
const mapLinks = (lat, lng, name) => {
  const latSpan = 0.02;
  const lngSpan = 0.035;
  const bbox = [lng - lngSpan, lat - latSpan, lng + lngSpan, lat + latSpan].map(value => value.toFixed(5)).join(',');
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`,
    apple: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}`,
    google: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}`
  };
};

const StationInfo = ({ stationInfo, stationId }) => {
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

  const lat = parseFloat(stationInfo?.latitude);
  const lng = parseFloat(stationInfo?.longitude);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const links = hasLocation ? mapLinks(lat, lng, displayTitle(stationInfo?.stationName || displayStationId || 'Station')) : null;
  const linkStyle = { color: 'var(--primary-colour)', textDecoration: 'none' };

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
                  {PROVINCE_NAMES[stationInfo?.province] || stationInfo?.province || 'N/A'}
                </strong>
              </div>
              
              <div className="mb-3">
                <small className="label mb-1 d-block">
                  Location
                </small>
                <strong style={{ color: 'var(--text-colour)' }}>
                  {hasLocation ? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°` : 'Coordinates unavailable'}
                </strong>
              </div>

              {links && (
                <div className="mb-3">
                  <small className="label mb-1 d-block">
                    Open in
                  </small>
                  <a href={links.apple} target="_blank" rel="noreferrer" style={linkStyle}>Apple Maps</a>
                  {' · '}
                  <a href={links.google} target="_blank" rel="noreferrer" style={linkStyle}>Google Maps</a>
                  {' · '}
                  <a href={links.osm} target="_blank" rel="noreferrer" style={linkStyle}>OpenStreetMap</a>
                </div>
              )}
            </div>
          </Col>
          
          <Col xs={12} md={7}>
            <div
              className="map-container"
              style={{
                borderRadius: '8px',
                overflow: 'hidden',
                height: '400px',
                border: '1px solid var(--border-colour)'
              }}
            >
              {links ? (
                <iframe
                  src={links.embed}
                  title="Station location map"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              ) : (
                <div className="d-flex align-items-center justify-content-center h-100">
                  <p style={{ color: 'var(--text-colour)', opacity: 0.7 }}>Location data unavailable</p>
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