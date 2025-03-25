import moment from 'moment';

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