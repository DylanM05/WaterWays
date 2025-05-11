import React, { useContext } from 'react';
import { ThemeContext } from '../utility/contexts/Theme';

const ThemeToggle = () => {
  const { darkMode, toggleTheme } = useContext(ThemeContext);

  return (
    <button 
      onClick={toggleTheme} 
      style={{
        padding: '8px',
        borderRadius: '6px',
        backgroundColor: 'var(--card-bg-colour)',
        color: 'var(--primary-text-colour)',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background-color 0.2s'
      }}
      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--hover-colour)'}
      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--card-bg-colour)'}
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {darkMode ? (
        <span>☀️</span>
      ) : (
        <span>🌙</span>
      )}
    </button>
  );
};

export default ThemeToggle;