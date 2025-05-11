import React, { createContext, useState, useEffect, useContext } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { ThemeContext } from './Theme';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; 
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
      const response = await axios.get(`${API_BASE_URL}/s/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data && response.data.settings) {
        const serverSettings = response.data.settings;
        localStorage.setItem('temperatureUnit', serverSettings.temperatureUnit || 'celsius');
        localStorage.setItem('defaultTab', serverSettings.defaultTab || 'water');
        
        setSettings({
          temperatureUnit: serverSettings.temperatureUnit || 'celsius',
          defaultTab: serverSettings.defaultTab || 'water'
        });
        
        if ((serverSettings.theme === 'dark' && !darkMode) ||
            (serverSettings.theme === 'light' && darkMode)) {
          toggleTheme();
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };
  
  const updateSettings = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };
  
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
      updateSettings 
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);