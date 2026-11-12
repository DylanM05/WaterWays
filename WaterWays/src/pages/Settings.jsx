import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import axios from 'axios';
import { ThemeContext } from '../components/utility/contexts/Theme';
import { useSettings } from '../components/utility/contexts/SettingsContext';
import ProfileModal from '../components/modals/profileModal';
import CancelSubscriptionModal from '../components/modals/CancelSubscriptionModal';
import { SUPPORT_EMAIL } from '../components/utility/contact';
import './styling/settings.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ADMIN_PATH = '/admin/5jN!^2pw&Bi4a0y26M^H';

const formatDate = (value) => (value
  ? new Date(value).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  : null);

const planName = (status) => {
  if (!status?.subscribed) return 'Free';
  if (status.plan === 'lifetime') return 'Premium, lifetime';
  if (status.plan === 'annual' || status.plan === 'yearly') return 'Premium, yearly';
  if (status.plan === 'monthly') return 'Premium, monthly';
  return 'Premium';
};

const Segmented = ({ label, options, value, onChange }) => (
  <div className="seg settings-seg" role="group" aria-label={label}>
    {options.map(([key, text]) => (
      <button key={key} type="button" className={value === key ? 'is-on' : undefined} aria-pressed={value === key} onClick={() => onChange(key)}>
        {text}
      </button>
    ))}
  </div>
);

const Row = ({ label, children }) => (
  <div className="settings-row">
    <span className="settings-row__label">{label}</span>
    <div className="settings-row__control">{children}</div>
  </div>
);

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { darkMode, toggleTheme } = useContext(ThemeContext);
  const { settings, saveSettings } = useSettings();

  const [status, setStatus] = useState(null);
  const [statusFailed, setStatusFailed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const noticeTimer = useRef(null);

  // A short message at the top; success and progress messages clear themselves.
  const tell = useCallback((message, tone = 'info', stay = false) => {
    clearTimeout(noticeTimer.current);
    setNotice({ message, tone });
    if (!stay) noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getToken()}` }), [getToken]);

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/sub/status`, { headers: await authHeaders() });
      setStatus(data);
      setStatusFailed(false);
      return data;
    } catch (error) {
      console.error('Error checking subscription status:', error);
      setStatusFailed(true);
      return null;
    }
  }, [authHeaders]);

  // Status now and every two minutes, so a change made in the billing portal shows up.
  useEffect(() => {
    if (!user) return undefined;
    loadStatus();
    const timer = setInterval(loadStatus, 120000);
    return () => clearInterval(timer);
  }, [user, loadStatus]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API_BASE_URL}/admin/check`, { headers: await authHeaders() });
        if (!cancelled) setIsAdmin(Boolean(data.isAdmin));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authHeaders]);

  // Back from Stripe checkout: ask the server to record the subscription, then wait for it to show as active.
  useEffect(() => {
    if (!user || searchParams.get('subscription') !== 'success' || !searchParams.get('session_id')) return undefined;
    let cancelled = false;
    (async () => {
      tell('Checking your new subscription…', 'info', true);
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        try {
          await axios.get(`${API_BASE_URL}/sub/success`, { headers: await authHeaders() });
          break;
        } catch (error) {
          console.error('Error syncing subscription:', error);
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
        }
      }
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        const data = await loadStatus();
        if (data?.subscribed) {
          tell('Premium is active. Thanks for subscribing.', 'success');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      if (!cancelled) tell('Your subscription hasn’t shown up yet. Refresh this page in a few minutes, or contact support if it doesn’t.', 'warn', true);
    })();
    return () => { cancelled = true; };
  }, [user, searchParams, authHeaders, loadStatus, tell]);

  const save = async (change) => {
    const synced = await saveSettings(change);
    tell(synced ? 'Saved' : 'Saved on this device. Couldn’t update your account; it will try again next time.', synced ? 'success' : 'warn');
  };

  const setTheme = (theme) => {
    if ((theme === 'dark') !== darkMode) toggleTheme();
  };

  const openBillingPortal = async () => {
    try {
      tell('Opening the billing portal…');
      const { data } = await axios.get(`${API_BASE_URL}/sub/billing-portal`, { headers: await authHeaders() });
      window.location.href = data.url;
    } catch (error) {
      console.error('Error opening billing portal:', error);
      // Stripe's error when the portal hasn't been set up in the dashboard.
      const details = String(error.response?.data?.details || '');
      const notSetUp = details.includes('No configuration provided') || details.includes('configuration has not been created');
      tell(notSetUp
        ? `Billing changes aren’t available online yet. Email ${SUPPORT_EMAIL} and we’ll make the change.`
        : 'Couldn’t open the billing portal. Try again in a moment.', 'warn', true);
    }
  };

  const reactivate = async () => {
    try {
      tell('Reactivating your subscription…');
      await axios.post(`${API_BASE_URL}/sub/reactivate`, {}, { headers: await authHeaders() });
      await loadStatus();
      tell('Your subscription will renew as usual.', 'success');
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      tell('Couldn’t reactivate your subscription. Try again in a moment.', 'warn', true);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
      tell('Couldn’t sign out. Try again.', 'warn');
    }
  };

  const recurring = status?.subscribed && status.plan !== 'lifetime';
  const renewal = formatDate(status?.expiresAt);

  return (
    <div className="page settings">
      <h1 className="disp settings__title">Settings</h1>

      {notice && <p className={`settings-notice settings-notice--${notice.tone}`} role="status">{notice.message}</p>}

      <section className="ww-card settings-group" aria-labelledby="settings-account">
        <h2 id="settings-account" className="settings-group__title">Account</h2>
        {user && (
          <div className="settings-user">
            <img src={user.imageUrl} alt="" className="settings-user__avatar" />
            <div>
              <b>{user.fullName || user.primaryEmailAddress?.emailAddress}</b>
              {user.fullName && <span>{user.primaryEmailAddress?.emailAddress}</span>}
            </div>
          </div>
        )}
        <div className="settings-actions">
          <button type="button" className="ww-btn" onClick={() => setShowProfile(true)}>Manage profile</button>
          {isAdmin && <button type="button" className="ww-btn" onClick={() => navigate(ADMIN_PATH)}>Invites</button>}
          <button type="button" className="ww-btn settings-signout" onClick={handleSignOut}>Sign out</button>
        </div>
      </section>

      <section className="ww-card settings-group" aria-labelledby="settings-display">
        <h2 id="settings-display" className="settings-group__title">Display</h2>
        <Row label="Theme">
          <Segmented label="Theme" value={darkMode ? 'dark' : 'light'} onChange={setTheme} options={[['light', 'Light'], ['dark', 'Dark']]} />
        </Row>
        <Row label="Temperature">
          <Segmented label="Temperature" value={settings.temperatureUnit} onChange={(unit) => save({ temperatureUnit: unit })}
            options={[['celsius', '°C'], ['fahrenheit', '°F']]} />
        </Row>
        <Row label="Station opens on">
          <Segmented label="Station opens on" value={settings.defaultTab} onChange={(tab) => save({ defaultTab: tab })}
            options={[['water', 'Water'], ['weather', 'Weather'], ['history', 'History'], ['map', 'Map']]} />
        </Row>
      </section>

      <section className="ww-card settings-group" aria-labelledby="settings-plan">
        <h2 id="settings-plan" className="settings-group__title">Subscription</h2>
        {status ? (
          <>
            <Row label="Plan"><b>{planName(status)}</b></Row>
            {recurring && renewal && (
              <Row label={status.cancelAtPeriodEnd ? 'Ends' : 'Renews'}><span>{renewal}</span></Row>
            )}
            {recurring && status.cancelAtPeriodEnd && (
              <p className="settings-note">Premium stays on until {renewal}. Reactivate to keep it after that.</p>
            )}
            <div className="settings-actions">
              {recurring && <button type="button" className="ww-btn" onClick={openBillingPortal}>Manage payment method</button>}
              {recurring && (status.cancelAtPeriodEnd
                ? <button type="button" className="ww-btn ww-btn--pri" onClick={reactivate}>Reactivate</button>
                : <button type="button" className="ww-btn settings-signout" onClick={() => setShowCancel(true)}>Cancel subscription</button>)}
              {!status.subscribed && <Link to="/pricing" className="ww-btn ww-btn--pri">See Premium</Link>}
            </div>
          </>
        ) : statusFailed ? (
          <div className="settings-actions">
            <span className="muted">Couldn’t load your subscription.</span>
            <button type="button" className="ww-btn" onClick={loadStatus}>Try again</button>
          </div>
        ) : (
          <p className="settings-note">Loading…</p>
        )}
      </section>

      <section className="ww-card settings-group" aria-labelledby="settings-help">
        <h2 id="settings-help" className="settings-group__title">Help</h2>
        <div className="settings-actions">
          <a href={`mailto:${SUPPORT_EMAIL}`} className="ww-btn">Email support</a>
          <a href="https://github.com/DylanM05/WaterWays" target="_blank" rel="noreferrer" className="ww-btn">Source code</a>
          <Link to="/privacy" className="ww-btn">Privacy</Link>
        </div>
      </section>

      <ProfileModal show={showProfile} handleClose={() => setShowProfile(false)} />
      <CancelSubscriptionModal
        show={showCancel}
        handleClose={() => setShowCancel(false)}
        onCancelSuccess={() => {
          loadStatus();
          tell('Your subscription is cancelled. Premium stays on until the end of the period you’ve paid for.', 'info', true);
        }}
      />
    </div>
  );
};

export default Settings;
