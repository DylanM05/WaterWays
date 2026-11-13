import React, { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { ThemeContext } from './Theme';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
export const SettingsContext = createContext();

export const STATION_TABS = ['water', 'weather', 'history', 'map'];

// The station page had seven tabs; pressure, current weather and both forecasts are now one Weather tab.
const LEGACY_WEATHER_TABS = ['pressure', 'weather', 'hourlyforecast', 'weeklyforecast'];

/** A saved default tab as one of STATION_TABS, so preferences saved before the redesign keep working. */
export const normalizeDefaultTab = (value) => {
  if (LEGACY_WEATHER_TABS.includes(value)) return 'weather';
  return STATION_TABS.includes(value) ? value : 'water';
};

const normalizeUnit = (value) => (value === 'fahrenheit' ? 'fahrenheit' : 'celsius');

const readLocal = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows can refuse storage; the setting still applies until the page is closed.
  }
};

export const SettingsProvider = ({ children }) => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { darkMode, toggleTheme } = useContext(ThemeContext);

  const [settings, setSettings] = useState(() => ({
    temperatureUnit: normalizeUnit(readLocal('temperatureUnit')),
    defaultTab: normalizeDefaultTab(readLocal('defaultTab'))
  }));
  // Read by the theme effect and saveSettings, which shouldn't re-run when these change.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const darkModeRef = useRef(darkMode);
  darkModeRef.current = darkMode;
  // The theme last applied from or sent to the account, so applying the account's theme isn't sent back.
  const syncedTheme = useRef(darkMode);

  const userId = user?.id;

  const postSettings = useCallback(async (values, dark) => {
    const token = await getToken();
    await axios.post(`${API_BASE_URL}/s/${userId}`, {
      settings: {
        temperatureUnit: values.temperatureUnit,
        defaultTab: values.defaultTab,
        theme: dark ? 'dark' : 'light'
      }
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }, [getToken, userId]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const response = await axios.get(`${API_BASE_URL}/s/${userId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const serverSettings = response.data?.settings;
        if (cancelled || !serverSettings) return;

        const next = {
          temperatureUnit: normalizeUnit(serverSettings.temperatureUnit),
          defaultTab: normalizeDefaultTab(serverSettings.defaultTab)
        };
        writeLocal('temperatureUnit', next.temperatureUnit);
        writeLocal('defaultTab', next.defaultTab);
        setSettings(prev => ({ ...prev, ...next }));

        const serverDark = serverSettings.theme === 'dark' ? true : serverSettings.theme === 'light' ? false : null;
        if (serverDark !== null && serverDark !== darkModeRef.current) {
          syncedTheme.current = serverDark;
          toggleTheme();
        }
      } catch (error) {
        // A new account has no settings yet (404); this browser's settings stay in use either way.
        if (error.response?.status !== 404) console.error('Error fetching settings:', error);
      }
    })();
    return () => { cancelled = true; };
  // toggleTheme is a new function on every render of ThemeProvider; this should only run per account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, getToken]);

  // Theme changes from anywhere (the top bar or Settings) are saved to the account.
  useEffect(() => {
    if (syncedTheme.current === darkMode) return;
    syncedTheme.current = darkMode;
    if (!userId) return;
    postSettings(settingsRef.current, darkMode).catch(error => console.error('Error saving theme:', error));
  }, [darkMode, userId, postSettings]);

  /** Changes settings in this session only. */
  const updateSettings = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  /**
   * Changes settings, keeps them in this browser, and saves them to the account when signed in. Resolves to
   * false if the account couldn't be updated.
   */
  const saveSettings = async (newSettings) => {
    const next = { ...settingsRef.current, ...newSettings };
    next.temperatureUnit = normalizeUnit(next.temperatureUnit);
    next.defaultTab = normalizeDefaultTab(next.defaultTab);
    settingsRef.current = next;
    setSettings(next);
    writeLocal('temperatureUnit', next.temperatureUnit);
    writeLocal('defaultTab', next.defaultTab);
    if (!userId) return true;
    try {
      await postSettings(next, darkModeRef.current);
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
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
      updateSettings,
      saveSettings
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
