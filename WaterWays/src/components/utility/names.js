// Government station data is mostly all caps; show it in title case for readability, as the iOS app does.
// "FRASER RIVER AT HOPE" -> "Fraser River At Hope"; names that already have lower case are left alone.
export const displayTitle = (name) => {
  const text = String(name || '');
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s\-/(.])(\p{L})/gu, (match, before, letter) => before + letter.toUpperCase());
};

export const PROVINCE_NAMES = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon'
};
