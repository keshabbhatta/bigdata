import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
// Devanagari letters for the Nepali language (same IBM Plex family).
import '@fontsource/ibm-plex-sans-devanagari/devanagari-400.css';
import '@fontsource/ibm-plex-sans-devanagari/devanagari-500.css';
import '@fontsource/ibm-plex-sans-devanagari/devanagari-600.css';
import './index.css';
import App from './App.jsx';
import { I18nProvider } from './i18n/index.jsx';
import { registerServiceWorker } from './offline/serviceWorker.js';
import { requestPersistentStorage } from './offline/indexedDB.js';

registerServiceWorker();
requestPersistentStorage();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
