import React, { useContext } from 'react';
import { Button } from 'react-bootstrap';
import { ThemeContext } from '../contexts/Theme';

const ThemeToggle = () => {
  const { darkMode, toggleTheme } = useContext(ThemeContext);

  return (
    <Button 
      variant="outline-secondary" 
      onClick={toggleTheme} 
      className="theme-toggle"
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {darkMode ? '☀️' : '🌙'}
    </Button>
  );
};

export default ThemeToggle;