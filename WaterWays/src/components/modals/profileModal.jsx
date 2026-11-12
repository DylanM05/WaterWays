import React from 'react';
import { Modal } from 'react-bootstrap';
import { UserProfile } from '@clerk/clerk-react';
import './styling/profileModal.css';

/** Clerk's profile manager (name, email, password, connected accounts) in a dialog. */
const ProfileModal = ({ show, handleClose }) => (
  <Modal
    show={show}
    onHide={handleClose}
    size="lg"
    centered
    className="profile-modal"
    aria-label="Manage profile"
  >
    <div className="profile-modal__bar">
      <button type="button" className="ww-btn" onClick={handleClose}>Close</button>
    </div>
    <Modal.Body className="profile-modal__body">
      <UserProfile />
    </Modal.Body>
  </Modal>
);

export default ProfileModal;
