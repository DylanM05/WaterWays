import { useSettings } from '../contexts/SettingsContext';

export const useFormatters = () => {
  const { settings } = useSettings();
  
  const formatTemperature = (celsius) => {
    if (!celsius && celsius !== 0) return 'N/A';
    
    if (settings.temperatureUnit === 'fahrenheit') {
      return `${((celsius * 9/5) + 32).toFixed(1)}°F`;
    }
    return `${celsius.toFixed(1)}°C`;
  };
  
  const formatDistance = (kilometers) => {
    if (!kilometers && kilometers !== 0) return 'N/A';
    
    if (settings.distanceUnit === 'imperial') {
      const miles = kilometers * 0.621371;
      return `${miles.toFixed(1)} mi`;
    }
    return `${kilometers.toFixed(1)} km`;
  };
  
  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    if (settings.timeFormat === '12h') {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    });
  };
  
  return {
    formatTemperature,
    formatDistance,
    formatTime
  };
};