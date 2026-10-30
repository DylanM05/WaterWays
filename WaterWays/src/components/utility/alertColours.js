// Environment Canada's risk colour when it gives one, otherwise by alert type. Text colours are fixed so
// alerts read the same in light and dark mode.
const COLOURS = {
  red: { background: '#c62828', text: '#ffffff' },
  orange: { background: '#ef6c00', text: '#ffffff' },
  yellow: { background: '#fbc02d', text: '#1a1a1a' }
};

export const alertColours = (alert) =>
  COLOURS[String(alert.colour || '').toLowerCase()]
  || (alert.type === 'warning' ? COLOURS.red : alert.type === 'watch' ? COLOURS.orange : COLOURS.yellow);

export const alertTitle = (name) => name.charAt(0).toUpperCase() + name.slice(1);
