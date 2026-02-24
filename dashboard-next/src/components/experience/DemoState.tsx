'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Play, Pause, ArrowLeft } from 'lucide-react';
import { GlassPanel, GlassButton } from '@/components/ui/glass';
import { BANDS, BAND_IDS, ALL_BANDS } from '@/components/spectrogram/FrequencyBands';
import type { BandId } from '@/components/spectrogram/FrequencyBands';
import { CaveatsFooter } from './CaveatsFooter';
import { useDemoAudio } from './useDemoAudio';

const SpectrogramCanvas = dynamic(
  () => import('@/components/spectrogram/SpectrogramCanvas'),
  { ssr: false }
);

interface DemoStateProps {
  onGoLanding: () => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function DemoState({ onGoLanding }: DemoStateProps) {
  const [activeTrack, setActiveTrack] = useState<'healthy' | 'degraded'>('healthy');
  const [activeBands, setActiveBands] = useState<Set<BandId>>(() => new Set(ALL_BANDS));

  const audio = useDemoAudio();

  function toggleBand(band: BandId) {
    setActiveBands((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }

  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="absolute inset-0 z-0">
        <SpectrogramCanvas
          state={audio.isPlaying ? 'playing' : 'idle'}
          activeBands={activeBands}
          audioAnalyser={audio.analyserNode}
          opacity={0.25}
        />
      </div>

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

      <div className="relative z-10 flex-1 flex flex-col lg:flex-row gap-6 px-6 pb-6 overflow-auto">
        {/* Left panel: playback controls */}
        <GlassPanel className="lg:w-80 flex-shrink-0 p-6 space-y-5">
          <p className="mono">Demo Playback</p>

          <div className="flex items-center gap-3">
            <button
              onClick={audio.handlePlayPause}
              className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-ochre text-ochre hover:bg-ochre/10"
              aria-label={audio.isPlaying ? 'Pause' : 'Play'}
            >
              {audio.isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {formatTime(audio.currentTime)} / {formatTime(audio.duration)}
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Active Track</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveTrack('healthy'); audio.setCrossfade(0); }}
                className={`px-3 py-1.5 rounded-full text-xs border ${
                  activeTrack === 'healthy'
                    ? 'border-ochre text-ochre bg-ochre/10'
                    : 'border-white/10 text-bone/50'
                }`}
              >
                Healthy
              </button>
              <button
                onClick={() => { setActiveTrack('degraded'); audio.setCrossfade(1); }}
                className={`px-3 py-1.5 rounded-full text-xs border ${
                  activeTrack === 'degraded'
                    ? 'border-dusty-rose text-dusty-rose bg-dusty-rose/10'
                    : 'border-white/10 text-bone/50'
                }`}
              >
                Degraded
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Crossfade</p>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: '#cd853f' }}>H</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={audio.crossfade}
                onChange={(e) => audio.setCrossfade(parseFloat(e.target.value))}
                className="flex-1 accent-ochre"
              />
              <span className="text-xs" style={{ color: '#c08081' }}>D</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Frequency Bands</p>
            <div className="flex gap-2">
              {BAND_IDS.map((id) => {
                const band = BANDS[id];
                const active = activeBands.has(id);
                return (
                  <button
                    key={id}
                    onClick={() => toggleBand(id)}
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
          <div className="space-y-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <p>
              These are real underwater recordings from the MARRS restoration project
              in South Sulawesi, Indonesia.
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#cd853f' }} />
                <p>
                  <span className="text-bone font-medium">Healthy reef</span> -- Rich with fish calls
                  (low frequency), grazing parrotfish (mid), and snapping shrimp (high-frequency clicks).
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#c08081' }} />
                <p>
                  <span className="text-bone font-medium">Degraded reef</span> -- Notably quieter across
                  all bands. Fewer fish calls, reduced shrimp activity, less biotic complexity.
                </p>
              </div>
            </div>
            <p style={{ color: 'var(--text-dim)' }}>
              Toggle frequency bands to isolate specific organisms. The spectrogram in the
              background visualizes amplitude across the three frequency ranges in real time.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <GlassButton onClick={onGoLanding}>
              Upload Your Own Recording
            </GlassButton>
            <GlassButton variant="ghost" href="/dashboard/map">
              Explore 44 Sites on Map
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
