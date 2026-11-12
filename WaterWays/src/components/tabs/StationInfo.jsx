import React from 'react';
import { useParams } from 'react-router-dom';
import { displayTitle, PROVINCE_NAMES } from '../utility/names';
import './styling/stationInfo.css';

// OpenStreetMap's embeddable map: no key or account, and it carries its own attribution. The links open
// the station in the map apps people already use.
const mapLinks = (lat, lng, name) => {
  const latSpan = 0.02;
  const lngSpan = 0.035;
  const bbox = [lng - lngSpan, lat - latSpan, lng + lngSpan, lat + latSpan].map(value => value.toFixed(5)).join(',');
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`,
    apple: `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}`,
    google: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=13/${lat}/${lng}`
  };
};

/** The Map tab: where the station is, with its ID, province and coordinates, and links to map apps. */
const StationInfo = ({ stationInfo, stationId }) => {
  const params = useParams();
  const id = stationId || params.stationId;
  const lat = parseFloat(stationInfo?.latitude);
  const lng = parseFloat(stationInfo?.longitude);
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
  const links = hasLocation ? mapLinks(lat, lng, displayTitle(stationInfo?.stationName || id || 'Station')) : null;
  const province = PROVINCE_NAMES[stationInfo?.province] || stationInfo?.province;

  return (
    <div className="map-tab">
      <div className="ww-card map-tab__map">
        {links ? (
          <iframe
            src={links.embed}
            title="Station location map"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="map-tab__none">This station has no coordinates on record.</div>
        )}
      </div>
      <dl className="ww-card map-tab__facts">
        <div><dt>Station ID</dt><dd className="mono">{id}</dd></div>
        {province && <div><dt>Province</dt><dd>{province}</dd></div>}
        {hasLocation && <div><dt>Coordinates</dt><dd>{lat.toFixed(4)}°, {lng.toFixed(4)}°</dd></div>}
        {links && (
          <div>
            <dt>Open in</dt>
            <dd className="map-tab__links">
              <a href={links.apple} target="_blank" rel="noreferrer">Apple Maps</a>
              <a href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
              <a href={links.osm} target="_blank" rel="noreferrer">OpenStreetMap</a>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
};

export default StationInfo;
