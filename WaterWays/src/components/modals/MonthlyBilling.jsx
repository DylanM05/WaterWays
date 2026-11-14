import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { XIcon } from '../icons/Icons';
import './styling/billingModal.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/* const API_BASE_URL = 'https://curious-caring-adder.ngrok-free.app'; */

// Confirms the plan, then sends the person to Stripe's checkout for it. `endpoint` is /sub/cmcs or /sub/cacs.
export const CheckoutModal = ({ show, handleClose, endpoint, title, price }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { getToken } = useAuth();

  const handleSubscribe = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      const response = await axios.post(
        `${API_BASE_URL}${endpoint}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      window.location.href = response.data.url;

    } catch (err) {
      console.error('Error initiating checkout:', err);
      // The server refuses a second subscription and says where to manage the current one.
      const alreadySubscribed = err.response?.status === 409 && err.response.data?.code === 'already_subscribed';
      setError(alreadySubscribed && err.response.data.error
        ? err.response.data.error
        : 'Couldn’t start checkout. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      contentClassName="ww-modal"
      backdropClassName="ww-modal-backdrop"
      aria-labelledby="checkout-title"
    >
      <button type="button" className="ww-btn ww-btn--ghost ww-btn--icon ww-modal__close" onClick={handleClose} aria-label="Close">
        <XIcon />
      </button>
      <h2 className="disp ww-modal__title" id="checkout-title">{title}</h2>
      <p className="ww-modal__text">{price}. You’ll pay on Stripe.</p>

      {error && <p className="ww-modal__error" role="alert">{error}</p>}

      <div className="ww-modal__actions">
        <button type="button" className="ww-btn ww-btn--ghost" onClick={handleClose}>Not now</button>
        <button type="button" className="ww-btn ww-btn--pri" onClick={handleSubscribe} disabled={loading}>
          {loading ? <><span className="ww-modal__spinner" aria-hidden="true" />Opening checkout…</> : 'Continue to checkout'}
        </button>
      </div>
    </Modal>
  );
};

const MonthlyBilling = ({ show, handleClose }) => (
  <CheckoutModal show={show} handleClose={handleClose} endpoint="/sub/cmcs" title="Premium, monthly" price="$4 a month" />
);

export default MonthlyBilling;
