import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ThemeProvider } from './providers/ThemeProvider'
import { AccessibilityProvider } from './components/AccessibilityProvider'
import { AuthProvider } from './contexts/AuthContext'
import { logger } from './utils/clientLogger'
import './index.css'
import './styles/theme.css'

// Always use BrowserRouter for web deployment
logger.router.info('Router configuration initialized', {
  routerType: 'BrowserRouter',
  pathname: typeof window !== 'undefined' ? window.location.pathname : '',
  protocol: typeof window !== 'undefined' ? window.location.protocol : ''
});

// Disable service workers to prevent offline caching issues
if ('serviceWorker' in navigator) {
  logger.serviceWorker.info('Checking for service workers...');
  navigator.serviceWorker.getRegistrations().then(registrations => {
    logger.serviceWorker.info(`Found ${registrations.length} service workers`);
    for (const registration of registrations) {
      logger.serviceWorker.debug('Unregistering service worker', { scope: registration.scope });
      registration.unregister().then(success => {
        logger.serviceWorker.info('Service worker unregistered successfully', { success });
      });
    }
  }).catch(error => {
    logger.serviceWorker.error('Error unregistering service workers', error);
  });
}

// Clear application cache
if ('caches' in window) {
  caches.keys().then(cacheNames => {
    cacheNames.forEach(cacheName => {
      logger.cache.debug('Deleting cache', { cacheName });
      caches.delete(cacheName);
    });
  }).catch(error => {
    logger.cache.error('Error clearing caches', error);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <AccessibilityProvider>
            <App />
          </AccessibilityProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
