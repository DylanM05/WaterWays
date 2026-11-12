import React from 'react';
import { CheckoutModal } from './MonthlyBilling';

const AnnualBilling = ({ show, handleClose }) => (
  <CheckoutModal show={show} handleClose={handleClose} endpoint="/sub/cacs" title="Premium, yearly" price="$30 a year" />
);

export default AnnualBilling;
