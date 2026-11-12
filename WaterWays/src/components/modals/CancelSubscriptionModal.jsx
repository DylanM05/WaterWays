import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import { XIcon } from '../icons/Icons';
import './styling/billingModal.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const CancelSubscriptionModal = ({ show, handleClose, onCancelSuccess }) => {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { getToken } = useAuth();

  const handleCancel = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      const response = await axios.post(
        `${API_BASE_URL}/sub/cancel`,
        { reason }, // Include cancellation reason for analytics
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      setLoading(false);

      if (response.data.success) {
        handleClose();
        if (onCancelSuccess) {
          onCancelSuccess(response.data);
        }
      } else {
        setError('Couldn’t cancel Premium. Please try again.');
      }
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      setError('Couldn’t cancel Premium. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      backdrop="static"
      contentClassName="ww-modal"
      backdropClassName="ww-modal-backdrop"
      aria-labelledby="cancel-title"
    >
      <button type="button" className="ww-btn ww-btn--ghost ww-btn--icon ww-modal__close" onClick={handleClose} aria-label="Close">
        <XIcon />
      </button>
      <h2 className="disp ww-modal__title" id="cancel-title">Cancel Premium?</h2>
      <p className="ww-modal__text">You’ll keep Premium until the end of this billing period.</p>

      <label className="ww-modal__field">
        <span>Reason (optional)</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Choose a reason</option>
          <option value="too_expensive">Too expensive</option>
          <option value="missing_features">Missing features</option>
          <option value="not_using">Not using it enough</option>
          <option value="switching">Switching to another service</option>
          <option value="other">Other</option>
        </select>
      </label>

      {error && <p className="ww-modal__error" role="alert">{error}</p>}

      <div className="ww-modal__actions">
        <button type="button" className="ww-btn ww-btn--ghost" onClick={handleClose}>Keep Premium</button>
        <button type="button" className="ww-btn ww-modal__danger" onClick={handleCancel} disabled={loading}>
          {loading ? <><span className="ww-modal__spinner" aria-hidden="true" />Cancelling…</> : 'Cancel Premium'}
        </button>
      </div>
    </Modal>
  );
};

export default CancelSubscriptionModal;
