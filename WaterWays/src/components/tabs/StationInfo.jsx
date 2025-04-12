import React, { useState, useEffect } from 'react';
import { Card } from 'react-bootstrap';
import { GoogleMap, LoadScript } from '@react-google-maps/api';
import { MarkerF as AdvancedMarker } from '@react-google-maps/api';


const provinceMapping = {
  'MB': 'Manitoba',
  'ON': 'Ontario',
  'QC': 'Quebec',
  'BC': 'British Columbia',
  'AB': 'Alberta',
  'SK': 'Saskatchewan',
  'NS': 'Nova Scotia',
  'NB': 'New Brunswick',
  'NL': 'Newfoundland and Labrador',
  'PE': 'Prince Edward Island',
  'NT': 'Northwest Territories',
  'YT': 'Yukon',
  'NU': 'Nunavut'
};

const containerStyle = {
  width: '400px',
  height: '400px'
};

const StationInfo = ({ stationInfo, stationId }) => {
  const [coordinates, setCoordinates] = useState(null);
  const [mapUrl, setMapUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (stationInfo?.latitude && stationInfo?.longitude) {
      setCoordinates({
        latitude: stationInfo.latitude,
        longitude: stationInfo.longitude
      });
      
      setIsLoading(true);
      fetch(`https://backend.dylansserver.top/api/proxy-maps/${stationInfo.latitude}/${stationInfo.longitude}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.mapUrl) {
            setMapUrl(data.mapUrl);
          } else {
            console.error('Invalid response format from map proxy');
          }
          setIsLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch map URL:', err);
          setIsLoading(false);
        });
    }
  }, [stationInfo?.latitude, stationInfo?.longitude]);
  
  
  return (
    <Card className="mb-3">
      <Card.Body className="d-flex flex-column align-items-center">
        <h5>Province: {provinceMapping[stationInfo?.province]}</h5>
        <div style={{borderRadius: "10px", overflow: "hidden"}}>
        {coordinates && mapUrl ? (
        <iframe
          src={mapUrl} 
          allowFullScreen
          referrerPolicy="no-referrer"
          style={{ width: '100%', height: '500px', border: 'none' }}
        />           
        ) : (
          <div className="d-flex align-items-center justify-content-center bg-light rounded" 
               style={{ height: '250px', minHeight: '200px' }}>
            <p className="text-muted">{!coordinates ? "Location data unavailable" : "Loading map..."}</p>
          </div>
        )}
        </div>
      </Card.Body>
    </Card>
  );
};

export default StationInfo;
