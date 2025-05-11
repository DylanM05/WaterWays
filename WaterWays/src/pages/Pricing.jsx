import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Toast, ToastContainer } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/clerk-react';
import ProfileModal from '../components/modals/profileModal';
import MonthlyModal from '../components/modals/MonthlyBilling';
import AnnualModal from '../components/modals/AnnualBilling';

const Pricing = () => {
  const navigate = useNavigate();
  const { openUserProfile } = useClerk();
  const { user, isSignedIn } = useUser();
  const [showToast, setShowToast] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false); 
  const [showMonthlyModal, setShowMonthlyModal] = useState(false);
  const [showAnnualModal, setShowAnnualModal] = useState(false);
  const [referringPage, setReferringPage] = useState('');
  
  // Store the referring page when component mounts
  useEffect(() => {
    // Get the previous page from history or use a default fallback
    const previousPage = document.referrer || '/';
    // Only store external referring pages, not internal navigation within the pricing page
    if (!previousPage.includes('/pricing')) {
      setReferringPage(previousPage);
    } else {
      // Fallback to home if it's internal navigation
      setReferringPage('/');
    }
  }, []);

  const handleMonthlySubscribe = () => {
    if (!isSignedIn) {
      navigate('/sign-in');
      return;
    }
    
    setShowMonthlyModal(true);
  };
  const handleAnnualSubscribe = () => {
    if (!isSignedIn) {
      navigate('/sign-in');
      return;
    }
    
    setShowAnnualModal(true);
  };
  
  const handleCloseModal = () => {
    setShowMonthlyModal(false);
    // Navigate to stored referring page instead of using history.back()
    if (referringPage) {
      // Check if it's an internal page (starts with /) or external URL
      if (referringPage.startsWith('/')) {
        navigate(referringPage);
      } else {
        // For external URLs or absolute paths within your app
        window.location.href = referringPage;
      }
    } else {
      // Fallback in case referringPage is empty
      navigate('/');
    }
  };
  
  // Common card styles for uniformity
  const cardStyle = {
    backgroundColor: 'var(--card-bg-colour)',
    borderColor: 'var(--border-colour)',
    height: '100%'  // This ensures all cards have same height
  };
  
  const featuredCardStyle = {
    backgroundColor: 'var(--card-bg-colour)',
    borderColor: 'var(--primary-colour)',
    boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
    height: '100%'  // Uniform height
  };
  
  const cardBodyStyle = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  };
  
  const listStyle = {
    flex: '1',  // Takes up available space
    color: 'var(--text-colour)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start'
  };
  
  return (
    <Container className="py-5">
      <h1 className="text-center mb-5" style={{ color: 'var(--text-colour)' }}>Choose Your Plan</h1>
      
      <Row className="justify-content-center g-4">
        <Col md={4} className="d-flex">
          <Card style={cardStyle} className="w-100">
            <Card.Header className="text-center" style={{ backgroundColor: 'var(--primary-colour)', color: 'var(--primary-text-colour)' }}>
              <h3>Free</h3>
            </Card.Header>
            <Card.Body className="text-center d-flex flex-column" style={cardBodyStyle}>
              <Card.Title style={{ color: 'var(--text-colour)' }}>$0/month</Card.Title>
              <ul className="list-unstyled mt-4 mb-4" style={listStyle}>
                <li className="mb-2">✅ Access to all water data</li>
                <li className="mb-2">✅ Current weather information</li>
                <li className="mb-2">❌ Early access to our latest features</li>
                <li className="mb-2">❌ Favorites feature</li>
              </ul>
              <div className="mt-auto">
                <Button 
                  onClick={() => window.history.back()}
                  variant="outline-primary" 
                  className="w-100"
                >
                  Current Plan
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
        
        <Col md={4} className="d-flex">
          <Card style={featuredCardStyle} className="w-100 position-relative">
            <div className="position-absolute top-0 start-50 translate-middle-x" style={{
              backgroundColor: 'var(--primary-colour)',
              color: 'var(--primary-text-colour)',
              padding: '2px 10px',
              borderRadius: '0 0 5px 5px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              width: '100%',
              zIndex: 1
            }}>
              Most Popular
            </div>
            <Card.Header className="text-center" style={{ backgroundColor: 'var(--primary-colour)', color: 'var(--primary-text-colour)', marginTop: '15px' }}>
              <h3>Monthly</h3>
            </Card.Header>
            <Card.Body className="text-center d-flex flex-column" style={cardBodyStyle}>
              <Card.Title style={{ color: 'var(--text-colour)' }}>$4/month</Card.Title>
              <ul className="list-unstyled mt-4 mb-4" style={listStyle}>
                <li className="mb-2">✅ Access to all water data</li>
                <li className="mb-2">✅ Current weather information</li>
                <li className="mb-2">✅ Favorites feature</li>
                <li className="mb-2">✅ Early access to our latest features</li>
              </ul>
              <div className="mt-auto">
                <Button 
                  onClick={() => handleMonthlySubscribe()} 
                  variant="primary" 
                  className="w-100"
                >
                  Subscribe Now
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4} className="d-flex">
          <Card style={featuredCardStyle} className="w-100 position-relative">
            <div className="position-absolute top-0 start-50 translate-middle-x" style={{
              backgroundColor: 'var(--primary-colour)',
              color: 'var(--primary-text-colour)',
              padding: '2px 10px',
              borderRadius: '0 0 5px 5px',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              width: '100%',
              zIndex: 1
            }}>
              Best Value
            </div>
            <Card.Header className="text-center" style={{ backgroundColor: 'var(--primary-colour)', color: 'var(--primary-text-colour)', marginTop: '15px' }}>
              <h3>Annual</h3>
            </Card.Header>
            <Card.Body className="text-center d-flex flex-column" style={cardBodyStyle}>
              <Card.Title style={{ color: 'var(--text-colour)' }}> $2.50/month billed annually<br />$30 per year</Card.Title>
              <ul className="list-unstyled mt-4 mb-4" style={listStyle}>
                <li className="mb-2">✅ Access to all water data</li>
                <li className="mb-2">✅ Current weather information</li>
                <li className="mb-2">✅ Favorites feature</li>
                <li className="mb-2">✅ Early access to our latest features</li>
              </ul>
              <div className="mt-auto">
                <Button 
                  onClick={() => handleAnnualSubscribe()} 
                  variant="primary" 
                  className="w-100"
                >
                  Subscribe Now
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <MonthlyModal
        show={showMonthlyModal} 
        handleClose={handleCloseModal} 
      />
      <AnnualModal
        show={showAnnualModal}
        handleClose={handleCloseModal}
      />
    </Container>
  );
};

export default Pricing;