// Parsing and formatting for the date formats the API sends and the site shows.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const LONG_DATE_TIME = /^([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th) (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (am|pm)$/;

const pad = (number) => String(number).padStart(2, '0');

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st
const ordinal = (day) => {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] || 'th'}`;
};

/**
 * Parses the API's display format, "October 28th 2026, 3:00:00 pm", as UTC or as browser-local time.
 * Returns null when the text isn't in that format.
 */
export function parseLongDateTime(value, { utc = false } = {}) {
  const match = LONG_DATE_TIME.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, monthName, day, year, hour, minute, second, meridiem] = match;
  const month = MONTHS.indexOf(monthName);
  if (month < 0) return null;
  const parts = [Number(year), month, Number(day), (Number(hour) % 12) + (meridiem === 'pm' ? 12 : 0), Number(minute), Number(second)];
  return utc ? new Date(Date.UTC(...parts)) : new Date(...parts);
}

/** Parses the API's "2026-10-28 15:05:00" timestamps, which are UTC. */
export const parseUtcTimestamp = (value) => new Date(`${String(value).replace(' ', 'T')}Z`);

/** "October 28th 2026, 3:05:00 pm" in the browser's time zone; `seconds: false` gives "3:05 pm". */
export function formatLongDateTime(date, { seconds = true } = {}) {
  const hours = date.getHours();
  const time = `${hours % 12 || 12}:${pad(date.getMinutes())}${seconds ? `:${pad(date.getSeconds())}` : ''} ${hours < 12 ? 'am' : 'pm'}`;
  return `${MONTHS[date.getMonth()]} ${ordinal(date.getDate())} ${date.getFullYear()}, ${time}`;
}

/** Chart axis label, "10/28 15:05". */
export const formatTickDateTime = (date) =>
  `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** Chart axis label, "Oct 28". */
export const formatTickDate = (date) => `${MONTHS[date.getMonth()].slice(0, 3)} ${pad(date.getDate())}`;

/** Today's date as "2026-10-28" in the browser's time zone. */
export const localDateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** "Wednesday" for a "2026-10-28" date. */
export const weekdayName = (dateKey) => new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
