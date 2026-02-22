'use client';

import { useScrollProgress } from '@/hooks/useScrollProgress';

export function ScrollProgress() {
  const progress = useScrollProgress();

  return (
    <div
      className="fixed top-0 left-0 w-full z-50 pointer-events-none"
      style={{ height: '3px' }}
    >
      <div
        className="h-full"
        style={{
          width: `${progress * 100}%`,
          background: 'linear-gradient(to right, var(--glow-cyan), var(--glow-green))',
          transition: 'width 0.1s ease-out',
        }}
      />
    </div>
  );
}
