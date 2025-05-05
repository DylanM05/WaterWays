import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
import { ThemeProvider } from './components/contexts/Theme.jsx';
import { ClerkProvider } from '@clerk/clerk-react';
import { SettingsProvider } from './contexts/SettingsContext';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

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
