import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/archivo';
import '@fontsource/anton/latin-400.css';
import 'brightpixels';
import './styles.css';
import './branding.css';
import './enhancements.css';
import './polish.css';
import './polish2.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

// Tells the load hold in index.html that the app has rendered and its first reads have started.
setTimeout(() => {
  (window as unknown as { __adpadMounted?: boolean }).__adpadMounted = true;
}, 0);
