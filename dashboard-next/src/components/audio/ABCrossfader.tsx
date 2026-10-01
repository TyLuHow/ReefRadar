'use client';

import { useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ABCrossfaderProps {
  /** 0 = fully healthy, 1 = fully degraded */
  value: number;
  onChange: (value: number) => void;
  /** Static caption for the left (value=0) endpoint clip -- does not change with slider position (D-16). */
  leftCaption: string;
  /** Static caption for the right (value=1) endpoint clip -- does not change with slider position (D-16). */
  rightCaption: string;
  className?: string;
}

export function ABCrossfader({ value, onChange, leftCaption, rightCaption, className }: ABCrossfaderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange],
  );

  // Gradient stops: green (healthy) on left, red (degraded) on right
  const trackGradient =
    'linear-gradient(to right, #cd853f 0%, #e9dcc9 40%, #c08081 100%)';

  return (
    <div className={cn('w-full', className)}>
      {/* Labels */}
      <div className="flex justify-between mb-1 text-xs font-semibold tracking-wide">
        <span style={{ color: '#cd853f' }}>Healthy</span>
        <span style={{ color: '#c08081' }}>Degraded</span>
      </div>

      {/* Slider */}
      <div className="relative">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={handleChange}
          aria-label="Crossfade between healthy and degraded reef audio"
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: trackGradient,
            outline: 'none',
            WebkitAppearance: 'none',
          }}
        />
      </div>

      {/* Static endpoint captions -- do not change with slider position (D-16) */}
      <div className="mt-2 flex justify-between gap-4 text-xs" style={{ color: '#a8a29e' }}>
        <p className="text-left">{leftCaption}</p>
        <p className="text-right">{rightCaption}</p>
      </div>

      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #252220;
          box-shadow: 0 0 8px rgba(205, 133, 63, 0.5);
          cursor: grab;
          transition: box-shadow 0.15s ease;
        }
        input[type='range']::-webkit-slider-thumb:active {
          cursor: grabbing;
          box-shadow: 0 0 14px rgba(205, 133, 63, 0.8);
        }
        input[type='range']::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #252220;
          box-shadow: 0 0 8px rgba(205, 133, 63, 0.5);
          cursor: grab;
        }
        input[type='range']::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
