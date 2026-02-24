'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { BandId, ALL_BANDS } from './FrequencyBands';
import { useSpectrogramAnimation } from './useSpectrogramAnimation';

interface SpectrogramCanvasProps {
  state: 'idle' | 'playing' | 'analyzing';
  activeBands?: Set<BandId>;
  audioAnalyser?: AnalyserNode | null;
  className?: string;
  opacity?: number;
}

export function SpectrogramCanvas({
  state,
  activeBands = ALL_BANDS,
  audioAnalyser = null,
  className,
  opacity = 1,
}: SpectrogramCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useSpectrogramAnimation(canvasRef, state, activeBands, audioAnalyser);

  return (
    <div className={cn('relative w-full h-full', className)} style={{ opacity }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}

export default SpectrogramCanvas;
