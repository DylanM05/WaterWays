import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';
import Spinner from '../spinners/Spinner';
import '../../pages/styling/simplePages.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const InviteManager = () => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(null);
  const { getToken } = useAuth();

  const fetchInvites = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await axios.get(
        `${API_BASE_URL}/inv/list`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setInvites(response.data.inviteLinks);
    } catch {
      setError('Couldn’t load invite links.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const generateInvite = async () => {
    try {
      setGenerating(true);
      setError('');
      setCopied(null);

      const token = await getToken();
      await axios.post(
        `${API_BASE_URL}/inv/generate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('New invite link added.');
      fetchInvites();
    } catch (err) {
      console.error("Error generating invite:", err.response?.data || err.message);
      setError(`Couldn’t create an invite link: ${err.response?.data?.error || err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (code, link) => {
    navigator.clipboard.writeText(link);
    setCopied(code);
    setTimeout(() => setCopied(current => (current === code ? null : current)), 3000);
  };

  return (
    <div className="page">
      <header className="invites__head">
        <h1 className="disp simple__title">Invites</h1>
        <button type="button" className="ww-btn ww-btn--pri" onClick={generateInvite} disabled={generating}>
          {generating ? <><span className="simple__spinner" aria-hidden="true" />Creating…</> : 'New invite link'}
        </button>
      </header>

      {(error || success) && (
        <div className="invites__msgs">
          {error && <p className="simple__msg simple__msg--error" role="alert">{error}</p>}
          {success && <p className="simple__msg simple__msg--ok" role="status">{success}</p>}
        </div>
      )}

      {loading && invites.length === 0 ? (
        <Spinner message="Loading invites…" />
      ) : !loading && invites.length === 0 ? (
        <div className="ww-empty">
          <b>No invite links yet</b>
          <span>Create one with New invite link.</span>
        </div>
      ) : (
        <div className="ww-card invites__wrap">
          <table className="invites__table">
            <thead>
              <tr>
                <th>Code</th>
                <th className="invites__date">Created</th>
                <th>Status</th>
                <th><span className="visually-hidden">Link</span></th>
              </tr>
            </thead>
            <tbody>
              {invites.map(invite => (
                <tr key={invite.code}>
                  <td className="mono">{invite.code}</td>
                  <td className="invites__date">{new Date(invite.createdAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{invite.isRedeemed ? <span className="invites__used">Redeemed</span> : <span className="invites__open">Available</span>}</td>
                  <td>
                    <button
                      type="button"
                      className="ww-btn"
                      onClick={() => copyToClipboard(invite.code, `${window.location.origin}/redeem?code=${invite.code}`)}
                      disabled={invite.isRedeemed}
                    >
                      {copied === invite.code ? 'Copied' : 'Copy link'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InviteManager;
