import moment from 'moment';
import { useSettings } from './contexts/SettingsContext';


export const convertToLocalTime = (timeString) => {
  const utcTime = moment.utc(timeString, 'MMMM Do YYYY, h:mm:ss a');
  return utcTime.local().format('MMMM Do YYYY, h:mm:ss a') + ' (Local Time)';
};

export const convertTimeArrayToLocal = (timeArray) => {
  return timeArray.map(timeString => {
    const utcTime = moment.utc(timeString, 'MMMM Do YYYY, h:mm:ss a');
    return utcTime.local().format('MMMM Do YYYY, h:mm:ss a');
  });
};

export const formatLocalTime = (timestamp) => {
  const { settings } = useSettings();
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