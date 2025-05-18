import React, { useState } from 'react';
import { Modal, Button, Form, Spinner } from 'react-bootstrap';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';

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
        setError('Failed to cancel subscription. Please try again.');
      }
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      setError('Failed to cancel subscription. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Modal 
      show={show} 
      onHide={handleClose}
      centered
      backdrop="static"
    >
      <Modal.Header closeButton>
        <Modal.Title>Cancel Subscription</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>We're sorry to see you go! Your subscription will remain active until the end of your current billing period.</p>
        
        <Form.Group className="mb-3">
          <Form.Label>Would you mind telling us why you're cancelling? (Optional)</Form.Label>
          <Form.Select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Select a reason...</option>
            <option value="too_expensive">Too expensive</option>
            <option value="missing_features">Missing features</option>
            <option value="not_using">Not using enough</option>
            <option value="switching">Switching to another service</option>
            <option value="other">Other</option>
          </Form.Select>
        </Form.Group>
        
        {error && <div className="alert alert-danger">{error}</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Keep Subscription
        </Button>
        <Button 
          variant="danger" 
          onClick={handleCancel}
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
              <span className="ms-2">Processing...</span>
            </>
          ) : (
            'Confirm Cancellation'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CancelSubscriptionModal;