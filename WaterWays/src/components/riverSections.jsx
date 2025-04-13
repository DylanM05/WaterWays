import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

const RiverSections = ({ rivers }) => {
  const { riverName } = useParams();
  const [sections, setSections] = useState([]);
  const [latestWaterData, setLatestWaterData] = useState({});
  const isMounted = useRef(true);

  useEffect(() => {
    if (rivers && rivers[riverName]) {
      setSections(rivers[riverName]);
    } else {
      setSections([]);
    }
  }, [rivers, riverName]);

  useEffect(() => {
    isMounted.current = true;

    const fetchLatestWaterData = async () => {
      if (sections.length === 0) return;

      try {
        const dataPromises = sections.map(async (section) => {
          try {
            const response = await axios.get(
              `https://backend.dylansserver.top/details/latest-water-data/${section.station_id}`
            );
            const dateTime = new Date(response.data.date_time);
            const formattedTime = dateTime.toLocaleString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              hour12: true,
            });
            return { stationId: section.station_id, data: response.data, time: formattedTime };
          } catch (error) {
            console.error(
              `Error fetching latest water data for station ${section.station_id}:`,
              error
            );
            return { stationId: section.station_id, data: null, time: null };
          }
        });

        const data = await Promise.all(dataPromises);
        const dataMap = data.reduce((acc, item) => {
          acc[item.stationId] = item;
          return acc;
        }, {});

        if (isMounted.current) {
          setLatestWaterData(dataMap);
        }
      } catch (error) {
        console.error('Error fetching water data:', error);
      }
    };

    fetchLatestWaterData();

    return () => {
      isMounted.current = false;
    };
  }, [sections]);

  if (!sections.length) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-6" style={{ color: 'var(--primary-colour)' }}>{riverName}</h1>
        <p className="text-center" style={{ color: 'var(--text-colour)', opacity: '0.7' }}>Loading sections or no data available.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-6" style={{ color: 'var(--primary-colour)' }}>{riverName}</h1>
      <div className="space-y-6">
        {sections.map((section, index) => (
          <Link 
            key={index} 
            to={`/canada/station-details/${section.station_id}`} 
            className="block"
            style={{ textDecoration: 'none' }}
          >
            <div className="bg-background-card rounded-lg shadow-md border border-border p-6 transition-all hover:-translate-y-1 hover:shadow-lg">
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-colour)' }}>{section.section}</h2>
              <p className="mb-2" style={{ color: 'var(--primary-colour)' }}>
                <span className="font-bold">Station ID:</span> {section.station_id}
              </p>
              
              {latestWaterData[section.station_id] && latestWaterData[section.station_id].data && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {latestWaterData[section.station_id].data.water_level !== undefined &&
                    latestWaterData[section.station_id].data.water_level !== null && (
                      <div className="bg-bg rounded-md p-4 text-center">
                        <div className="text-xl font-bold" style={{ color: 'var(--text-colour)' }}>
                          Water Level
                          <br />
                          {latestWaterData[section.station_id].data.water_level.toFixed(2)} m
                        </div>
                      </div>
                    )}
                  
                  {latestWaterData[section.station_id].data.discharge !== undefined &&
                    latestWaterData[section.station_id].data.discharge !== null && (
                      <div className="bg-bg rounded-md p-4 text-center">
                        <div className="text-xl font-bold" style={{ color: 'var(--text-colour)' }}>
                          Discharge
                          <br />
                          {latestWaterData[section.station_id].data.discharge.toFixed(2)} m³/s
                        </div>
                      </div>
                    )}
                  
                  {latestWaterData[section.station_id].time &&
                    latestWaterData[section.station_id].time !== "Invalid Date" && (
                      <div className="col-span-1 md:col-span-2 mt-2 text-sm" style={{ color: 'var(--text-colour)', opacity: '0.7' }}>
                        <span className="font-bold">Last updated:</span> {latestWaterData[section.station_id].time}
                      </div>
                    )}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default RiverSections;