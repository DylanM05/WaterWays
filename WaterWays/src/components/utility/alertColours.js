// Environment Canada's risk colour when it gives one, otherwise by alert type: warnings red, watches orange and
// the rest yellow. The colours themselves are design tokens (--w-alert-*) applied by .ww-alert--red/--yellow.
const RANK = { red: 0, orange: 1, yellow: 2 };

export const alertSeverity = (alert) => {
  const colour = String(alert?.colour || '').toLowerCase();
  if (colour in RANK) return colour;
  return alert?.type === 'warning' ? 'red' : alert?.type === 'watch' ? 'orange' : 'yellow';
};

/** Sorts severities most severe first. */
export const severityRank = (severity) => RANK[severity] ?? 9;

/** The class that colours a .ww-alert by severity; orange is the plain .ww-alert. */
export const severityClass = (severity) => (severity === 'orange' ? '' : ` ww-alert--${severity}`);

export const alertTitle = (name) => name.charAt(0).toUpperCase() + name.slice(1);
