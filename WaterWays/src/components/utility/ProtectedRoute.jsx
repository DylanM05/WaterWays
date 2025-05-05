import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { Alert } from 'react-bootstrap';

const ProtectedRoute = ({ children }) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const location = useLocation();
  const [showAlert, setShowAlert] = useState(false);
  
  useEffect(() => {
    // Show alert if user is redirected due to authentication
    if (isLoaded && !isSignedIn) {
      setShowAlert(true);
      const timer = setTimeout(() => setShowAlert(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return <div>Loading...</div>;
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
        <Navigate to="/" state={{ from: location.pathname }} replace />
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;