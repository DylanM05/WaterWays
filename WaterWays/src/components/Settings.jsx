import React, { useContext, useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Modal } from 'react-bootstrap';
import { ThemeContext } from './contexts/Theme';
import { useUser, useClerk, useAuth, UserProfile } from '@clerk/clerk-react';
import axios from 'axios';
import '../styling/settings.css';
import { useSettings } from '../contexts/SettingsContext'; // Import the useSettings hook

const BACKEND_URL = 'https://backend.dylansserver.top';
/* const BACKEND_URL = 'http://localhost:42069'; */

const Settings = () => {
  const { darkMode, toggleTheme } = useContext(ThemeContext);
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const { updateSettings } = useSettings(); // Get the updateSettings function
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [showProfileModal, setShowProfileModal] = useState(false); // State for controlling the profile modal
  const [preferences, setPreferences] = useState({
    temperatureUnit: localStorage.getItem('temperatureUnit') === 'fahrenheit',
    defaultTab: localStorage.getItem('defaultTab') || 'water'
  });

  useEffect(() => {
    if (user) {
      fetchUserSettings();
    }
  }, [user]);

  const fetchUserSettings = async () => {
    if (!user) return;

    try {
      const token = await getToken();
      const response = await axios.get(`${BACKEND_URL}/s/${user.id}`, {
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
      await axios.post(`${BACKEND_URL}/s/${user.id}`, {
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
                  <div className="mb-3 d-flex align-items-center">
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
                  <p>Manage your profile information through your Clerk account settings.</p>
                  <div className="d-flex justify-content-center gap-3">
                    <Button 
                      variant="primary" 
                      className="settings-button"
                      onClick={() => setShowProfileModal(true)} // Open modal instead of external link
                    >
                      Manage Profile
                    </Button>
                    <Button 
                      className="settings-button"
                      onClick={handleSignOut}
                      style={ { backgroundColor: 'red', color: 'white', border: 'none' } }
                    >
                      Sign Out
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
      <Modal 
        show={showProfileModal}
        onHide={() => setShowProfileModal(false)}
        size="lg"
        centered
        className={darkMode ? 'dark-modal' : ''}
      >
        <Modal.Header closeButton>
          <Modal.Title>Your Profile</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <UserProfile />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowProfileModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default Settings;
