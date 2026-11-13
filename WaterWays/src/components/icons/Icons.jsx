import React from 'react';

// Stroke icons from the redesign, drawn on a 24-unit grid. They take the text colour and size to 1em
// unless a class sets otherwise.
const icon = (paths) => {
  const Icon = ({ className = '', ...props }) => (
    <svg viewBox="0 0 24 24" className={`ic ${className}`} aria-hidden="true" focusable="false" {...props}>{paths}</svg>
  );
  return Icon;
};

export const SearchIcon = icon(<><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></>);
export const HeartIcon = icon(<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />);
export const HeartFilledIcon = icon(<path fill="currentColor" d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z" />);
export const ChevronRightIcon = icon(<path d="M9 5l7 7-7 7" />);
export const ChevronLeftIcon = icon(<path d="M15 5l-7 7 7 7" />);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />);
export const UpIcon = icon(<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />);
export const DownIcon = icon(<path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" />);
export const FlatIcon = icon(<path d="M5 12h14" />);
export const ShareIcon = icon(<path d="M12 3.5v11M8 7.5l4-4 4 4M6 11v8a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19v-8" />);
export const CrownIcon = icon(<path d="M3.5 8l4.5 4 4-6.5 4 6.5 4.5-4-1.8 10.5H5.3z" />);
export const LockIcon = icon(<><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const UserIcon = icon(<><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>);
export const WavesIcon = icon(<path d="M2.5 9c2.4 0 2.4-2 4.75-2s2.4 2 4.75 2 2.4-2 4.75-2 2.4 2 4.75 2M2.5 15.5c2.4 0 2.4-2 4.75-2s2.4 2 4.75 2 2.4-2 4.75-2 2.4 2 4.75 2" />);
export const WarnIcon = icon(<><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.4v.1" /></>);
export const WindIcon = icon(<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7" />);
export const DropIcon = icon(<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0c0-4.4 6-10.8 6-10.8z" />);
export const GaugeIcon = icon(<><path d="M4.5 17a8.5 8.5 0 1 1 15 0" /><path d="M12 13l4-4" /></>);
export const CloudIcon = icon(<path d="M7 18h10.5a4 4 0 0 0 .3-8A6 6 0 0 0 6.2 10.6 3.7 3.7 0 0 0 7 18z" />);
export const RainIcon = icon(<><path d="M7 14.5h10.5a4 4 0 0 0 .3-8A6 6 0 0 0 6.2 7.1 3.7 3.7 0 0 0 7 14.5z" /><path d="M8.5 17.5l-1 3M12.5 17.5l-1 3M16.5 17.5l-1 3" /></>);
export const ShowersIcon = icon(<><circle cx="16.5" cy="6.5" r="2.5" /><path d="M6.5 15h9a3.5 3.5 0 0 0 .3-7A5.2 5.2 0 0 0 5.7 9.4 3 3 0 0 0 6.5 15z" /><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5" /></>);
export const SnowIcon = icon(<><path d="M7 13.5h10.5a4 4 0 0 0 .3-8A6 6 0 0 0 6.2 6.1 3.7 3.7 0 0 0 7 13.5z" /><path d="M8 17.5v.1M12 19.5v.1M16 17.5v.1M10 21v.1M14 21v.1" /></>);
export const StormIcon = icon(<><path d="M7 14.5h10.5a4 4 0 0 0 .3-8A6 6 0 0 0 6.2 7.1 3.7 3.7 0 0 0 7 14.5z" /><path d="M12.5 15.5l-2 3.5h3l-2 3.5" /></>);
export const FogIcon = icon(<path d="M4 9h16M6 13h12M4 17h16" />);
export const SunIcon = icon(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const MoonIcon = icon(<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z" />);
export const PartlyIcon = icon(<><circle cx="9" cy="8" r="3.2" /><path d="M9 2.3v1.2M3.3 8h1.2M5 4l.8.8M13 4l-.8.8" /><path d="M9.5 20h8a3.6 3.6 0 0 0 .3-7.2 5 5 0 0 0-9.4 1.4A2.9 2.9 0 0 0 9.5 20z" /></>);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const XIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const ClockIcon = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const MapIcon = icon(<><path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2z" /><path d="M9 4.5v13M15 6.5v13" /></>);
export const HistoryIcon = icon(<><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4.5v4h4M12 8v4.2l3 1.8" /></>);
export const ChartIcon = icon(<><path d="M3.5 18.5l5-6 4 3.5 8-9" /><path d="M3.5 20.5h17" /></>);
export const SettingsIcon = icon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);

/** The WaterWays mark: a staff-gauge plate over a wave. */
export const Logo = ({ className = '' }) => (
  <svg viewBox="0 0 28 28" className={className} aria-hidden="true" focusable="false">
    <rect width="28" height="28" rx="8" style={{ fill: 'var(--w-accent)' }} />
    <path d="M9.5 6.5h6.5M9.5 10.5h4M9.5 14.5h6.5" style={{ stroke: 'var(--w-accent-ink)' }} strokeWidth="2.2" strokeLinecap="round" fill="none" />
    <path d="M4 21.2c2.5 0 2.5-2.2 5-2.2s2.5 2.2 5 2.2 2.5-2.2 5-2.2 2.5 2.2 5 2.2" style={{ stroke: 'var(--w-accent-ink)' }} strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);

/** The change arrow for a trend: up, down or flat. */
export const TrendIcon = ({ direction, ...props }) => {
  if (direction === 'up') return <UpIcon {...props} />;
  if (direction === 'down') return <DownIcon {...props} />;
  return <FlatIcon {...props} />;
};
