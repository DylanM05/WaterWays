import React, { createContext, useContext } from 'react';
import { useLoadScript } from '@react-google-maps/api';

const GoogleMapsContext = createContext(null);

export const GoogleMapsProvider = ({ children }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: "AIzaSyAtn-w2radLEWnApYyOdKAybpRxb2UbVl0",
    libraries: ['places'],
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
};

export const useGoogleMaps = () => useContext(GoogleMapsContext);