import React, { useState, useEffect } from 'react';
import { Container, Card, Button, Alert, Spinner } from 'react-bootstrap';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL; 
const RedeemInvite = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { getToken } = useAuth();
  const { isSignedIn } = useUser();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteCode = params.get('code');
    if (inviteCode) {
      setCode(inviteCode);
    }
  }, [location]);
  

  const handleRedeem = async () => {
    try {
      setLoading(true);
      setError('');
      
      const token = await getToken();
      
      const response = await axios.post(
        `${API_BASE_URL}/inv/redeem`,
        { code },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      

      console.log("Redeem response:", response.data);
      
      setSuccess(response.data.message);
      setTimeout(() => navigate('/settings'), 3000);
    } catch (err) {
      console.error("Redemption error:", err.response?.data || err.message); 
      setError(err.response?.data?.error || 'Failed to redeem invite code');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Container className="py-5">
      <Card className="mx-auto" style={{ maxWidth: '500px' }}>
        <Card.Header className="text-center" style={{ backgroundColor: 'var(--primary-colour)', color: 'var(--primary-text-colour)' }}>
          <h3>Redeem Invite</h3>
        </Card.Header>
        <Card.Body className="p-4">
          {!isSignedIn && (
            <Alert variant="info">
              Please sign in to redeem your invitation.
            </Alert>
          )}
          
          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}
          
          <div className="mb-3">
            <label htmlFor="inviteCode" className="form-label">Invite Code</label>
            <input
              type="text"
              className="form-control"
              id="inviteCode"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter your invite code"
            />
          </div>
          
          <Button
            variant="primary"
            onClick={handleRedeem}
            disabled={loading || !code}
            className="w-100 mt-3"
          >
            {loading ? (
              <>
                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
                <span className="ms-2">Processing...</span>
              </>
            ) : (
              'Redeem Invite'
            )}
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default RedeemInvite;