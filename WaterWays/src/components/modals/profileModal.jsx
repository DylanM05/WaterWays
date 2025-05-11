import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import { UserProfile } from '@clerk/clerk-react';
import './styling/profileModal.css';

const ProfileModal = ({ show, handleClose }) => {
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
        <UserProfile />
      </Modal.Body>
      <Modal.Footer>
      </Modal.Footer>
    </Modal>
  );
};

export default ProfileModal;