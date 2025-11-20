import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ThemeProvider } from './providers/ThemeProvider'
import { AccessibilityProvider } from './components/AccessibilityProvider'
import { logger } from './utils/clientLogger'
import './index.css'
import './styles/theme.css'

// Check if we're running in Electron
const isElectron = typeof window !== 'undefined' && (window as any).electronApi !== undefined;

// Use HashRouter for Electron to avoid file:// protocol routing issues
// Use BrowserRouter for web deployment
const Router = isElectron ? HashRouter : BrowserRouter;

logger.router.info('Router configuration initialized', {
  isElectron,
  routerType: isElectron ? 'HashRouter' : 'BrowserRouter',
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
    <Router>
      <ThemeProvider>
        <AccessibilityProvider>
          <App />
        </AccessibilityProvider>
      </ThemeProvider>
    </Router>
  </React.StrictMode>
)
