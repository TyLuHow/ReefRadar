'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '0.75rem',
        },
        className: 'shadow-lg',
      }}
    />
  );
}

// Re-export toast for convenience
export { toast } from 'sonner';
