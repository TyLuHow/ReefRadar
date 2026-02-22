'use client';

interface FrequencyBand {
  name: string;
  minHz: number;
  maxHz: number;
  color: string;
}

const FREQUENCY_BANDS: FrequencyBand[] = [
  { name: 'Boat/Vessel Noise', minHz: 0, maxHz: 500, color: '#ff6b6b' },
  { name: 'Fish Vocalizations', minHz: 50, maxHz: 1000, color: '#00ffa3' },
  { name: 'Snapping Shrimp', minHz: 2000, maxHz: 16000, color: '#00e5ff' },
];

interface FrequencyBandLabelsProps {
  height?: number;
  sampleRate?: number;
  className?: string;
}

/**
 * Overlay component that renders annotated frequency band labels alongside
 * a spectrogram. Should be positioned absolutely over or beside a
 * SpectrogramCanvas of the same height.
 */
export function FrequencyBandLabels({
  height = 200,
  sampleRate = 44100,
  className,
}: FrequencyBandLabelsProps) {
  const nyquist = sampleRate / 2;
  const minLog = Math.log10(20);
  const maxLog = Math.log10(nyquist);

  function freqToY(hz: number): number {
    const clamped = Math.max(20, Math.min(nyquist, hz));
    const frac = (Math.log10(clamped) - minLog) / (maxLog - minLog);
    return (1 - frac) * height;
  }

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height,
        pointerEvents: 'none',
      }}
    >
      {FREQUENCY_BANDS.map((band) => {
        const yTop = freqToY(band.maxHz);
        const yBottom = freqToY(band.minHz);
        const bandHeight = yBottom - yTop;

        if (bandHeight < 4) return null;

        return (
          <div
            key={band.name}
            style={{
              position: 'absolute',
              top: yTop,
              left: 0,
              right: 0,
              height: bandHeight,
              borderTop: `1px solid ${band.color}55`,
              borderBottom: `1px solid ${band.color}55`,
              background: `${band.color}0d`,
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: 4,
                fontSize: 9,
                color: band.color,
                whiteSpace: 'nowrap',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                lineHeight: '12px',
              }}
            >
              {band.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
