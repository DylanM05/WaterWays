import React from 'react';
import { Link } from 'react-router-dom';
import canadaFlag from '../assets/canada-flag.jpg'; // Make sure to have the flag image in the specified path

const Landing = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Link to="/canada" style={{ textDecoration: 'none' }}>
        <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '150px', height: '150px', padding: '10px', fontSize: '16px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '8px' }}>
          <img src={canadaFlag} alt="Canada Flag" style={{ width: '90%', height: 'auto', marginBottom: '10px' }} />
          <span>Canada</span>
        </button>
      </Link>
    </div>
  );
};

export default Landing;