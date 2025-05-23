import React, { createContext, useState, useEffect, useContext } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { ThemeContext } from '../components/contexts/Theme';

const BACKEND_URL = 'http://localhost:42069'; // Change to your production URL in production

export const SettingsContext = createContext();

export const SettingsProvider = ({ children }) => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { darkMode, toggleTheme } = useContext(ThemeContext);
  
  const [settings, setSettings] = useState({
    temperatureUnit: localStorage.getItem('temperatureUnit') || 'celsius',
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
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && response.data.settings) {
        const serverSettings = response.data.settings;
        
        // Update localStorage
        localStorage.setItem('temperatureUnit', serverSettings.temperatureUnit || 'celsius');
        localStorage.setItem('defaultTab', serverSettings.defaultTab || 'water');
        
        // Update context state
        setSettings({
          temperatureUnit: serverSettings.temperatureUnit || 'celsius',
          defaultTab: serverSettings.defaultTab || 'water'
        });
        
        // Update theme if needed - using toggleTheme instead of setDarkMode
        if ((serverSettings.theme === 'dark' && !darkMode) ||
            (serverSettings.theme === 'light' && darkMode)) {
          toggleTheme();
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };
  
  // Add this new function to update settings immediately
  const updateSettings = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };
  
  // Utility function for temperature conversion
  const formatTemperature = (celsius) => {
    if (celsius === undefined || celsius === null) {
      return 'N/A';
    }
    
    if (settings.temperatureUnit === 'fahrenheit') {
      return `${((celsius * 9/5) + 32).toFixed(1)}°F`;
    }
    return `${celsius.toFixed(1)}°C`;
  };
  
  return (
    <SettingsContext.Provider value={{ 
      settings,
      formatTemperature,
      updateSettings // Add the new function to the context
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);