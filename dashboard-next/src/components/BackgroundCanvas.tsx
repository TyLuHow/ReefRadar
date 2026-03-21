'use client';

import { useRef } from 'react';
import { useBackgroundCanvas } from '@/hooks/useBackgroundCanvas';

export function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useBackgroundCanvas(canvasRef);

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: -1 }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
