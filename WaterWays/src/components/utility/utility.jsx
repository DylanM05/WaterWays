import { formatLongDateTime, parseLongDateTime } from './dates';


// Converts the API's UTC display times ("October 28th 2026, 3:00:00 pm") to the browser's time zone.
const utcToLocal = (timeString) => {
  const time = parseLongDateTime(timeString, { utc: true });
  return time ? formatLongDateTime(time) : timeString;
};

export const convertToLocalTime = (timeString) => `${utcToLocal(timeString)} (Local Time)`;

export const convertTimeArrayToLocal = (timeArray) => timeArray.map(utcToLocal);
