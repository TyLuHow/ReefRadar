'use client';

import { useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface ABCrossfaderProps {
  /** 0 = fully healthy, 1 = fully degraded */
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

function getDescription(value: number): string {
  if (value < 0.15) return 'Vibrant reef with rich snapping shrimp and fish chorus';
  if (value < 0.35) return 'Mostly healthy with occasional quiet patches';
  if (value < 0.5) return 'Mixed soundscape -- some biophony, some silence';
  if (value < 0.65) return 'Noticeably quieter, biological sounds fading';
  if (value < 0.85) return 'Sparse soundscape dominated by low-frequency noise';
  return 'Near-silent reef with only faint background rumble';
}

export function ABCrossfader({ value, onChange, className }: ABCrossfaderProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(parseFloat(e.target.value));
    },
    [onChange],
  );

  const description = useMemo(() => getDescription(value), [value]);

  // Gradient stops: green (healthy) on left, red (degraded) on right
  const trackGradient =
    'linear-gradient(to right, #00ffa3 0%, #ffd700 40%, #ff6b6b 100%)';

  return (
    <div className={cn('w-full', className)}>
      {/* Labels */}
      <div className="flex justify-between mb-1 text-xs font-semibold tracking-wide">
        <span style={{ color: '#00ffa3' }}>Healthy</span>
        <span style={{ color: '#ff6b6b' }}>Degraded</span>
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

      {/* Dynamic description */}
      <p className="mt-2 text-center text-xs" style={{ color: '#6b8aad' }}>
        {description}
      </p>

      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #0d3b66;
          box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
          cursor: grab;
          transition: box-shadow 0.15s ease;
        }
        input[type='range']::-webkit-slider-thumb:active {
          cursor: grabbing;
          box-shadow: 0 0 14px rgba(0, 229, 255, 0.8);
        }
        input[type='range']::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #ffffff;
          border: 3px solid #0d3b66;
          box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
          cursor: grab;
        }
        input[type='range']::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
