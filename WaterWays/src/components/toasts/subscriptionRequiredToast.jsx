import { Toast } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import './styling/subscriptionRequiredToast.css';

export default function subscriptionRequiredToast({ showToast, setShowToast, toastMessage }) {
  const navigate = useNavigate();
  
  return(
     <div 
        style={{ 
          position: 'fixed', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          zIndex: 1050,
          maxWidth: '350px'
        }}
      >
        <Toast 
          onClose={() => setShowToast(false)} 
          show={showToast} 
          delay={5000} 
          autohide
          className="custom-toast"
          style={{
            backgroundColor: 'var(--card-bg-colour)',
            borderColor: 'var(--primary-colour)',
            borderLeftWidth: '4px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
          }}
        >
          <Toast.Header
            style={{
              backgroundColor: 'var(--card-bg-colour)',
              borderColor: 'var(--border-colour)',
              color: 'var(--primary-colour)'
            }}
            closeButton={
              <button
                type="button"
                className="btn-close"
                style={{ color: 'var(--text-colour)' }}
                onClick={() => setShowToast(false)}
                aria-label="Close"
              />
            }
          >
            <strong className="me-auto">Subscription Required</strong>
          </Toast.Header>
          <Toast.Body style={{ color: 'var(--text-colour)' }}>
            {toastMessage}
            <div className="mt-2">
              <button
                className="btn btn-sm"
                style={{
                  backgroundColor: 'var(--primary-colour)',
                  color: 'var(--text-colour)',
                  border: 'none',
                  padding: '4px 8px'
                }}
                onClick={() => {
                  setShowToast(false);
                  navigate('/pricing');
                }}
              >
                View Plans
              </button>
            </div>
          </Toast.Body>
        </Toast>
      </div>
  );
};