'use client';

import { useMemo } from 'react';
import { useReferenceSites } from '@/features/contract';
import {
  SPECTROGRAM_SPEC,
  formatDb,
  useClipSpectrogram,
  type ClipSpectrogram,
  type SpectrogramCaption,
  type SpectrogramState,
  type TransportClip,
} from '@/features/instrument';
import { getExcerpt, type AudioExcerpt } from '@/lib/audio-manifest';

/**
 * The one real recording the time-aligned fixtures play and draw: the committed 30 s, 16 kHz MARRS
 * excerpt of ind_H1 (CC BY 4.0). Shared by the Transport, WindowStrip and BandToggle sections so
 * each reads the same manifest record, the same caption and the same loading and error handling.
 * The dataset name comes from the contract's own site record; the description is metadata only
 * (duration, rate, RMS level from the manifest). Nothing here is synthetic.
 */

export const FIXTURE_EXCERPT_ID = 'ind_H1_20220830_120000';
export const FIXTURE_EXCERPT: AudioExcerpt = getExcerpt(FIXTURE_EXCERPT_ID);
/** Id the audio engine knows the clip by. */
export const FIXTURE_CLIP_ID = FIXTURE_EXCERPT.site_id;

export function describeFixtureClip(): string {
  const rate = Number((FIXTURE_EXCERPT.sample_rate_hz / 1000).toFixed(3));
  const level = FIXTURE_EXCERPT.rms_dbfs === undefined ? '' : `, RMS level ${formatDb(FIXTURE_EXCERPT.rms_dbfs)} dBFS (from the audio manifest)`;
  return `${FIXTURE_EXCERPT.duration_s} s excerpt at ${rate} kHz${level}.`;
}

export interface FixtureClip {
  excerpt: AudioExcerpt;
  clip: ClipSpectrogram;
  caption: SpectrogramCaption | undefined;
  description: string;
  /** The clip or the contract failed to load. */
  failed: boolean;
  /** Still loading the clip or the caption. */
  waiting: boolean;
  /** The Spectrogram `state` that matches: loading, error, or undefined once drawn. */
  wellState: SpectrogramState | undefined;
  /** The clip for `useTransport`; empty until the recording has loaded. */
  transportClips: TransportClip[];
}

export function useFixtureClip(): FixtureClip {
  const clip = useClipSpectrogram(FIXTURE_EXCERPT.url_path);
  const sites = useReferenceSites();
  const dataset = sites.data?.find((site) => site.site_id === FIXTURE_EXCERPT.site_id)?.dataset_name;

  const caption = useMemo<SpectrogramCaption | undefined>(
    () =>
      dataset === undefined
        ? undefined
        : {
            siteId: FIXTURE_EXCERPT.site_id,
            dataset,
            recordedAt: FIXTURE_EXCERPT.recorded_at_recorder_clock,
            durationS: FIXTURE_EXCERPT.duration_s,
            sampleRateHz: FIXTURE_EXCERPT.sample_rate_hz,
            fftSize: SPECTROGRAM_SPEC.fftSize,
          },
    [dataset],
  );

  const failed = clip.status === 'error' || (sites.error !== null && sites.error !== undefined);
  const waiting = clip.status !== 'ready' || caption === undefined;

  const { buffer, samples, sampleRate } = clip;
  const transportClips = useMemo<TransportClip[]>(
    () => (buffer && samples && sampleRate ? [{ id: FIXTURE_CLIP_ID, buffer, durationS: samples.length / sampleRate }] : []),
    [buffer, samples, sampleRate],
  );

  return {
    excerpt: FIXTURE_EXCERPT,
    clip,
    caption,
    description: describeFixtureClip(),
    failed,
    waiting,
    wellState: failed ? 'error' : waiting ? 'loading' : undefined,
    transportClips,
  };
}
