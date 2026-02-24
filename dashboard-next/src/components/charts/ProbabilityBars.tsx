'use client';

import { useEffect, useState } from 'react';
import { ReefStatus, STATUS_COLORS } from '@/types';
import { formatStatus, cn } from '@/lib/utils';

interface ProbabilityBarsProps {
  probabilities: Record<ReefStatus, number>;
  highlightedStatus?: ReefStatus;
  animated?: boolean;
  showLabels?: boolean;
  compact?: boolean;
  className?: string;
}

export function ProbabilityBars({
  probabilities,
  highlightedStatus,
  animated = true,
  showLabels = true,
  compact = false,
  className = '',
}: ProbabilityBarsProps) {
  const [animatedWidths, setAnimatedWidths] = useState<Record<string, number>>({});

  // Sort probabilities by value (highest first)
  const sortedProbabilities = Object.entries(probabilities)
    .sort(([, a], [, b]) => b - a)
    .map(([status, probability]) => ({
      status: status as ReefStatus,
      probability,
      isHighlighted: status === highlightedStatus,
    }));

  // Animate bars on mount
  useEffect(() => {
    if (animated) {
      // Start with 0 width
      setAnimatedWidths(
        Object.fromEntries(Object.keys(probabilities).map((k) => [k, 0]))
      );

      // Animate to full width after a delay
      const timer = setTimeout(() => {
        setAnimatedWidths(
          Object.fromEntries(
            Object.entries(probabilities).map(([k, v]) => [k, v * 100])
          )
        );
      }, 100);

      return () => clearTimeout(timer);
    } else {
      setAnimatedWidths(
        Object.fromEntries(
          Object.entries(probabilities).map(([k, v]) => [k, v * 100])
        )
      );
    }
  }, [probabilities, animated]);

  return (
    <div className={cn('space-y-3', className)}>
      {sortedProbabilities.map(({ status, probability, isHighlighted }) => {
        const color = STATUS_COLORS[status] || '#888';
        const width = animatedWidths[status] ?? 0;

        return (
          <div
            key={status}
            className={cn(
              'relative',
              compact ? 'py-0' : 'py-0'
            )}
          >
            {/* Label row */}
            {showLabels && (
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    className={cn(
                      'text-sm',
                      isHighlighted
                        ? 'font-semibold'
                        : ''
                    )}
                    style={{
                      color: isHighlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {formatStatus(status)}
                  </span>
                </div>
                <span
                  className={cn(
                    'text-sm tabular-nums',
                    isHighlighted
                      ? 'font-bold'
                      : 'font-medium'
                  )}
                  style={{
                    color: isHighlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {(probability * 100).toFixed(1)}%
                </span>
              </div>
            )}

            {/* Bar */}
            <div
              className={cn(
                'w-full rounded-full overflow-hidden',
                compact ? 'h-2' : 'h-3'
              )}
              style={{ background: 'var(--glass-bg)' }}
            >
              <div
                className={cn(
                  'h-full rounded-full transition-all ease-out',
                  animated ? 'duration-1000' : 'duration-0'
                )}
                style={{
                  width: `${width}%`,
                  backgroundColor: color,
                }}
              />
            </div>

            {/* Inline label for compact mode */}
            {!showLabels && (
              <div
                className="absolute inset-0 flex items-center px-2 pointer-events-none"
                style={{ zIndex: 1 }}
              >
                <span className="text-xs font-medium text-white drop-shadow-sm">
                  {formatStatus(status)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Alternative horizontal stacked bar visualization
export function ProbabilityStackedBar({
  probabilities,
  highlightedStatus,
  className = '',
}: Pick<ProbabilityBarsProps, 'probabilities' | 'highlightedStatus' | 'className'>) {
  const sortedProbabilities = Object.entries(probabilities)
    .sort(([, a], [, b]) => b - a)
    .map(([status, probability]) => ({
      status: status as ReefStatus,
      probability,
      isHighlighted: status === highlightedStatus,
    }));

  return (
    <div className={className}>
      {/* Stacked bar */}
      <div className="h-6 rounded-full overflow-hidden flex">
        {sortedProbabilities.map(({ status, probability }) => {
          const color = STATUS_COLORS[status] || '#888';
          return (
            <div
              key={status}
              className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${probability * 100}%`,
                backgroundColor: color,
              }}
              title={`${formatStatus(status)}: ${(probability * 100).toFixed(1)}%`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-3">
        {sortedProbabilities.map(({ status, probability, isHighlighted }) => {
          const color = STATUS_COLORS[status] || '#888';
          return (
            <div key={status} className="flex items-center space-x-1.5">
              <div
                className={cn('w-3 h-3 rounded-full', isHighlighted && 'ring-2 ring-offset-1')}
                style={{
                  backgroundColor: color,
                  boxShadow: isHighlighted ? `0 0 0 2px #1a1714, 0 0 0 4px ${color}` : undefined
                }}
              />
              <span
                className="text-xs"
                style={{
                  color: isHighlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isHighlighted ? 600 : 400,
                }}
              >
                {formatStatus(status)} ({(probability * 100).toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
