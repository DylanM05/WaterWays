import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './components/contexts/Theme';
import Canada from './pages/canada';
import RiverSections from './components/riverSections';
import StationDetails from './components/stationDetails';
import Home from './components/Home';
import Settings from './components/Settings';
import ProtectedRoute from './components/utility/ProtectedRoute'; // Import the new component
import './App.css';
import useTrackUser from './components/utility/useTrackUser';

function App() {
  const [rivers, setRivers] = useState({});

  useTrackUser();

  return (
    <ThemeProvider>
      <div className="App">
        <Router>
          <Routes>
            <Route path="/" element={<Canada setRivers={setRivers} rivers={rivers} />}>
              <Route index element={<Home />} />
              <Route path="/river/:riverName" element={<RiverSections rivers={rivers} />} />
              <Route path="/station-details/:stationId" element={<StationDetails />} />
              <Route path="/profile" element={<div>Profile</div>} />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/favourites" element={
                <ProtectedRoute>
                  <div>Favourites</div>
                </ProtectedRoute>
              } />
            </Route>
          </Routes>
        </Router>
      </div>
    </ThemeProvider>
  );
}

export default App;