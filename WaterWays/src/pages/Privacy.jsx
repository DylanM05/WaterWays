import React from 'react';
import { SUPPORT_EMAIL } from '../components/utility/contact';

// The privacy policy for the website and the iOS app (linked from the app's Membership screen and
// from App Store Connect). Keep it in step with what the server stores; see Server/models.
const UPDATED = 'October 29, 2026';

// The top padding keeps the title clear of the floating menu button.
const pageStyle = { maxWidth: '760px', margin: '0 auto', padding: '56px 16px 24px',color: 'var(--text-colour)', textAlign: 'left', lineHeight: 1.6 };
const headingStyle = { fontSize: '1.25rem', fontWeight: 600, marginTop: '28px', marginBottom: '8px' };
const linkStyle = { color: 'var(--text-colour)', textDecoration: 'underline' };

const Section = ({ title, children }) => (
  <section>
    <h2 style={headingStyle}>{title}</h2>
    {children}
  </section>
);

const Privacy = () => (
  <main style={pageStyle}>
    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>Privacy Policy</h1>
    <p style={{ opacity: 0.7 }}>Last updated {UPDATED}</p>

    <p>
      This policy covers the WaterWays website (water-ways.ca) and the WaterWays iOS app. WaterWays shows river levels,
      flows and weather. You can use most of it without an account, and we collect only what the features you use need.
    </p>

    <Section title="Without an account">
      <ul>
        <li>
          <strong>Visit counts (website):</strong> your browser keeps a random ID, and the site records one visit per ID per day.
          This counts how many people use the site. It isn't linked to your name or account, and we don't store your IP address with it.
        </li>
        <li>
          <strong>Analytics (website):</strong> the website uses PostHog to see which pages are used and where things go wrong.
          PostHog receives the pages you view, your browser and device type, and an approximate location worked out from your IP address.
        </li>
        <li>
          <strong>Settings on your device:</strong> your theme, units and preferred tab are kept in your browser or on your phone.
        </li>
      </ul>
      <p>The iOS app has no analytics and doesn't ask for your location, contacts or photos. It doesn't track you across other apps or websites.</p>
    </Section>

    <Section title="With an account">
      <ul>
        <li>
          <strong>Your account:</strong> sign-in is handled by Clerk, which stores your email address, your name if you give one,
          and your sign-in details. Our server stores only Clerk's ID for your account.
        </li>
        <li>
          <strong>Saved stations and rivers, and your settings</strong> (units, time format, theme and default tab), so they follow you between devices.
        </li>
        <li>
          <strong>Website memberships:</strong> payments are handled by Stripe, and we never see your card details. We store your Stripe
          customer ID and your plan, status and renewal date. Stripe receives your email address so it can send receipts.
        </li>
        <li>
          <strong>App Store memberships:</strong> payments are handled by Apple. We store the purchase's transaction IDs, product,
          expiry and renewal status, and a random ID that links the purchase to your account. Apple doesn't share your name or payment details with us.
        </li>
      </ul>
    </Section>

    <Section title="Weather and maps">
      <p>
        Forecasts come from Open-Meteo. Our server asks for them using the station's coordinates, so your own location is never sent.
        The website's station map is drawn by Google Maps, and the iOS app's by Apple Maps. Those maps load from Google or Apple,
        which receive your IP address under their own privacy policies.
      </p>
    </Section>

    <Section title="Who else handles your data">
      <p>
        Only the services above process data for us: Clerk (accounts), Stripe and Apple (payments), PostHog (website analytics), Google
        and Apple (maps) and Sentry (error reports from our server, without personal details). We don't sell your data or share it for advertising.
      </p>
    </Section>

    <Section title="Keeping and deleting your data">
      <p>
        We keep your account data until you delete your account. You can delete it in the iOS app (Account) or on the website
        (Settings › Profile). Deleting it removes your saved stations and rivers, your settings and your membership records from our
        server, and cancels a website membership. Stripe keeps its invoices, because they are financial records.
      </p>
      <p>
        An App Store subscription is billed to your Apple ID, so deleting your account doesn't stop it. Cancel it in Settings › Apple Account › Subscriptions.
      </p>
    </Section>

    <Section title="Children">
      <p>WaterWays isn't directed at children under 13, and we don't knowingly collect their information.</p>
    </Section>

    <Section title="Your choices and questions">
      <p>
        You can ask for a copy of your data, or ask us to correct or delete it, by emailing{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={linkStyle}>{SUPPORT_EMAIL}</a>. If this policy changes, we'll update the date at the top of this page.
      </p>
    </Section>
  </main>
);

export default Privacy;
