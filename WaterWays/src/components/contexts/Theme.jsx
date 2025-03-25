import React, { createContext, useState, useEffect } from 'react';

// Create the context with default values to avoid the "undefined" error
export const ThemeContext = createContext({
  darkMode: false,
  toggleTheme: () => {}
});

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    // Check localStorage or system preference
    const savedMode = localStorage.getItem('darkMode');
    return savedMode !== null 
      ? JSON.parse(savedMode) 
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Apply theme class to body
    document.body.classList.toggle('dark-theme', darkMode);
    document.body.classList.toggle('light-theme', !darkMode);
    // Save preference
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const toggleTheme = () => setDarkMode(!darkMode);

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};