import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';
import './styling/simplePages.css';


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


  const handleRedeem = async (event) => {
    event.preventDefault();
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
      setError(err.response?.data?.error || 'Couldn’t redeem this invite code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="simple__narrow">
        <h1 className="disp simple__title">Redeem an invite</h1>
        <form className="ww-card simple__card" onSubmit={handleRedeem}>
          {!isSignedIn && <p className="simple__msg">Sign in to redeem your invite.</p>}

          <label className="simple__field">
            <span>Invite code</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter your code"
              autoComplete="off"
              spellCheck="false"
            />
          </label>

          {error && <p className="simple__msg simple__msg--error" role="alert">{error}</p>}
          {success && <p className="simple__msg simple__msg--ok" role="status">{success}</p>}

          <button type="submit" className="ww-btn ww-btn--pri" disabled={loading || !code}>
            {loading ? <><span className="simple__spinner" aria-hidden="true" />Redeeming…</> : 'Redeem'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RedeemInvite;
