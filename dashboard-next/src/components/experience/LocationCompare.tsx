'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Play, Pause, ArrowLeft, MapPin } from 'lucide-react';
import { GlassPanel, GlassButton } from '@/components/ui/glass';
import { BANDS, BAND_IDS } from '@/components/spectrogram/FrequencyBands';
import { CaveatsFooter } from './CaveatsFooter';
import { useLocationAudio, HealthStatus } from './useLocationAudio';
import { useVitalityStore } from '@/stores/vitality-store';

const SpectrogramCanvas = dynamic(
  () => import('@/components/spectrogram/SpectrogramCanvas'),
  { ssr: false },
);

interface LocationCompareProps {
  onGoLanding: () => void;
  onGoDemo: () => void;
}

const STATUS_LABELS: Record<HealthStatus, string> = {
  degraded: 'Degraded',
  restored_early: 'Early Restoration',
  restored_mid: 'Mid Restoration',
  healthy: 'Healthy',
};

const STATUS_SHORT: Record<HealthStatus, string> = {
  degraded: 'D',
  restored_early: 'N',
  restored_mid: 'R',
  healthy: 'H',
};

const STATUS_COLORS: Record<HealthStatus, string> = {
  degraded: '#c08081',
  restored_early: '#d4a574',
  restored_mid: '#b8a078',
  healthy: '#cd853f',
};

const VITALITY_MAP: Record<HealthStatus, number> = {
  healthy: 1.0,
  restored_mid: 0.7,
  restored_early: 0.4,
  degraded: 0.0,
};

function crossfadeToVitality(
  crossfade: number,
  leftTrack: HealthStatus,
  rightTrack: HealthStatus
): number {
  const leftV = VITALITY_MAP[leftTrack];
  const rightV = VITALITY_MAP[rightTrack];
  return leftV + (rightV - leftV) * crossfade;
}

/** Ordered from degraded to healthy for the state selector bar */
const STATUS_ORDER: HealthStatus[] = [
  'degraded',
  'restored_early',
  'restored_mid',
  'healthy',
];

const STATUS_DESCRIPTIONS: Record<HealthStatus, string> = {
  healthy: 'Rich dusk chorus with fish calls (low), grazing parrotfish (mid), and snapping shrimp (high-frequency clicks).',
  degraded: 'Notably quieter across all bands. Fewer fish calls, reduced shrimp activity, less biotic complexity.',
  restored_early: 'Early-stage restoration site. Initial signs of acoustic recovery with some returning species.',
  restored_mid: 'Mid-stage restoration. Increasing biodiversity signals compared to degraded sites.',
};

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function LocationCompare({ onGoLanding, onGoDemo }: LocationCompareProps) {
  const audio = useLocationAudio();
  const setVitality = useVitalityStore(s => s.setVitality);

  // Set vitality when tracks change (reflects initial crossfade=0 state)
  useEffect(() => {
    setVitality(
      crossfadeToVitality(audio.crossfade, audio.leftTrack, audio.rightTrack),
      'crossfader'
    );
  }, [audio.leftTrack, audio.rightTrack, setVitality]);

  // Reset vitality on unmount
  useEffect(() => {
    return () => {
      useVitalityStore.getState().setVitality(0, 'default');
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Background spectrogram */}
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas
          state={audio.isPlaying ? 'playing' : 'idle'}
          activeBands={audio.activeBands}
          audioAnalyser={audio.analyserNode}
          opacity={0.25}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4">
        <GlassButton variant="ghost" href="/">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </GlassButton>
        <div className="flex items-center gap-2">
          <span className="text-sm font-light text-bone">ReefRadar</span>
          <span className="w-2 h-2 rounded-full bg-ochre" />
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-6 px-6 pb-6 overflow-auto">
        {/* Left panel: controls */}
        <GlassPanel className="lg:w-96 flex-shrink-0 p-6 space-y-5">
          <p className="mono">Compare Locations</p>

          {/* Location selector pills */}
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Location</p>
            <div className="flex flex-wrap gap-2">
              {audio.locations.map((loc) => {
                const isSelected = audio.selectedLocation?.id === loc.id;
                return (
                  <button
                    key={loc.id}
                    onClick={() => audio.setSelectedLocation(loc.id)}
                    className={`relative px-3 py-1.5 rounded-full text-xs border transition-all ${
                      isSelected
                        ? 'ring-2 ring-ochre border-ochre text-ochre bg-ochre/10'
                        : 'border-white/10 text-bone/50 hover:border-white/20 hover:text-bone/70'
                    }`}
                  >
                    {loc.name}
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${
                        isSelected ? 'bg-ochre/20 text-ochre' : 'bg-white/5 text-bone/40'
                      }`}
                    >
                      {loc.available.length}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Health state selector bar */}
          {audio.selectedLocation && (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Health States
                <span className="ml-1 text-bone/30">
                  (select two to compare)
                </span>
              </p>
              <div className="flex gap-1.5">
                {STATUS_ORDER.map((status) => {
                  const available = audio.selectedLocation!.available.includes(status);
                  const isLeft = audio.leftTrack === status;
                  const isRight = audio.rightTrack === status;

                  return (
                    <button
                      key={status}
                      disabled={!available}
                      onClick={() => {
                        if (!available) return;
                        if (isLeft || isRight) return; // Already selected
                        // Shift: right becomes left, new becomes right
                        audio.setLeftTrack(audio.rightTrack);
                        audio.setRightTrack(status);
                      }}
                      className={`flex-1 px-2 py-2 rounded-lg text-xs text-center transition-all ${
                        !available
                          ? 'opacity-20 cursor-not-allowed border border-white/5'
                          : isLeft
                            ? 'border-2 bg-ochre/10'
                            : isRight
                              ? 'border-2 bg-dusty-rose/10'
                              : 'border border-white/10 hover:border-white/20 text-bone/60 hover:text-bone/80'
                      }`}
                      style={{
                        borderColor: isLeft
                          ? '#cd853f'
                          : isRight
                            ? '#c08081'
                            : undefined,
                        color: available
                          ? isLeft
                            ? '#cd853f'
                            : isRight
                              ? '#c08081'
                              : undefined
                          : undefined,
                      }}
                    >
                      <div className="font-medium">{STATUS_LABELS[status]}</div>
                      {(isLeft || isRight) && (
                        <div className="text-[10px] mt-0.5 opacity-70">
                          {isLeft ? 'Left' : 'Right'}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Playback controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={audio.handlePlayPause}
              disabled={!audio.selectedLocation}
              className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-ochre text-ochre hover:bg-ochre/10 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={audio.isPlaying ? 'Pause' : 'Play'}
            >
              {audio.isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {formatTime(audio.currentTime)} / {formatTime(audio.duration)}
            </span>
            {audio.loadState === 'loading' && (
              <span className="text-xs text-ochre/60 animate-pulse">Loading...</span>
            )}
          </div>

          {/* Crossfade slider */}
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Crossfade</p>
            <div className="flex items-center gap-3">
              <span className="text-xs min-w-[80px] text-right" style={{ color: STATUS_COLORS[audio.leftTrack], opacity: 0.4 + 0.6 * (1 - audio.crossfade) }}>
                {STATUS_LABELS[audio.leftTrack]}
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audio.crossfade}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  audio.setCrossfade(v);
                  setVitality(
                    crossfadeToVitality(v, audio.leftTrack, audio.rightTrack),
                    'crossfader'
                  );
                }}
                className="flex-1 vitality-slider"
              />
              <span className="text-xs min-w-[80px]" style={{ color: STATUS_COLORS[audio.rightTrack], opacity: 0.4 + 0.6 * audio.crossfade }}>
                {STATUS_LABELS[audio.rightTrack]}
              </span>
            </div>
          </div>

          {/* Frequency band toggles */}
          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Frequency Bands</p>
            <div className="flex flex-wrap gap-2">
              {BAND_IDS.map((id) => {
                const band = BANDS[id];
                const active = audio.activeBands.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => audio.toggleBand(id)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                      active ? 'border-current bg-white/5' : 'border-white/10 opacity-40'
                    }`}
                    style={{ color: band.color }}
                  >
                    {band.label}
                  </button>
                );
              })}
            </div>
          </div>
        </GlassPanel>

        {/* Right panel: info */}
        <GlassPanel className="flex-1 p-6 space-y-5">
          <p className="mono">What You Are Hearing</p>

          {audio.selectedLocation ? (
            <div className="space-y-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {/* Location info */}
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 text-ochre flex-shrink-0" />
                <div>
                  <span className="text-bone font-medium">{audio.selectedLocation.name}</span>
                  <span className="mx-1 text-bone/30">&middot;</span>
                  <span>{audio.selectedLocation.region}</span>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                    {audio.selectedLocation.description}
                  </p>
                </div>
              </div>

              {/* Track descriptions */}
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <span
                    className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[audio.leftTrack] }}
                  />
                  <p>
                    <span className="text-bone font-medium">
                      {STATUS_LABELS[audio.leftTrack]}
                    </span>
                    {' -- '}
                    {STATUS_DESCRIPTIONS[audio.leftTrack]}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span
                    className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[audio.rightTrack] }}
                  />
                  <p>
                    <span className="text-bone font-medium">
                      {STATUS_LABELS[audio.rightTrack]}
                    </span>
                    {' -- '}
                    {STATUS_DESCRIPTIONS[audio.rightTrack]}
                  </p>
                </div>
              </div>

              <p style={{ color: 'var(--text-dim)' }}>
                Use the crossfade slider to blend between the two recordings. Toggle frequency
                bands to isolate specific organisms. The spectrogram in the background visualizes
                amplitude across the three frequency ranges in real time.
              </p>

              <div className="pt-1 border-t border-white/5">
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Available states at {audio.selectedLocation.name}:{' '}
                  {audio.selectedLocation.available.map((s) => STATUS_LABELS[s]).join(', ')}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <p>Select a location above to begin comparing reef health recordings.</p>
              <p className="mt-2" style={{ color: 'var(--text-dim)' }}>
                Audio from MARRS (Mars Assisted Reef Restoration System) sites across 5 countries.
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <GlassButton onClick={onGoDemo}>
              Fixed Demo (Healthy vs Degraded)
            </GlassButton>
            <GlassButton variant="ghost" onClick={onGoLanding}>
              Upload Your Own Recording
            </GlassButton>
          </div>
        </GlassPanel>
      </div>

      <div className="relative z-10 px-6">
        <CaveatsFooter />
      </div>
    </div>
  );
}
