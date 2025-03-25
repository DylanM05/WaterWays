import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Landing from './pages/landing';
import Canada from './pages/canada';
import RiverSections from './components/riverSections';
import StationDetails from './components/stationDetails';
import './App.css';

function App() {
  const [rivers, setRivers] = useState({});

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="canada" element={<Canada setRivers={setRivers} rivers={rivers} />}>
          <Route path="river/:riverName" element={<RiverSections rivers={rivers} />} />
          <Route path="station-details/:stationId" element={<StationDetails />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;