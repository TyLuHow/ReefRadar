'use client';

import { Play, Pause, Square } from 'lucide-react';
import { GlassPanel, GlassButton } from '@/components/ui/glass';
import { cn } from '@/lib/utils';
import { BANDS, BAND_IDS } from '@/components/spectrogram/FrequencyBands';
import type { BandId } from '@/components/spectrogram/FrequencyBands';
import type { AnalysisResult } from '@/types';
import { formatStatus } from '@/lib/utils';
import { STATUS_COLORS } from '@/types';

interface AudioPlaybackControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activeBands: Set<'low' | 'mid' | 'high'>;
  toggleBand: (band: 'low' | 'mid' | 'high') => void;
}

interface ControlsPanelProps {
  analysisData: AnalysisResult;
  audioPlayback?: AudioPlaybackControls | null;
  onCompare?: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ControlsPanel({
  analysisData,
  audioPlayback,
  onCompare,
}: ControlsPanelProps) {
  const classification = analysisData.classification;
  if (!classification) return null;

  const statusColor = STATUS_COLORS[classification.label] || '#a8a29e';
  const confidence = (classification.confidence * 100).toFixed(1);

  return (
    <GlassPanel className="p-6 space-y-6">
      {/* Health verdict */}
      <div>
        <p className="mono mb-2">Classification</p>
        <h2
          className="text-3xl font-light"
          style={{ color: statusColor }}
        >
          {formatStatus(classification.label)}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {confidence}% confidence
        </p>
      </div>

      {/* Playback controls */}
      {audioPlayback && (
        <div className="space-y-3">
          <p className="mono">Playback</p>
          <div className="flex items-center gap-3">
            <button
              onClick={audioPlayback.isPlaying ? audioPlayback.pause : audioPlayback.play}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full',
                'border border-ochre/50 text-ochre hover:bg-ochre/10',
              )}
              aria-label={audioPlayback.isPlaying ? 'Pause' : 'Play'}
            >
              {audioPlayback.isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4 ml-0.5" />
              )}
            </button>
            <button
              onClick={audioPlayback.stop}
              className={cn(
                'flex items-center justify-center w-10 h-10 rounded-full',
                'border border-white/10 text-bone/60 hover:bg-white/5',
              )}
              aria-label="Stop"
            >
              <Square className="w-3 h-3" />
            </button>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              {formatTime(audioPlayback.currentTime)} / {formatTime(audioPlayback.duration)}
            </span>
          </div>

          {/* Band toggles */}
          <div className="flex gap-2">
            {BAND_IDS.map((id: BandId) => {
              const band = BANDS[id];
              const active = audioPlayback.activeBands.has(id);
              return (
                <button
                  key={id}
                  onClick={() => audioPlayback.toggleBand(id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs border transition-all',
                    active
                      ? 'border-current bg-white/5'
                      : 'border-white/10 opacity-40',
                  )}
                  style={{ color: band.color }}
                >
                  {band.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Compare button */}
      {onCompare && (
        <GlassButton onClick={onCompare} className="w-full">
          Compare with Demo Reefs
        </GlassButton>
      )}
    </GlassPanel>
  );
}
