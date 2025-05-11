import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { Alert, Toast, ToastContainer, Spinner } from 'react-bootstrap';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const ProtectedRoute = ({ children, requireSubscription = false, requireAdmin = false }) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const location = useLocation();
  const [showAlert, setShowAlert] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [adminCheckComplete, setAdminCheckComplete] = useState(false);
  
  const checkAdminStatus = async () => {
    try {
      setCheckingAdmin(true);
      const token = await getToken();
      
      const response = await axios.get(`${API_BASE_URL}/admin/check`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsAdmin(response.data.isAdmin);
      
      if (!response.data.isAdmin && requireAdmin) {
        setToastMessage('You need admin privileges to access this page.');
        setShowToast(true);
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
      setIsAdmin(false);
      setToastMessage('Could not verify admin status.');
      setShowToast(true);
    } finally {
      setCheckingAdmin(false);
      setAdminCheckComplete(true);
    }
  };
  
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setShowAlert(true);
      const timer = setTimeout(() => setShowAlert(false), 5000);
      return () => clearTimeout(timer);
    }
    
    if (isLoaded && isSignedIn && requireSubscription) {
      const checkSubscription = async () => {
        try {
          setCheckingSubscription(true);
          const token = await getToken();
          const response = await axios.get(`${API_BASE_URL}/sub/status`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          setSubscriptionStatus(response.data);
          
          if (!response.data.subscribed) {
            setToastMessage('This feature requires a subscription. Please subscribe to continue.');
            setShowToast(true);
          }
        } catch (err) {
          console.error('Error checking subscription:', err);
          setSubscriptionStatus({ subscribed: false });
          setToastMessage('Could not verify subscription status.');
          setShowToast(true);
        } finally {
          setCheckingSubscription(false);
        }
      };
      
      checkSubscription();
    }
    if (isLoaded && isSignedIn && requireAdmin) {
      checkAdminStatus();
    }
  }, [isLoaded, isSignedIn, requireSubscription, requireAdmin, getToken]);

  if (!isLoaded || 
      (requireSubscription && checkingSubscription) || 
      (requireAdmin && (!adminCheckComplete || checkingAdmin))) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <Spinner animation="border" role="status" variant="primary">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <>
        {showAlert && (
          <div className="position-fixed top-0 start-50 translate-middle-x mt-3" style={{ zIndex: 1050 }}>
            <Alert variant="warning" onClose={() => setShowAlert(false)} dismissible>
              You must be signed in to access this page
            </Alert>
          </div>
        )}
        <Navigate to="/sign-in" state={{ from: location.pathname }} replace />
      </>
    );
  }
  
  // If subscription is required but user doesn't have it
  if (requireSubscription && subscriptionStatus && !subscriptionStatus.subscribed) {
    return (
      <>
        <ToastContainer position="top-center" className="mt-3">
          <Toast 
            onClose={() => setShowToast(false)} 
            show={showToast} 
            delay={5000} 
            autohide
            bg="warning"
          >
            <Toast.Header>
              <strong className="me-auto">Subscription Required</strong>
            </Toast.Header>
            <Toast.Body>{toastMessage}</Toast.Body>
          </Toast>
        </ToastContainer>
        <Navigate to="/pricing" state={{ from: location.pathname }} replace />
      </>
    );
  }

  if (requireAdmin && !isAdmin && adminCheckComplete) {
    return (
      <>
        <ToastContainer position="top-center" className="mt-3">
          <Toast 
            onClose={() => setShowToast(false)} 
            show={showToast} 
            delay={5000} 
            autohide
            bg="danger"
          >
            <Toast.Header>
              <strong className="me-auto">Admin Access Required</strong>
            </Toast.Header>
            <Toast.Body>{toastMessage}</Toast.Body>
          </Toast>
        </ToastContainer>
        <Navigate to="/" state={{ from: location.pathname }} replace />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;