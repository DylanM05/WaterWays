import React, { useContext } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, useUser } from '@clerk/clerk-react';
import RiverSearch from '../riverSearch/RiverSearch';
import { ThemeContext } from '../utility/contexts/Theme';
import { HeartFilledIcon, HeartIcon, Logo, MoonIcon, SunIcon, UserIcon, WavesIcon } from '../icons/Icons';
import './appShell.css';

// Explore covers browsing: provinces, rivers and stations.
const EXPLORE_PATHS = ['/province', '/river', '/station-details'];
const isExplore = (pathname) => pathname === '/' || EXPLORE_PATHS.some(path => pathname.startsWith(path));

const initials = (user) => {
  const fromName = [user?.firstName, user?.lastName].filter(Boolean).map(part => part[0]).join('');
  return (fromName || user?.primaryEmailAddress?.emailAddress?.[0] || '?').toUpperCase();
};

const Avatar = () => {
  const { user } = useUser();
  return (
    <Link to="/settings" className="topbar__avatar" aria-label="Account and settings" title="Account and settings">
      {user?.hasImage ? <img src={user.imageUrl} alt="" /> : initials(user)}
    </Link>
  );
};

const ThemeButton = () => {
  const { darkMode, toggleTheme } = useContext(ThemeContext);
  return (
    <button type="button" className="topbar__icon" onClick={toggleTheme} aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
      {darkMode ? <SunIcon /> : <MoonIcon />}
    </button>
  );
};

const Footer = () => (
  <footer className="site-foot">
    <p>
      Water data and weather alerts from Environment and Climate Change Canada, under the{' '}
      <a href="https://open.canada.ca/en/open-government-licence-canada" target="_blank" rel="noreferrer">Open Government Licence – Canada</a>.
      Weather by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0).
    </p>
    <nav aria-label="Footer">
      <Link to="/pricing">Premium</Link>
      <Link to="/privacy">Privacy</Link>
    </nav>
  </footer>
);

/** The page frame: top bar, the page, footer, and a tab bar along the bottom on phones. */
const AppShell = () => {
  const { pathname } = useLocation();
  const explore = isExplore(pathname);
  const saved = pathname.startsWith('/favourites');
  // The home page has its own, larger river search.
  const showSearch = pathname !== '/';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__in">
          <Link to="/" className="brand"><Logo className="brand__mark" />WaterWays</Link>
          <nav className="topbar__nav" aria-label="Main">
            <Link to="/" className={explore ? 'is-on' : undefined} aria-current={explore ? 'page' : undefined}>Explore</Link>
            <NavLink to="/favourites" className={({ isActive }) => (isActive ? 'is-on' : undefined)}>Saved</NavLink>
            <NavLink to="/pricing" className={({ isActive }) => (isActive ? 'is-on' : undefined)}>Premium</NavLink>
          </nav>
          <div className="topbar__end">
            {showSearch && <RiverSearch size="sm" ends="round" placeholder="Search" className="topbar__search" />}
            <ThemeButton />
            <SignedIn><Avatar /></SignedIn>
            <SignedOut>
              <SignInButton mode="modal">
                <button type="button" className="ww-btn topbar__signin">Sign in</button>
              </SignInButton>
            </SignedOut>
          </div>
        </div>
      </header>

      <main className="shell__main">
        <Outlet />
      </main>

      <Footer />

      <nav className="tabbar" aria-label="Main">
        <Link to="/" className={explore ? 'is-on' : undefined}><WavesIcon />Explore</Link>
        <Link to="/favourites" className={saved ? 'is-on' : undefined}>{saved ? <HeartFilledIcon /> : <HeartIcon />}Saved</Link>
        <SignedIn>
          <Link to="/settings" className={pathname.startsWith('/settings') ? 'is-on' : undefined}><UserIcon />Account</Link>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <button type="button"><UserIcon />Sign in</button>
          </SignInButton>
        </SignedOut>
      </nav>
    </div>
  );
};

export default AppShell;
