import React, { useState } from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import './styling/profileModal.css';


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/* const API_BASE_URL = 'https://curious-caring-adder.ngrok-free.app'; */


const CustomBilling = ({ show, handleClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { getToken } = useAuth();
  
  const handleSubscribe = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = await getToken();
      const response = await axios.post(
        `${API_BASE_URL}/sub/cmcs`,
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
      setError('Failed to initiate checkout. Please try again.');
      setLoading(false);
    }
  };


  return (
    <Modal 
      show={show}
      onHide={handleClose}
      size="lg"
      centered
      className="transparent-modal"
      backdropClassName="transparent-modal-backdrop"
    >
      <Modal.Header className="d-flex justify-content-end">
        <Button variant="secondary" className="close-button" onClick={handleClose}>
          Close
        </Button>
      </Modal.Header>
      <Modal.Body>
        <h4 className="text-center mb-4">Complete Your Monthly Subscription</h4>
        <p className="text-center">You will be redirected to Stripe in order to complete the payment.</p>
        
        {error && <div className="alert alert-danger">{error}</div>}
        
        <div className="d-flex justify-content-center mt-4">
          <Button 
            variant="primary" 
            onClick={handleSubscribe} 
            disabled={loading}
            style={{ 
              backgroundColor: 'var(--primary-colour)',
              borderColor: 'var(--primary-colour)',
              minWidth: '200px'
            }}
          >
            {loading ? (
              <>
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                <span className="ms-2">Processing...</span>
              </>
            ) : (
              'Proceed to Checkout'
            )}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};

export default CustomBilling;