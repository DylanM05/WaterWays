import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './components/utility/contexts/Theme';
import Canada from './pages/canada';
import RiverSections from './pages/riverSections';
import StationDetails from './pages/stationDetails';
import Home from './pages/home';
import Settings from './pages/Settings';
import ProtectedRoute from './components/utility/ProtectedRoute';
import Favorites from './pages/Favorites';
import Pricing from './pages/Pricing'; // Import the new Pricing page
import './App.css';
import useTrackUser from './components/utility/useTrackUser';
import AdminInvites from './components/admin/InviteManager';
import RedeemInvite from './pages/RedeemInvite';

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
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/favourites" element={
                <ProtectedRoute requireSubscription={true}>
                  <Favorites />
                </ProtectedRoute>
              } />
              <Route path="/admin/5jN!^2pw&Bi4a0y26M^H" element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminInvites />
                </ProtectedRoute>
              } />
            </Route>
            <Route path="/redeem" element={
              <ProtectedRoute>
                <RedeemInvite />
                </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </div>
    </ThemeProvider>
  );
}

export default App;