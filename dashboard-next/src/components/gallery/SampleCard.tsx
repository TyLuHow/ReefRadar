'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Play, Pause } from 'lucide-react';
import { GlassPanel } from '@/components/ui/glass';
import type { Sample, ReefStatus } from '@/types';

const STATUS_BADGE: Record<ReefStatus, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'var(--status-healthy)' },
  degraded: { label: 'Degraded', color: 'var(--status-degraded)' },
  restored_early: { label: 'Early Restoration', color: 'var(--status-restoring-early)' },
  restored_mid: { label: 'Mid Restoration', color: 'var(--status-restoring-mid)' },
  unknown: { label: 'Unknown', color: 'var(--text-muted)' },
};

const CATEGORY_GLOW: Record<ReefStatus, string> = {
  healthy: '0 0 8px 2px hsla(175, 80%, 50%, 0.4)',
  restored_mid: '0 0 8px 2px hsla(175, 80%, 50%, 0.24)',
  restored_early: '0 0 8px 2px hsla(175, 80%, 50%, 0.12)',
  degraded: 'none',
  unknown: 'none',
};

interface SampleCardProps {
  sample: Sample;
  /** Currently playing sample ID from parent (only one plays at a time) */
  playingId: string | null;
  onPlay: (id: string) => void;
  onPause: () => void;
}

export function SampleCard({ sample, playingId, onPlay, onPause }: SampleCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const isPlaying = playingId === sample.id;
  const badge = STATUS_BADGE[sample.category] || STATUS_BADGE.unknown;

  const togglePlay = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio(sample.audio_url);
      audio.crossOrigin = 'anonymous';
      audioRef.current = audio;
      audio.addEventListener('timeupdate', () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      });
      audio.addEventListener('ended', () => {
        setProgress(0);
        onPause();
      });
    }

    if (isPlaying) {
      audioRef.current.pause();
      onPause();
    } else {
      audioRef.current.play();
      onPlay(sample.id);
    }
  }, [isPlaying, sample.audio_url, sample.id, onPlay, onPause]);

  // Pause when another card starts playing
  if (!isPlaying && audioRef.current && !audioRef.current.paused) {
    audioRef.current.pause();
  }

  return (
    <GlassPanel
      className="p-5 flex flex-col gap-3 w-72 flex-shrink-0 hover:border-[var(--glass-border-bright)]"
      style={{ boxShadow: CATEGORY_GLOW[sample.category] }}
    >
      {/* Header: badge + country */}
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full border"
          style={{ color: badge.color, borderColor: badge.color + '40' }}
        >
          {badge.label}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {sample.country}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-light text-bone leading-snug">{sample.name}</h3>

      {/* Description */}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {sample.description}
      </p>

      {/* Play button + progress */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors"
          style={{
            borderColor: badge.color,
            color: badge.color,
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${progress * 100}%`, background: badge.color }}
          />
        </div>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
          {sample.duration_seconds}s
        </span>
      </div>

      {/* Frequency highlights */}
      <div className="flex flex-wrap gap-1">
        {sample.frequency_highlights.map((h) => (
          <span
            key={h}
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--glass-bg)', color: 'var(--text-muted)' }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Analyze CTA */}
      <Link
        href={`/experience?sample=${sample.id}`}
        className="mt-auto text-center text-xs font-medium py-2 rounded-full border transition-colors hover:bg-ochre/10"
        style={{ borderColor: 'var(--glass-border-bright)', color: 'var(--text-primary)' }}
      >
        Analyze This
      </Link>
    </GlassPanel>
  );
}
