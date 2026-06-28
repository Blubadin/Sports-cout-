import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// Suppress the benign play/pause DOMException that bubbles up from ReactPlayer
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason && (
      event.reason.name === 'NotAllowedError' || 
      event.reason.name === 'AbortError' || 
      (event.reason.message && event.reason.message.includes('The play() request was interrupted by a call to pause()'))
    )
  ) {
    event.preventDefault(); // Prevent it from crashing the app/showing error overlay
  }
});

const originalError = console.error;
console.error = (...args) => {
  if (
    args[0] && 
    typeof args[0] === 'string' && 
    args[0].includes('The play() request was interrupted by a call to pause()')
  ) {
    return; // Suppress this specific ReactPlayer/React warning
  }
  if (
    args[0] &&
    args[0] instanceof Error &&
    args[0].message.includes('The play() request was interrupted by a call to pause()')
  ) {
    return;
  }
  originalError(...args);
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Failed to find the root element with id 'root'.");
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

