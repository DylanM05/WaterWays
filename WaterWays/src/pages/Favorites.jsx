import React, { useState, useEffect } from 'react';
import { Container, Alert, Row, Col, Card, Badge, Spinner } from 'react-bootstrap';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { FaTrash, FaExclamationCircle, FaThermometerHalf, FaTint, FaCompass } from 'react-icons/fa';
import { WiBarometer } from 'react-icons/wi';
import axios from 'axios';

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

const API_BASE_URL = 'https://backend.dylansserver.top';
/* http://localhost:42069 */

const Favorites = () => {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stationDetails, setStationDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  const [hoverDeleteId, setHoverDeleteId] = useState(null);
  
  // Fetch favorites list
  useEffect(() => {
    const fetchFavorites = async () => {
      if (!isLoaded || !isSignedIn) return;
      
      try {
        setLoading(true);
        const token = await getToken();
        const response = await axios.get(`${API_BASE_URL}/u/favorites`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setFavorites(response.data);
      } catch (err) {
        setError('Failed to load favorites');
        console.error('Error fetching favorites:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFavorites();
  }, [isLoaded, isSignedIn, getToken]);

  // Fetch additional details for each favorite
  useEffect(() => {
    const fetchStationDetails = async () => {
      if (favorites.length === 0) return;
      
      const detailsData = {};
      
      for (const favorite of favorites) {
        const stationId = favorite.stationId;
        try {
          setLoadingDetails(prev => ({ ...prev, [stationId]: true }));
          
          // Fetch station coordinates/info first to get name and location
          const coordinatesRes = await axios.get(`${API_BASE_URL}/details/coordinates/${stationId}`);
          
          // Fetch other data in parallel
          const [weatherRes, waterDataRes, pressureRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/details/weather/${stationId}`),
            axios.get(`${API_BASE_URL}/details/latest-water-data/${stationId}`).catch(() => ({ data: null })),
            axios.get(`${API_BASE_URL}/details/pressure/${stationId}`).catch(() => ({ data: null }))
          ]);

          detailsData[stationId] = {
            stationInfo: coordinatesRes.data,
            weather: weatherRes.data,
            waterData: waterDataRes.data,
            pressure: pressureRes.data
          };
        } catch (err) {
          console.error(`Error fetching details for station ${stationId}:`, err);
          detailsData[stationId] = { error: true };
        } finally {
          setLoadingDetails(prev => ({ ...prev, [stationId]: false }));
        }
      }
      
      setStationDetails(detailsData);
    };

    fetchStationDetails();
  }, [favorites]);

  const removeFavorite = async (stationId, stationName) => {
    if (window.confirm(`Remove "${stationName}" from favorites?`)) {
      try {
        const token = await getToken();
        await axios.delete(`${API_BASE_URL}/u/favorites/${stationId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        // Update local state
        setFavorites(prev => prev.filter(fav => fav.stationId !== stationId));
      } catch (err) {
        setError('Failed to remove favorite');
        console.error('Error removing favorite:', err);
      }
    }
  };

  if (!isLoaded) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/" />;
  }

  return (
    <Container className="mt-4 mb-5">
      <h1 className="mb-4 text-center" style={{ color: 'var(--text-colour)' }}>Favorite Stations</h1>
      
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible style={{ color: 'var(--text-colour)' }}>
          <FaExclamationCircle /> {error}
        </Alert>
      )}
      
      {loading ? (
        <div className="text-center mt-5">
          <Spinner animation="border" role="status" style={{ color: 'var(--text-colour)' }}>
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      ) : favorites.length === 0 ? (
        <Alert variant="info" className="text-center" style={{ color: 'var(--text-colour)', backgroundColor: 'var(--card-bg-colour)', borderColor: 'var(--border-colour)' }}>
          You haven't added any favorite stations yet.
        </Alert>
      ) : (
        <Row xs={1} md={2} lg={3} className="g-4">
          {favorites.map((favorite) => {
            const details = stationDetails[favorite.stationId]; // Fix: Use stationDetails instead of enrichedFavorites
            const isLoading = loadingDetails[favorite.stationId];
            
            // Get the station name from details.stationInfo (if available) or fall back to favorite.stationName
            const stationName = details?.stationInfo?.stationName || favorite.stationName;
            
            return (
              <Col key={favorite.stationId}>
                <Card 
                  className="h-100 position-relative" 
                  style={{ 
                    backgroundColor: 'var(--card-bg-colour)', 
                    borderColor: 'var(--border-colour)',
                    transition: 'transform 0.2s ease',
                    cursor: 'pointer'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                  onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <Card.Header className="d-flex justify-content-between align-items-center">
                    <Badge bg="info" style={{ backgroundColor: 'var(--primary-colour)', color: 'var(--primary-text-colour)' }}>
                      {provinceMapping[favorite.province] || favorite.province}
                    </Badge>
                    <button 
                      onClick={(e) => {
                        e.preventDefault(); 
                        e.stopPropagation();
                        removeFavorite(favorite.stationId, stationName);
                      }}
                      className="btn btn-sm delete-button"
                      style={{
                        background: hoverDeleteId === favorite.stationId ? 'rgba(220, 53, 69, 0.1)' : 'transparent',
                        border: hoverDeleteId === favorite.stationId ? '1px solid #dc3545' : 'none',
                        color: hoverDeleteId === favorite.stationId ? '#dc3545' : 'var(--text-colour)',
                        opacity: hoverDeleteId === favorite.stationId ? 1 : 0.7,
                        zIndex: 2,
                        borderRadius: '4px',
                        padding: '4px 8px',
                        transition: 'all 0.2s ease',
                        marginLeft: 'auto' // This helps ensure it stays on the right
                      }}
                      onMouseEnter={() => setHoverDeleteId(favorite.stationId)}
                      onMouseLeave={() => setHoverDeleteId(null)}
                      aria-label={`Remove ${stationName} from favorites`}
                    >
                      <FaTrash />
                      {hoverDeleteId === favorite.stationId && <span className="ms-1">Remove</span>}
                    </button>
                  </Card.Header>
                  
                  <Card.Body className="text-center d-flex flex-column">
                    <Card.Title 
                      className="mb-3" 
                      style={{ 
                        color: 'var(--text-colour)', 
                        fontSize: '1.2rem',
                        borderBottom: '1px solid var(--border-colour)',
                        paddingBottom: '0.5rem'
                      }}
                    >
                      {stationName}
                    </Card.Title>
                    
                    <div className="text-center mb-3">
                      <span style={{ color: 'var(--text-colour)', fontSize: '0.9rem' }}>
                        Station ID: <strong>{favorite.stationId}</strong>
                      </span>
                    </div>
                    
                    {isLoading ? (
                      <div className="text-center my-3 flex-grow-1 d-flex align-items-center justify-content-center">
                        <Spinner animation="border" size="sm" style={{ color: 'var(--text-colour)' }} />
                      </div>
                    ) : details?.error ? (
                      <Alert variant="warning" className="py-2 small text-center" style={{ color: 'var(--text-colour)', backgroundColor: 'rgba(var(--primary-colour-rgb), 0.1)', borderColor: 'var(--border-colour)' }}>
                        Unable to fetch station details
                      </Alert>
                    ) : details ? ( // Fix: Use details instead of stationDetails
                      <div className="station-details flex-grow-1">
                        <Row className="g-3 justify-content-center">
                          {details.weather && (
                            <>
                              <Col xs={12} className="mb-2">
                                <div className="p-2 rounded" style={{ backgroundColor: 'rgba(var(--primary-colour-rgb), 0.1)' }}>
                                  <FaThermometerHalf 
                                    size={22} 
                                    style={{ color: 'var(--text-colour)' }} 
                                    className="mb-1"
                                  />
                                  <div className="mt-1">
                                    <div className="small" style={{ color: 'var(--text-colour)', opacity: 0.8 }}>Temperature</div>
                                    <div className="fw-bold" style={{ fontSize: '1.1rem', color: 'var(--text-colour)' }}>
                                      {details.weather.temperature}°C
                                    </div>
                                    {details.weather.apparentTemperature && (
                                      <div className="small" style={{ color: 'var(--text-colour)', opacity: 0.8 }}>
                                        Feels like {details.weather.apparentTemperature}°C
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </Col>
                              
                              <Col xs={6}>
                                <div className="p-2 h-100 rounded" style={{ backgroundColor: 'rgba(var(--primary-colour-rgb), 0.05)' }}>
                                  <FaCompass 
                                    size={20} 
                                    style={{ color: 'var(--text-colour)' }} 
                                    className="mb-1"
                                  />
                                  <div className="mt-1">
                                    <div className="small" style={{ color: 'var(--text-colour)', opacity: 0.8 }}>Condition</div>
                                    <div className="fw-semibold" style={{ color: 'var(--text-colour)' }}>
                                      {details.weather.weather}
                                    </div>
                                  </div>
                                </div>
                              </Col>
                              
                              {details.pressure && (
                                <Col xs={6}>
                                  <div className="p-2 h-100 rounded" style={{ backgroundColor: 'rgba(var(--primary-colour-rgb), 0.05)' }}>
                                    <WiBarometer 
                                      size={20} 
                                      style={{ color: 'var(--text-colour)' }} 
                                      className="mb-1"
                                    />
                                    <div className="mt-1">
                                      <div className="small" style={{ color: 'var(--text-colour)', opacity: 0.8 }}>Pressure</div>
                                      <div className="fw-semibold" style={{ color: 'var(--text-colour)' }}>
                                        {details.pressure.pressureMsl?.[0] || 'N/A'} hPa
                                      </div>
                                    </div>
                                  </div>
                                </Col>
                              )}
                            </>
                          )}
                          
                          {details.waterData && (
                            <Col xs={12} className="mt-2">
                              <div className="p-2 rounded" style={{ backgroundColor: 'rgba(var(--primary-colour-rgb), 0.05)' }}>
                                <FaTint 
                                  size={20} 
                                  style={{ color: 'var(--text-colour)' }} 
                                  className="mb-1"
                                />
                                <div className="mt-1">
                                  <div className="small" style={{ color: 'var(--text-colour)', opacity: 0.8 }}>Water Level</div>
                                  <div className="fw-semibold" style={{ color: 'var(--text-colour)' }}>
                                    {details.waterData.water_level || 'N/A'} m
                                  </div>
                                </div>
                              </div>
                            </Col>
                          )}
                        </Row>
                      </div>
                    ) : null}
                  </Card.Body>
                  
                  <Card.Footer className="text-center small" style={{ color: 'var(--text-colour)', opacity: 0.7 }}>
                    <span>
                      Last updated: {details?.weather?.time?.split(', ')[1] || 'Unknown'}
                    </span>
                  </Card.Footer>
                  
                  <Link 
                    to={`/station-details/${favorite.stationId}`}
                    className="stretched-link"
                    aria-label={`View details for station ${stationName}`}
                  />
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </Container>
  );
};

export default Favorites;
