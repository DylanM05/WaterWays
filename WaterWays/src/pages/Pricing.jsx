import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useClerk, useUser } from '@clerk/clerk-react';
import axios from 'axios';
import MonthlyModal from '../components/modals/MonthlyBilling';
import AnnualModal from '../components/modals/AnnualBilling';
import CancelSubscriptionModal from '../components/modals/CancelSubscriptionModal';
import { CheckIcon } from '../components/icons/Icons';
import { displayTitle } from '../components/utility/names';
import './styling/pricing.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// The Stripe prices behind /sub/cmcs and /sub/cacs.
const MONTHLY = 4;
const YEARLY = 30;
const SAVING = Math.floor((1 - YEARLY / (MONTHLY * 12)) * 100);
const money = (amount) => (Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`);

const FREE_FEATURES = ['Live levels and flows', '30-day charts', 'Weather and forecasts', 'Weather alerts'];
const PREMIUM_FEATURES = ['Everything in Free', 'Archived history', 'Typical-year comparisons', 'Record highs and lows', 'Saved rivers and stations'];

const formatDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

const Features = ({ items }) => (
  <ul className="plan__list">
    {items.map(item => <li key={item}><CheckIcon />{item}</li>)}
  </ul>
);

// A drawing of the typical-year chart, not data: monthly shapes for a snow-fed river, with this year's
// line stopping at today's date.
const BAND_HIGH = [34, 32, 38, 58, 120, 168, 150, 104, 70, 56, 48, 40];
const BAND_LOW = [10, 9, 11, 18, 44, 70, 60, 38, 24, 18, 14, 12];
const TYPICAL = [20, 18, 22, 34, 80, 118, 100, 66, 42, 32, 27, 23];
const THIS_YEAR = [22, 20, 26, 44, 98, 130, 96, 58, 36, 30, 29, 26];
const CHART_W = 460;
const CHART_H = 200;
const PAD = 10;

const point = (value, index) => [PAD + (CHART_W - PAD * 2) * index / 11, CHART_H - PAD - (CHART_H - PAD * 2) * value / 175];

const smooth = (points) => points.reduce((d, [x, y], i) => {
  if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
  const [px, py] = points[i - 1];
  const mx = (px + x) / 2;
  return `${d}C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
}, '');

const TypicalYearSketch = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const position = Math.max(0, Math.min(11, ((now - start) / 86400000 / 365) * 12 - 0.5));
  const whole = Math.max(0, Math.floor(position));
  const yearPoints = THIS_YEAR.slice(0, whole + 1).map(point);
  if (position > whole) {
    const t = position - whole;
    const value = THIS_YEAR[whole] + (THIS_YEAR[whole + 1] - THIS_YEAR[whole]) * t;
    yearPoints.push(point(value, position));
  }
  const high = BAND_HIGH.map(point);
  const low = BAND_LOW.map(point).reverse();
  const end = yearPoints[yearPoints.length - 1];

  return (
    <svg className="sketch" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label="Illustration of a typical-year chart: this year's flow drawn over the typical year and the range on record">
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={PAD} x2={CHART_W - PAD} y1={PAD + (CHART_H - PAD * 2) * f} y2={PAD + (CHART_H - PAD * 2) * f} className="sketch__grid" />
      ))}
      <line x1={PAD} x2={CHART_W - PAD} y1={CHART_H - PAD} y2={CHART_H - PAD} className="sketch__base" />
      <path d={`${smooth(high)}L${smooth(low).slice(1)}Z`} className="sketch__band" />
      <path d={smooth(TYPICAL.map(point))} className="sketch__typical" />
      <path d={smooth(yearPoints)} className="sketch__year" />
      <circle cx={end[0]} cy={end[1]} r="9" className="sketch__halo" />
      <circle cx={end[0]} cy={end[1]} r="4.5" className="sketch__dot" />
    </svg>
  );
};

const Pricing = () => {
  const [searchParams] = useSearchParams();
  const stationId = searchParams.get('station');
  const { isSignedIn } = useUser();
  const { openSignIn } = useClerk();
  const { getToken } = useAuth();
  const [period, setPeriod] = useState('yearly');
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [showAnnualModal, setShowAnnualModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [stationName, setStationName] = useState('');
  const [status, setStatus] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStationName('');
    if (!stationId) return undefined;
    let cancelled = false;
    axios.get(`${API_BASE_URL}/details/coordinates/${encodeURIComponent(stationId)}`)
      .then(({ data }) => { if (!cancelled && data?.stationName) setStationName(displayTitle(data.stationName)); })
      .catch(error => console.error('Error loading station name:', error));
    return () => { cancelled = true; };
  }, [stationId]);

  const checkSubscription = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await axios.get(`${API_BASE_URL}/sub/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStatus(response.data);
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  }, [getToken]);

  useEffect(() => {
    if (isSignedIn) checkSubscription();
    else setStatus(null);
  }, [isSignedIn, checkSubscription]);

  const handleSubscribe = () => {
    if (!isSignedIn) {
      openSignIn();
      return;
    }
    if (period === 'yearly') setShowAnnualModal(true);
    else setShowMonthlyModal(true);
  };

  const handleCancellationSuccess = () => {
    checkSubscription();
    setNotice({ type: 'info', text: 'Premium is cancelled. You’ll keep it until the end of this billing period.' });
  };

  const handleReactivate = async () => {
    try {
      setBusy(true);
      setNotice(null);
      const token = await getToken();
      await axios.post(
        `${API_BASE_URL}/sub/reactivate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await checkSubscription();
      setNotice({ type: 'info', text: 'Premium will renew as before.' });
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      setNotice({ type: 'error', text: 'Couldn’t reactivate Premium. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      setBusy(true);
      setNotice(null);
      const token = await getToken();
      const response = await axios.get(`${API_BASE_URL}/sub/billing-portal`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success && response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error opening billing portal:', error);
      const details = error.response?.data?.details || '';
      if (details.includes('No configuration provided') || details.includes('configuration has not been created')) {
        setNotice({ type: 'error', text: 'Billing changes aren’t available here yet. Please contact support.' });
      } else {
        setNotice({ type: 'error', text: 'Couldn’t open billing. Please try again later.' });
      }
      setBusy(false);
    }
  };

  const subscribed = Boolean(status?.subscribed);
  const lifetime = status?.plan === 'lifetime';
  const apple = status?.source === 'apple';
  const yearly = period === 'yearly';

  let renewal = null;
  if (subscribed && lifetime) renewal = 'Lifetime access';
  else if (subscribed && status.expiresAt) {
    renewal = status.cancelAtPeriodEnd ? `Ends on ${formatDate(status.expiresAt)}` : `Renews on ${formatDate(status.expiresAt)}`;
  }

  return (
    <div className="page pricing">
      <header className="pricing__head">
        <h1 className="disp pricing__title">Every year on record, for every station.</h1>
        {!subscribed && (
          <div className="pricing__period" role="radiogroup" aria-label="Billing period">
            <button type="button" role="radio" aria-checked={!yearly} className={yearly ? '' : 'is-on'} onClick={() => setPeriod('monthly')}>
              {money(MONTHLY)} monthly
            </button>
            <button type="button" role="radio" aria-checked={yearly} className={yearly ? 'is-on' : ''} onClick={() => setPeriod('yearly')}>
              {money(YEARLY)} yearly <span className="pricing__badge">Save {SAVING}%</span>
            </button>
          </div>
        )}
      </header>

      <div className="pricing__grid">
        <section className="ww-card plan plan--free" aria-labelledby="plan-free">
          <h2 className="disp plan__name" id="plan-free">Free</h2>
          <div className="plan__price"><span className="num">$0</span></div>
          <Features items={FREE_FEATURES} />
          {isSignedIn && !subscribed && <button type="button" className="ww-btn plan__cta" disabled>Current plan</button>}
        </section>

        <section className="ww-card plan plan--pro" aria-labelledby="plan-pro">
          <h2 className="disp plan__name" id="plan-pro">Premium</h2>
          {subscribed ? (
            renewal && <p className="plan__state">{renewal}</p>
          ) : (
            <div>
              <div className="plan__price">
                <span className="num">{money(yearly ? YEARLY : MONTHLY)}</span>
                <span className="muted">{yearly ? '/ year' : '/ month'}</span>
              </div>
              {yearly && <div className="plan__per muted">{money(YEARLY / 12)} a month</div>}
            </div>
          )}
          <Features items={PREMIUM_FEATURES} />

          {notice && <p className={`plan__notice plan__notice--${notice.type}`} role="status">{notice.text}</p>}

          {!subscribed ? (
            <button type="button" className="ww-btn ww-btn--pri plan__cta plan__cta--big" onClick={handleSubscribe}>Start Premium</button>
          ) : (
            <div className="plan__actions">
              <button type="button" className="ww-btn plan__cta" disabled>Current plan</button>
              {!lifetime && (apple ? (
                <p className="plan__note">Manage or cancel it in your Apple account settings.</p>
              ) : (
                <div className="plan__manage">
                  <button type="button" className="ww-btn ww-btn--soft" onClick={handleOpenBillingPortal} disabled={busy}>Manage billing</button>
                  {status.cancelAtPeriodEnd ? (
                    <button type="button" className="ww-btn" onClick={handleReactivate} disabled={busy}>Reactivate</button>
                  ) : (
                    <button type="button" className="ww-btn ww-btn--ghost" onClick={() => setShowCancelModal(true)} disabled={busy}>Cancel Premium</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ww-card pricing__preview" aria-label={stationName ? `Typical year at ${stationName}` : 'Typical year'}>
          {stationName && (
            <div className="pricing__station">
              <h2 className="disp">{stationName}</h2>
              <span className="mono faint">{stationId.toUpperCase()}</span>
            </div>
          )}
          <TypicalYearSketch />
          <div className="pricing__legend">
            <span><i className="is-year" />This year</span>
            <span><i className="is-typical" />Typical</span>
            <span><i className="is-range" />Range on record</span>
          </div>
        </section>
      </div>

      <MonthlyModal show={showMonthlyModal} handleClose={() => setShowMonthlyModal(false)} />
      <AnnualModal show={showAnnualModal} handleClose={() => setShowAnnualModal(false)} />
      <CancelSubscriptionModal
        show={showCancelModal}
        handleClose={() => setShowCancelModal(false)}
        onCancelSuccess={handleCancellationSuccess}
      />
    </div>
  );
};

export default Pricing;
