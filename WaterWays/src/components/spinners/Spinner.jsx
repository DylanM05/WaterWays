import React from 'react';
import './styling/Spinner.css';

const Spinner = ({ size = '32px', color = 'var(--w-accent)', message = 'Loading…' }) => (
  <div className="spinner-container" role="status">
    <div
      className="spinner"
      style={{
        width: size,
        height: size,
        borderColor: `${color} transparent ${color} transparent`,
      }}
    />
    {message && <p className="spinner-message">{message}</p>}
  </div>
);

export default Spinner;
