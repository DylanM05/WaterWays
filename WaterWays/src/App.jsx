import React, { lazy, Suspense, useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import Home from './pages/home';
import ProtectedRoute from './components/utility/ProtectedRoute';
import Spinner from './components/spinners/Spinner';
import useTrackUser from './components/utility/useTrackUser';

// Loaded on first visit so the home page doesn't download the charts, settings and admin code.
const Province = lazy(() => import('./pages/Province'));
const RiverSections = lazy(() => import('./pages/riverSections'));
const StationDetails = lazy(() => import('./pages/stationDetails'));
const Settings = lazy(() => import('./pages/Settings'));
const Favorites = lazy(() => import('./pages/Favorites'));
const Pricing = lazy(() => import('./pages/Pricing'));
const AdminInvites = lazy(() => import('./components/admin/InviteManager'));
const RedeemInvite = lazy(() => import('./pages/RedeemInvite'));
const Privacy = lazy(() => import('./pages/Privacy'));

// Suspends only the page area, so the top bar stays on screen while a page loads.
const page = (element) => <Suspense fallback={<Spinner />}>{element}</Suspense>;

function App() {
  // The last province's rivers, kept so a river opened from its province page needn't be looked up again.
  const [rivers, setRivers] = useState({});

  useTrackUser();

  // The theme comes from the ThemeProvider in main.jsx, which SettingsProvider also reads, so theme changes
  // here are saved to the account.
  return (
    <div className="App">
      <Router>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="/province/:code" element={page(<Province setRivers={setRivers} />)} />
            <Route path="/river/:riverName" element={page(<RiverSections rivers={rivers} />)} />
            <Route path="/station-details/:stationId" element={page(<StationDetails />)} />
            <Route path="/pricing" element={page(<Pricing />)} />
            <Route path="/privacy" element={page(<Privacy />)} />
            <Route path="/settings" element={page(
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            )} />
            <Route path="/favourites" element={page(
              <ProtectedRoute requireSubscription={true}>
                <Favorites />
              </ProtectedRoute>
            )} />
            <Route path="/admin/5jN!^2pw&Bi4a0y26M^H" element={page(
              <ProtectedRoute requireAdmin={true}>
                <AdminInvites />
              </ProtectedRoute>
            )} />
          </Route>
          <Route path="/redeem" element={page(
            <ProtectedRoute>
              <RedeemInvite />
              </ProtectedRoute>
          )} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;