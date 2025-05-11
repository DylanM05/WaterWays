import React, { useContext, useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Badge } from 'react-bootstrap';
import { ThemeContext } from './contexts/Theme';
import { useUser, useClerk, useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import '../styling/settings.css';
import { useSettings } from '../contexts/SettingsContext'; // Import the useSettings hook
import { FaTags, FaCheck, FaCrown, FaCalendarAlt, FaClock } from 'react-icons/fa';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ProfileModal from './modals/profileModal'; 

/* const BACKEND_URL = 'https://backend.dylansserver.top'; */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const Settings = () => {
  const navigate = useNavigate();
  const { darkMode, toggleTheme } = useContext(ThemeContext);
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const { updateSettings } = useSettings();
  const [searchParams] = useSearchParams(); // Add this line to get URL parameters
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [showProfileModal, setShowProfileModal] = useState(false); 
  const [preferences, setPreferences] = useState({
    temperatureUnit: localStorage.getItem('temperatureUnit') === 'fahrenheit',
    defaultTab: localStorage.getItem('defaultTab') || 'water'
  });
  const [subscriptionStatus, setSubscriptionStatus] = useState(null); // Add this state for subscription
  const [isAdmin, setIsAdmin] = useState(false); // Add new state for admin status

  useEffect(() => {
    if (user) {
      fetchUserSettings();
      checkAdminStatus(); // Add admin status check
    }
  }, [user]);

  useEffect(() => {
    // Check if this is a redirect from Stripe
    const isSuccess = searchParams.get('subscription') === 'success';
    const sessionId = searchParams.get('session_id');
    
    if (isSuccess && sessionId) {
      // Add a message to let the user know we're verifying their subscription
      setNotification({
        show: true,
        message: 'Verifying your subscription...',
        type: 'info'
      });
      
      // Check subscription status
      checkSubscription();
    }
  }, [searchParams]);

  // Add this useEffect to automatically load subscription status
  useEffect(() => {
    if (user) {
      // Load user settings and check admin status
      fetchUserSettings();
      checkAdminStatus();
      
      // Also check subscription status
      checkSubscription();
    }
  }, [user]); // This will run whenever the user changes or on initial load

  useEffect(() => {
    // Only set up refresh interval if user is logged in
    if (!user) return;
    
    // Initial check when component mounts
    checkSubscription(false); // Silent check
    
    // Set up interval to refresh subscription data every 2 minutes
    const refreshInterval = setInterval(() => {
      checkSubscription(false); // Pass false to avoid showing notifications on auto-refresh
    }, 120000); // 2 minutes
    
    // Clean up interval when component unmounts
    return () => clearInterval(refreshInterval);
  }, [user]); // Only re-run this effect if the user changes

  const fetchUserSettings = async () => {
    if (!user) return;

    try {
      const token = await getToken();
      const response = await axios.get(`${API_BASE_URL}/s/${user.id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.data && response.data.settings) {
        const serverSettings = response.data.settings;

        localStorage.setItem('temperatureUnit', serverSettings.temperatureUnit || 'celsius');
        localStorage.setItem('defaultTab', serverSettings.defaultTab || 'water');

        setPreferences({
          temperatureUnit: serverSettings.temperatureUnit === 'fahrenheit',
          defaultTab: serverSettings.defaultTab || 'water'
        });

        if (serverSettings.theme === 'dark' && !darkMode) {
          toggleTheme();
        } else if (serverSettings.theme === 'light' && darkMode) {
          toggleTheme();
        }
      }
    } catch (error) {
      console.error('Error fetching user settings:', error);
      if (error.response && error.response.status !== 404) {
        setNotification({
          show: true,
          message: 'Failed to load your settings. Using local settings instead.',
          type: 'warning'
        });
      }
    }
  };

  const saveSettingsToServer = async (settingsToSave) => {
    if (!user) return;

    try {
      await axios.post(`${API_BASE_URL}/s/${user.id}`, {
        settings: settingsToSave
      });
    } catch (error) {
      console.error('Error saving settings to server:', error);
      setNotification({
        show: true,
        message: 'Settings saved locally, but failed to sync with the server.',
        type: 'warning'
      });
    }
    fetchUserSettings();
  };

  const checkSubscription = async (showNotifications = true) => {
    try {
      const token = await getToken();
      const response = await axios.get(`${API_BASE_URL}/sub/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSubscriptionStatus(response.data);
      
      if (showNotifications) {
        if (response.data.subscribed) {
          setNotification({
            show: true,
            message: 'Your subscription is active! You now have access to premium features.',
            type: 'success'
          });
        } else {
          setNotification({
            show: true,
            message: 'Your subscription is being processed. It may take a few minutes to activate.',
            type: 'warning'
          });
          
          // Try again in 10 seconds, but only during processing
          setTimeout(() => checkSubscription(true), 10000);
        }
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
      
      if (showNotifications) {
        setNotification({
          show: true,
          message: 'Failed to verify your subscription. Please try again later.',
          type: 'danger'
        });
      }
      
      // Retry after error (with exponential backoff)
      setTimeout(() => checkSubscription(false), 5000);
    }
  };

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const token = await getToken();
      const response = await axios.get(`${API_BASE_URL}/admin/check`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setIsAdmin(response.data.isAdmin);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    }
  };

  const goToAdminDashboard = () => {
    navigate('/admin/5jN!^2pw&Bi4a0y26M^H');
  };

  const handleToggleChange = (e) => {
    const { name, checked } = e.target;
    let value;

    if (name === 'temperatureUnit') {
      value = checked ? 'fahrenheit' : 'celsius';
      
      // Update the global context immediately
      updateSettings({ temperatureUnit: value });
    }

    setPreferences(prev => ({ ...prev, [name]: checked }));
    localStorage.setItem(name, value);

    if (user) {
      const settingsToSave = {
        temperatureUnit: name === 'temperatureUnit' ? value : (preferences.temperatureUnit ? 'fahrenheit' : 'celsius'),
        defaultTab: preferences.defaultTab,
        theme: darkMode ? 'dark' : 'light'
      };

      saveSettingsToServer(settingsToSave);
    }

    setNotification({
      show: true,
      message: user ? 'Preference saved locally and synced with your account!' : 'Preference saved locally!',
      type: 'success'
    });

    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const handleSelectChange = (e) => {
    const { name, value } = e.target;

    if (name === 'defaultTab') {
      // Update the global context immediately
      updateSettings({ defaultTab: value });
    }

    setPreferences(prev => ({ ...prev, [name]: value }));
    localStorage.setItem(name, value);

    if (user) {
      const settingsToSave = {
        temperatureUnit: preferences.temperatureUnit ? 'fahrenheit' : 'celsius',
        defaultTab: value,
        theme: darkMode ? 'dark' : 'light'
      };

      saveSettingsToServer(settingsToSave);
    }

    setNotification({
      show: true,
      message: user ? 'Preference saved locally and synced with your account!' : 'Preference saved locally!',
      type: 'success'
    });

    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  useEffect(() => {
    if (user) {
      const settingsToSave = {
        temperatureUnit: preferences.temperatureUnit ? 'fahrenheit' : 'celsius',
        defaultTab: preferences.defaultTab,
        theme: darkMode ? 'dark' : 'light'
      };

      saveSettingsToServer(settingsToSave);
    }
  }, [darkMode]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
      setNotification({
        show: true,
        message: 'Failed to sign out. Please try again.',
        type: 'danger'
      });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  return (
    <Container className="py-4">
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>

      {notification.show && (
        <Alert variant={notification.type} onClose={() => setNotification({ ...notification, show: false })} dismissible>
          {notification.message}
        </Alert>
      )}

      <Row className="mb-4">
        <Col>
          <Card className="settings-card">
            <Card.Header className="settings-card-header">
              <h2 className="text-xl font-medium">Profile Information</h2>
            </Card.Header>
            <Card.Body>
              {user ? (
                <div className="user-info">
                  <div className="mb-3 d-flex align-items-center ">
                    <img 
                      src={user.imageUrl} 
                      alt={user.fullName || "User"} 
                      className="user-avatar"
                    />
                    <div className="ms-3">
                      <h3 className="font-medium">{user.fullName}</h3>
                      <p>{user.primaryEmailAddress?.emailAddress}</p>
                    </div>
                  </div>
                  <p>Manage your profile information and billing settings below.</p>

                  <div className="d-flex justify-content-center gap-3">
                    {isAdmin && (
                      <Button 
                        variant="outline-primary" 
                        className="bottom-button"
                        onClick={goToAdminDashboard}
                      >
                        Admin Dashboard
                      </Button>
                    )}
                    <Button 
                      variant="primary" 
                      className="settings-button"
                      onClick={checkSubscription }
                      >Verify Subscription</Button>
                    <Button 
                      variant="primary" 
                      className="settings-button"
                      onClick={() => setShowProfileModal(true)} 
                    >Manage Profile
                    </Button>
                    <Button 
                      className="settings-button"
                      onClick={handleSignOut}
                      style={ { backgroundColor: 'red', color: 'white', border: 'none' } }
                    >Sign Out
                    </Button>
                  </div>
                </div>
              ) : (
                <p>Please sign in to view your profile information.</p>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
  <Col>
    <Card className="settings-card subscription-card">
    <Card.Header className="settings-card-header">
              <h2 className="text-xl font-medium">Subscription</h2>
            </Card.Header>
      <Card.Body className="p-0">
        {user && (
          <div className="subscription-container"> 
            {subscriptionStatus ? (
              <div className="subscription-details">
                {/* Status Badge - Made more prominent */}
                <div className="subscription-status-badge mb-4">
                  {subscriptionStatus.subscribed ? (
                    <Badge bg="success" className="status-badge active">
                      <FaCheck className="me-2" /> Active Subscription
                    </Badge>
                  ) : (
                    <Badge bg="secondary" className="status-badge inactive">
                      Free Account
                    </Badge>
                  )}
                </div>
                
                {/* Plan Info Card */}
                <div className="plan-info-card">
                  <div className="plan-info-row">
                    <span className="info-label">Plan:</span>
                    <span className="info-value">
                      {subscriptionStatus.plan === 'lifetime' ? 'Lifetime Access' : 
                       subscriptionStatus.plan === 'free' ? 'Free' :
                       subscriptionStatus.subscribed ? `Premium (${subscriptionStatus.plan || 'Standard'})` : 'Free Plan'}
                    </span>
                  </div>
                  
                  {subscriptionStatus.expiresAt && (
                    <div className="plan-info-row">
                      <span className="info-label">
                        <FaCalendarAlt className="me-2" /> Next billing:
                      </span>
                      <span className="info-value">{formatDate(subscriptionStatus.expiresAt)}</span>
                    </div>
                  )}
                </div>
                
                {/* Subscription Features */}
                {subscriptionStatus.subscribed && subscriptionStatus.plan !== 'lifetime' && (
                  <div className="subscription-features">
                    <h5 className="features-heading">Included Features</h5>
                    <ul className="features-list">
                      <li className="feature-item">
                        <FaCheck className="feature-icon" /> Unlimited favorites
                      </li>
                      <li className="feature-item">
                        <FaCheck className="feature-icon" /> Priority support
                      </li>
                      <li className="feature-item">
                        <FaCheck className="feature-icon" /> Premium weather data
                      </li>
                    </ul>
                  </div>
                )}
                
                {/* Upgrade Button */}
                {!subscriptionStatus.subscribed && (
                  <div className="upgrade-container">
                    <Button 
                      variant="primary"
                      size="lg"
                      onClick={() => navigate('/pricing')}
                      className="upgrade-button"
                    >
                      <FaCrown className="me-2" /> Upgrade to Premium
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="loading-container">
                <div className="spinner-container">
                  <FaClock className="loading-icon" />
                  <span className="loading-text">Loading subscription information...</span>
                </div>
                <Button 
                  variant="link"
                  onClick={checkSubscription}
                  className="refresh-button"
                >
                  Refresh
                </Button>
              </div>
            )}
          </div>
        )}
      </Card.Body>
    </Card>
  </Col>
</Row>

      <Row className="mb-4">
        <Col>
          <Card className="settings-card">
            <Card.Header className="settings-card-header">
              <h2 className="text-xl font-medium">Display Settings</h2>
            </Card.Header>
            <Card.Body>
              <Form>
                <Form.Group className="mb-4 toggle-group">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <Form.Label className="mb-0 toggle-label">Theme</Form.Label>
                      <div className="toggle-description">
                        {darkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
                      </div>
                    </div>
                    <Form.Check 
                      type="switch"
                      id="theme-switch"
                      checked={darkMode}
                      onChange={toggleTheme}
                      className="custom-switch"
                    />
                  </div>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Default Tab</Form.Label>
                  <Form.Select 
                    name="defaultTab"
                    value={preferences.defaultTab}
                    onChange={handleSelectChange}
                    className="settings-select"
                  >
                    <option value="water">Water Data</option>
                    <option value="pressure">Pressure Data</option>
                    <option value="weather">Current Weather</option>
                    <option value="hourlyforecast">Hourly Forecast</option>
                    <option value="weeklyforecast">Weekly Forecast</option>
                    <option value="map">Map</option>
                  </Form.Select>
                </Form.Group>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col>
          <Card className="settings-card">
            <Card.Header className="settings-card-header">
              <h2 className="text-xl font-medium">Unit Preferences</h2>
            </Card.Header>
            <Card.Body>
              <Form>
                <Form.Group className="mb-4 toggle-group">
                  <div className="toggle-container">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <Form.Label className="mb-0 toggle-label">Temperature Unit</Form.Label>
                        <div className="toggle-description">
                          {preferences.temperatureUnit ? 'Fahrenheit (°F)' : 'Celsius (°C)'}
                        </div>
                      </div>
                      <Form.Check 
                        type="switch"
                        id="temperature-switch"
                        name="temperatureUnit"
                        checked={preferences.temperatureUnit}
                        onChange={handleToggleChange}
                        className="custom-switch"
                      />
                    </div>
                  </div>
                </Form.Group>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col>
          <Card className="settings-card">
            <Card.Header className="settings-card-header">
              <h2 className="text-xl font-medium">About WaterWays</h2>
            </Card.Header>
            <Card.Body>
              <div className="about-section">
                <p><strong>Version:</strong> 1.0.0</p>
                <p><strong>Last Updated:</strong> May 5, 2025</p>
                <p>WaterWays provides real-time water level and weather data for rivers and lakes across Canada.</p>
                <div className="mt-3">
                  <Button 
                    variant="outline-secondary" 
                    className="me-2 bottom-button"
                    onClick={() => window.open('https://github.com/DylanM05/WaterWays', '_blank')}
                  >
                    GitHub Repository
                  </Button>
                  <Button 
                    variant="outline-secondary"
                    className="bottom-button"
                    onClick={() => window.open('mailto:support@waterways.example.com', '_blank')}
                  >
                    Contact Support
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Add the modal for UserProfile */}
      <ProfileModal 
        show={showProfileModal} 
        handleClose={() => setShowProfileModal(false)} 
      />
    </Container>
  );
};

export default Settings;
