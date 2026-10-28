// Open-Meteo sends wall-clock times ("2026-10-28T15:00") and dates ("2026-10-28") that are already in the
// zone the response asked for, so they're reformatted as text. Parsing them as Date objects would apply the
// server's own time zone, which shifts times in the hour skipped when clocks spring forward.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function parseWallClock(value) {
  const match = WALL_CLOCK.exec(value || '');
  if (!match) return null;
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  return { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute, second: second.padStart(2, '0') };
}

// 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st
function ordinal(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] || 'th'}`;
}

function clockTime({ hour, minute, second }, withSeconds) {
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minute}${withSeconds ? `:${second}` : ''} ${hour < 12 ? 'am' : 'pm'}`;
}

// The formats below match what clients already parse (previously produced by Moment).

/** "October 28th 2026, 3:00:00 pm" */
function formatDateTime(value) {
  const parts = parseWallClock(value);
  return parts ? `${MONTHS[parts.month - 1]} ${ordinal(parts.day)} ${parts.year}, ${clockTime(parts, true)}` : 'Invalid date';
}

/** "October 28th 2026" */
function formatDate(value) {
  const parts = parseWallClock(value);
  return parts ? `${MONTHS[parts.month - 1]} ${ordinal(parts.day)} ${parts.year}` : 'Invalid date';
}

/** "3:00 pm" */
function formatTime(value) {
  const parts = parseWallClock(value);
  return parts ? clockTime(parts, false) : 'Invalid date';
}

module.exports = { formatDate, formatDateTime, formatTime };
