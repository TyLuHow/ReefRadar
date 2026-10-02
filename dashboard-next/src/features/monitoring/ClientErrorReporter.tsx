'use client';

import { useEffect } from 'react';
import { reportClientError } from './report';

/**
 * Mounted once in Providers as a leaf. Listens for uncaught errors and unhandled
 * promise rejections (React error boundaries do not see event-handler or async
 * errors) and hands them to the silent reporter. Renders nothing.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      // A cross-origin script error has no .error; report the browser's own message only.
      const error = event.error ?? { name: 'Error', message: event.message };
      reportClientError(error, { source: 'window-error' });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientError(event.reason, { source: 'unhandledrejection' });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
