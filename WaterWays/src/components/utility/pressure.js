export const HOUR_MS = 60 * 60 * 1000;

// Steady under 0.5 hPa in three hours; 3 hPa or more is a rapid change.
export const pressureTendency = (change) => {
  if (Math.abs(change) < 0.5) return 'Steady';
  return `${Math.abs(change) >= 3 ? 'Rapidly ' : ''}${change > 0 ? 'rising' : 'falling'}`.replace(/^./, letter => letter.toUpperCase());
};

/**
 * Sea-level pressure now from hourly figures ({ time: ms, msl }): the hour nearest now, the change over the
 * last 3 hours, and the last 24 hours' high and low. Null when no hour is within an hour of now.
 */
export const pressureNow = (hours, now = Date.now()) => {
  const nearest = (time) => hours.reduce((best, hour) =>
    (!best || Math.abs(hour.time - time) < Math.abs(best.time - time) ? hour : best), null);
  const current = nearest(now);
  if (!current || Math.abs(current.time - now) > HOUR_MS || current.msl === null) return null;
  const earlier = nearest(current.time - 3 * HOUR_MS);
  const change3h = earlier && earlier.msl !== null && Math.abs(earlier.time - (current.time - 3 * HOUR_MS)) <= HOUR_MS
    ? current.msl - earlier.msl
    : null;
  const lastDay = hours.filter(hour => hour.time >= now - 24 * HOUR_MS && hour.time <= now && hour.msl !== null).map(hour => hour.msl);
  return {
    current,
    change3h,
    dayMax: lastDay.length ? Math.max(...lastDay) : null,
    dayMin: lastDay.length ? Math.min(...lastDay) : null
  };
};
