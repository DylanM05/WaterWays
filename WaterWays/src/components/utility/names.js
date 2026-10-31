// Small English words stay lower case inside a name. French articles are left capitalized, because names
// such as "Lac La Ronge" keep them.
const MINOR_WORDS = new Set(['a', 'above', 'an', 'and', 'at', 'below', 'by', 'from', 'in', 'near', 'of', 'on', 'the', 'to']);

// Government station data is mostly all caps; show it in title case for readability, as the iOS app does.
// "FRASER RIVER AT HOPE" -> "Fraser River at Hope"; names that already have lower case are left alone.
export const displayTitle = (name) => {
  const text = String(name || '');
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase()
    .replace(/(^|[\s\-/(.])(\p{L})/gu, (match, before, letter) => before + letter.toUpperCase())
    .split(' ')
    .map((word, index) => (index > 0 && MINOR_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word))
    .join(' ');
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
