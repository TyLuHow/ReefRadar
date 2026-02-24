'use client';

import { useState, useEffect } from 'react';

const STATUS_MESSAGES = [
  'Decomposing acoustic layers...',
  'Measuring fish chorus density...',
  'Identifying snapping shrimp patterns...',
  'Comparing to 44 reference sites...',
];

export function ProcessingOverlay() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-8">
      {/* Spinner: two concentric rings */}
      <div className="relative w-24 h-24">
        {/* Outer ring - ochre, clockwise */}
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent"
          style={{
            borderTopColor: '#cd853f',
            borderRightColor: '#cd853f',
            animation: 'spin-clockwise 1.5s linear infinite',
          }}
        />
        {/* Inner ring - dusty-rose, counter-clockwise */}
        <div
          className="absolute inset-3 rounded-full border-2 border-transparent"
          style={{
            borderTopColor: '#c08081',
            borderLeftColor: '#c08081',
            animation: 'spin-counter 1.2s linear infinite',
          }}
        />
      </div>

      {/* Cycling status text */}
      <p
        className="text-sm font-light tracking-wide text-center"
        style={{ color: 'var(--text-secondary)' }}
      >
        {STATUS_MESSAGES[messageIndex]}
      </p>
    </div>
  );
}
