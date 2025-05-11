import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import 'bootstrap/dist/css/bootstrap.min.css';
import { ThemeProvider } from './components/utility/contexts/Theme.jsx';
import { ClerkProvider } from '@clerk/clerk-react';
import { SettingsProvider } from './components/utility/contexts/SettingsContext.jsx';
import { PostHogProvider} from 'posthog-js/react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key')
}

const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY} 
      afterSignOutUrl='/'>
    <SettingsProvider>
    <PostHogProvider 
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={options}
    >
    <App />
    </PostHogProvider>
    </SettingsProvider>
    </ClerkProvider>
    </ThemeProvider>
  </StrictMode>,
)
