import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon, WarnIcon } from '../icons/Icons';

const clock = (date) => date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: date.getMinutes() ? '2-digit' : undefined });

// "5 a.m." today, "tomorrow 5 a.m.", "Thursday 5 a.m." this week, then "Nov 20".
function until(ms) {
  if (ms === null) return null;
  const date = new Date(ms);
  const today = new Date();
  const days = Math.round((new Date(date).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return clock(date);
  if (days === 1) return `tomorrow ${clock(date)}`;
  if (days < 7) return `${date.toLocaleDateString('en-CA', { weekday: 'long' })} ${clock(date)}`;
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function areaList(areas) {
  if (areas.length === 0) return null;
  if (areas.length <= 2) return areas.join(' and ');
  return `${areas.slice(0, 2).join(', ')} and ${areas.length - 2} more ${areas.length === 3 ? 'area' : 'areas'}`;
}

/** One banner per kind of weather alert along the river, linking to a station it covers. */
const RiverAlerts = ({ alerts, preferredIds }) => {
  if (!alerts.length) return null;
  return (
    <div className="river-alerts">
      {alerts.map(alert => {
        const areas = areaList(alert.areas);
        const ends = until(alert.ends);
        // A station that's reporting makes a better page to land on.
        const stationId = alert.stationIds.find(id => preferredIds.has(id)) || alert.stationIds[0];
        return (
          <div key={alert.key} className="ww-alert river-alert">
            <span className="river-alert__icon"><WarnIcon /></span>
            <p className="river-alert__text">
              <b>{alert.title}</b>
              {areas && <> for {areas}</>}
              {ends && <> until {ends}</>}
            </p>
            <Link to={`/station-details/${stationId}`} className="river-alert__go" aria-label={`${alert.title} details`}>
              <span>Details</span><ChevronRightIcon />
            </Link>
          </div>
        );
      })}
    </div>
  );
};

export default RiverAlerts;
