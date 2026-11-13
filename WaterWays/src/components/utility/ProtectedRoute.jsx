import React, { useState, useEffect, useCallback } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useUser, useAuth, SignInButton } from '@clerk/clerk-react';
import { Toast, ToastContainer } from 'react-bootstrap';
import axios from 'axios';
import Spinner from '../spinners/Spinner';
import '../../pages/styling/simplePages.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const ProtectedRoute = ({ children, requireSubscription = false, requireAdmin = false }) => {
  const { isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();
  const location = useLocation();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [subscriptionCheckFailed, setSubscriptionCheckFailed] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [adminCheckComplete, setAdminCheckComplete] = useState(false);

  const checkAdminStatus = useCallback(async () => {
    try {
      setCheckingAdmin(true);
      const token = await getToken();

      const response = await axios.get(`${API_BASE_URL}/admin/check`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsAdmin(response.data.isAdmin);

      if (!response.data.isAdmin && requireAdmin) {
        setToastMessage('You need admin access to open that page.');
        setShowToast(true);
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
      setIsAdmin(false);
      setToastMessage('Couldn’t check admin access.');
      setShowToast(true);
    } finally {
      setCheckingAdmin(false);
      setAdminCheckComplete(true);
    }
  }, [getToken, requireAdmin]);

  const checkSubscription = useCallback(async () => {
    try {
      setCheckingSubscription(true);
      setSubscriptionCheckFailed(false);
      const token = await getToken();
      const response = await axios.get(`${API_BASE_URL}/sub/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSubscriptionStatus(response.data);
    } catch (err) {
      console.error('Error checking subscription:', err);
      setSubscriptionStatus({ subscribed: false });
      setSubscriptionCheckFailed(true);
    } finally {
      setCheckingSubscription(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isLoaded && isSignedIn && requireSubscription) {
      checkSubscription();
    }
    if (isLoaded && isSignedIn && requireAdmin) {
      checkAdminStatus();
    }
  }, [isLoaded, isSignedIn, requireSubscription, requireAdmin, checkSubscription, checkAdminStatus]);

  if (!isLoaded ||
      (requireSubscription && checkingSubscription) ||
      (requireAdmin && (!adminCheckComplete || checkingAdmin))) {
    return <Spinner />;
  }

  if (!isSignedIn) {
    return (
      <div className="page gate">
        <h1 className="disp simple__title">Sign in to continue</h1>
        {/* Clerk's sign-in in a dialog, which returns to this page afterwards. */}
        <SignInButton mode="modal">
          <button type="button" className="ww-btn ww-btn--pri">Sign in</button>
        </SignInButton>
      </div>
    );
  }

  // If subscription is required but user doesn't have it
  if (requireSubscription && subscriptionStatus && !subscriptionStatus.subscribed) {
    if (subscriptionCheckFailed) {
      return (
        <div className="page gate">
          <h1 className="disp simple__title">Couldn’t check your membership</h1>
          <button type="button" className="ww-btn" onClick={checkSubscription}>Try again</button>
        </div>
      );
    }
    return (
      <div className="page gate">
        <h1 className="disp simple__title">This page is part of Premium</h1>
        <Link to="/pricing" state={{ from: location.pathname }} className="ww-btn ww-btn--pri">See Premium</Link>
      </div>
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
              <strong className="me-auto">Admin access required</strong>
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
