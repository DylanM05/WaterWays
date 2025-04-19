import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './components/contexts/Theme';
import Canada from './pages/canada';
import RiverSections from './components/riverSections';
import StationDetails from './components/stationDetails';
import Home from './components/home';
import './App.css';
import useTrackUser from './components/utility/useTrackUser';

function App() {
  const [rivers, setRivers] = useState({});

  useTrackUser();

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Canada setRivers={setRivers} rivers={rivers} />}>
            <Route index element={<Home />} />
            <Route path="river/:riverName" element={<RiverSections rivers={rivers} />} />
            <Route path="station-details/:stationId" element={<StationDetails />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;