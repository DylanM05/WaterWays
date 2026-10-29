import React from 'react';

// The attribution both data sources ask for: Environment Canada's Open Government Licence and
// Open-Meteo's CC BY 4.0 licence.
const linkStyle = { color: 'var(--text-colour)', textDecoration: 'underline' };

const DataCredits = () => (
  <footer style={{ color: 'var(--text-colour)', opacity: 0.7, fontSize: '0.75rem', padding: '24px 16px 16px', textAlign: 'center' }}>
    Water data and weather alerts: Environment and Climate Change Canada. Contains information licensed under the{' '}
    <a href="https://open.canada.ca/en/open-government-licence-canada" target="_blank" rel="noreferrer" style={linkStyle}>
      Open Government Licence – Canada
    </a>.{' '}
    <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" style={linkStyle}>Weather data by Open-Meteo.com</a>{' '}
    (CC BY 4.0).
  </footer>
);

export default DataCredits;
