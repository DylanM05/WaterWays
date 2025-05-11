import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Spinner, Alert } from 'react-bootstrap';
import { useAuth } from '@clerk/clerk-react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const InviteManager = () => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const { getToken } = useAuth();
  
  const fetchInvites = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await axios.get(
        `${API_BASE_URL}/inv/list`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setInvites(response.data.inviteLinks);
    } catch (err) {
      setError('Failed to load invite links');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchInvites();
  }, []);
  
  const generateInvite = async () => {
    try {
      setGenerating(true);
      setError('');
      setCopied(false);
      
      const token = await getToken();
      const response = await axios.post(
        `${API_BASE_URL}/inv/generate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Log the response to debug
      console.log("Generate response:", response.data);
      
      setSuccess('New invite link generated!');
      // Don't add to invites array here - just fetch the updated list instead
      fetchInvites();
    } catch (err) {
      console.error("Error generating invite:", err.response?.data || err.message);
      setError(`Failed to generate invite link: ${err.response?.data?.error || err.message}`);
    } finally {
      setGenerating(false);
    }
  };
  
  const copyToClipboard = (link) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };
  
  return (
    <Card>
      <Card.Header>
        <h4>Invite Management</h4>
      </Card.Header>
      <Card.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        {copied && <Alert variant="info">Link copied to clipboard!</Alert>}
        
        <Button 
          variant="primary" 
          onClick={generateInvite} 
          disabled={generating}
          className="mb-3"
        >
          {generating ? (
            <>
              <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />
              <span className="ms-2">Generating...</span>
            </>
          ) : (
            'Generate New Invite Link'
          )}
        </Button>
        
        <Table striped bordered hover>
          <thead>
            <tr>
              <th>Invite Code</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="text-center">
                  <Spinner animation="border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </Spinner>
                </td>
              </tr>
            ) : (
              invites.map(invite => (
                <tr key={invite.code}>
                  <td>{invite.code}</td>
                  <td>{new Date(invite.createdAt).toLocaleString()}</td>
                  <td>
                    {invite.isRedeemed ? (
                      <span className="text-danger">Redeemed</span>
                    ) : (
                      <span className="text-success">Available</span>
                    )}
                  </td>
                  <td>
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      onClick={() => copyToClipboard(`${window.location.origin}/redeem?code=${invite.code}`)}
                      disabled={invite.isRedeemed}
                    >
                      Copy Link
                    </Button>
                  </td>
                </tr>
              ))
            )}
            {!loading && invites.length === 0 && (
              <tr>
                <td colSpan="4" className="text-center">
                  No invite links found. Generate one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
};

export default InviteManager;