'use client';

import { Toaster } from 'sonner';

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: 'rgba(26, 23, 20, 0.95)',
          border: '1px solid rgba(229, 225, 219, 0.1)',
          borderRadius: '0.75rem',
          color: '#e5e1db',
          backdropFilter: 'blur(12px)',
        },
        className: 'shadow-lg',
      }}
    />
  );
}

// Re-export toast for convenience
export { toast } from 'sonner';
