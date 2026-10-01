'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Play, Pause } from 'lucide-react';
import { GlassPanel } from '@/components/ui/glass';
import { getExcerpt, attributionLine } from '@/lib/audio-manifest';
import { formatStatus } from '@/lib/utils';
import type { Sample, ReefStatus } from '@/types';

const STATUS_COLOR: Record<ReefStatus, string> = {
  healthy: 'var(--status-healthy)',
  degraded: 'var(--status-degraded)',
  restored_early: 'var(--status-restoring-early)',
  restored_mid: 'var(--status-restoring-mid)',
  unknown: 'var(--text-muted)',
};

/**
 * The dataset's own label_original for a sample, looked up in the audio
 * manifest by the sample's id (which is the manifest excerpt_id for every
 * manifest-derived sample). Falls back to a formatted status when the
 * manifest has no matching excerpt (01-18, D-17/TRUTH-07/09): this is a
 * reference label assigned by MARRS, never a model output.
 */
function referenceLabelFor(sample: Sample): string {
  try {
    return getExcerpt(sample.id).label?.label_original ?? formatStatus(sample.category);
  } catch {
    return formatStatus(sample.category);
  }
}


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
  const [playError, setPlayError] = useState(false);
  const isPlaying = playingId === sample.id;
  const badgeColor = STATUS_COLOR[sample.category] || STATUS_COLOR.unknown;
  const referenceLabel = referenceLabelFor(sample);

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
      // play() returns a promise that rejects for an expired presigned URL,
      // CORS failure or autoplay policy: only report "playing" once it resolves.
      setPlayError(false);
      audioRef.current
        .play()
        .then(() => onPlay(sample.id))
        .catch(() => {
          audioRef.current?.pause();
          setPlayError(true);
          onPause();
        });
    }
  }, [isPlaying, sample.audio_url, sample.id, onPlay, onPause]);

  // Pause when another card starts playing (an effect, not a side effect in render)
  useEffect(() => {
    if (!isPlaying && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // Stop and release the element if the card unmounts mid-playback
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <GlassPanel
      className="p-5 flex flex-col gap-3 w-72 flex-shrink-0 hover:border-[var(--glass-border-bright)]"
    >
      {/* Header: reference label badge + country */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full border bg-transparent"
          style={{
            color: badgeColor,
            // badgeColor is a var(--status-...) reference, so appending a hex
            // alpha would produce invalid CSS; mix with transparent instead.
            borderColor: `color-mix(in srgb, ${badgeColor} 50%, transparent)`,
          }}
          title="A reference label assigned by the dataset, not a model output"
        >
          Reference label: {referenceLabel} &middot; assigned by MARRS
        </span>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
          {sample.country}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-light text-bone leading-snug">{sample.name}</h3>

      {/* Description */}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {sample.description}
      </p>

      {/* Attribution */}
      <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
        {attributionLine()}
      </p>

      {/* Play button + progress */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors"
          style={{
            borderColor: badgeColor,
            color: badgeColor,
          }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg)' }}>
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${progress * 100}%`, background: badgeColor }}
          />
        </div>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
          {sample.duration_seconds}s
        </span>
      </div>
      {playError && (
        <p className="text-[10px]" role="alert" style={{ color: 'var(--text-muted)' }}>
          This recording could not be played (the link may have expired). Reload the page to try again.
        </p>
      )}

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
