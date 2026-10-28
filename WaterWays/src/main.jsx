import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
import { ThemeProvider } from './components/utility/contexts/Theme.jsx';
import { ClerkProvider } from '@clerk/clerk-react';
import { SettingsProvider } from './components/utility/contexts/SettingsContext.jsx';

if (window.location.protocol === 'capacitor:' || window.Capacitor?.isNativePlatform?.()) {
  document.body.classList.add('capacitor-app');
}

const PUBLISHABLE_KEY = import.meta.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

// A deploy replaces the hashed page chunks; a tab opened before it can't load them, so reload once.
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem('chunkReload')) return;
  sessionStorage.setItem('chunkReload', '1');
  event.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => sessionStorage.removeItem('chunkReload'));

// Analytics is about a sixth of the app's code; load it after the page is up instead of before.
window.addEventListener('load', () => {
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      defaults: '2025-05-24',
    });
  });
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      afterSignOutUrl='/'>
    <SettingsProvider>
    <App />
    </SettingsProvider>
    </ClerkProvider>
    </ThemeProvider>
  </StrictMode>,
)
