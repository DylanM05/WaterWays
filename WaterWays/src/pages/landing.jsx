import React from 'react';
import { Link } from 'react-router-dom';
import canadaFlag from '../assets/canada-flag.jpg';

const Landing = () => {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <Link to="/canada" className="no-underline">
        <button className="flex flex-col items-center justify-center p-6 w-44 h-44 border border-gray-300 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 bg-white">
          <img src={canadaFlag} alt="Canada Flag" className="w-3/4 mb-3" />
          <span className="text-lg font-medium text-gray-700">Canada</span>
        </button>
      </Link>
    </div>
  );
};

export default Landing;