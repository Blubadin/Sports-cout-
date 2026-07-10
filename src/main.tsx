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

// Monkeypatch HTMLMediaElement.prototype.play to catch unhandled play() promise rejections
const originalPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function (...args) {
  const p = originalPlay.apply(this, args);
  if (p && typeof p.catch === 'function') {
    p.catch((e: any) => {
      if (e && e.name === 'AbortError') return;
      if (e && e.message && e.message.includes('The play() request was interrupted')) {
        console.debug('[Suppressed] The play() request was interrupted by a call to pause() - from HTMLMediaElement monkeypatch');
        return;
      }
      // Do not throw, as that creates a new unhandled rejection
      // Just ignore or log other play errors (like NotAllowedError)
    });
  }
  return p;
};

// Suppress the benign play/pause DOMException that bubbles up from ReactPlayer
const isPlayInterrupted = (arg: any): boolean => {
  if (!arg) return false;
  if (typeof arg === 'string') {
    return arg.includes('The play() request was interrupted') || arg.includes('interrupted by a call to pause');
  }
  if (arg instanceof Error) {
    return !!(arg.message && (arg.message.includes('The play() request was interrupted') || arg.message.includes('interrupted by a call to pause')));
  }
  if (typeof arg === 'object') {
    const msg = String(arg.message || arg.reason || '');
    const name = String(arg.name || '');
    return msg.includes('The play() request was interrupted') || msg.includes('interrupted by a call to pause') || name.includes('The play() request was interrupted');
  }
  try {
    const str = String(arg);
    return str.includes('The play() request was interrupted') || str.includes('interrupted by a call to pause');
  } catch (e) {}
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason && (
      event.reason.name === 'NotAllowedError' || 
      event.reason.name === 'AbortError' || 
      isPlayInterrupted(event.reason)
    )
  ) {
    if (isPlayInterrupted(event.reason)) {
      console.debug('[Suppressed] The play() request was interrupted by a call to pause() - from unhandledrejection');
    }
    event.preventDefault(); // Prevent it from crashing the app/showing error overlay
  }
});

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  const errMessage = event.error?.message || '';
  if (
    msg.includes('The play() request was interrupted') ||
    errMessage.includes('The play() request was interrupted') ||
    isPlayInterrupted(event.error)
  ) {
    console.debug('[Suppressed] The play() request was interrupted by a call to pause() - from error event');
    event.preventDefault();
  }
});

const originalError = console.error;
console.error = (...args) => {
  if (args.some(isPlayInterrupted)) {
    console.debug('[Suppressed] The play() request was interrupted by a call to pause() - from console.error');
    return; // Suppress play/pause interrupt exceptions
  }
  originalError(...args);
};

const originalWarn = console.warn;
console.warn = (...args) => {
  if (args.some(isPlayInterrupted)) {
    console.debug('[Suppressed] The play() request was interrupted by a call to pause() - from console.warn');
    return;
  }
  originalWarn(...args);
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

