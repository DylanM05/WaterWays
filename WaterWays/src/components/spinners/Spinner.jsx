import React from 'react';
import './styling/Spinner.css'; // Import the CSS for styling

const Spinner = ({ size = '50px', color = '#007bff', message = 'Loading...' }) => {
    return (
        <div className="spinner-container">
            <div
                className="spinner"
                style={{
                    width: size,
                    height: size,
                    borderColor: `${color} transparent ${color} transparent`,
                }}
            ></div>
            {message && <p className="spinner-message">{message}</p>}
        </div>
    );
};

export default Spinner;