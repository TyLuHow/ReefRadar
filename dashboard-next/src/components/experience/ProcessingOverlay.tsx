'use client';

interface ProcessingOverlayProps {
  /** The real pipeline stage label from /status (D-15) -- never a scripted message. */
  stageLabel: string;
  detail?: string;
}

export function ProcessingOverlay({ stageLabel, detail }: ProcessingOverlayProps) {
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

      {/* Real stage text reported by /status (D-15) -- changes only when the stage changes */}
      <div className="text-center space-y-1">
        <p
          className="text-sm font-light tracking-wide"
          style={{ color: 'var(--text-secondary)' }}
        >
          {stageLabel}
        </p>
        {detail && (
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
