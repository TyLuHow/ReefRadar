'use client';

import { useMemo } from 'react';
import { useReferenceSites } from '@/features/contract';
import {
  SPECTROGRAM_SPEC,
  useClipSpectrogram,
  type CompareRowData,
  type SpectrogramCaption,
  type TransportClip,
} from '@/features/instrument';
import { getExcerpt, type AudioExcerpt } from '@/lib/audio-manifest';
import { excerptIdentity } from './excerptIdentity';

/**
 * Two real committed excerpts as CompareDeck rows and transport clips (04-21). The Motion section's
 * crossfade cell and the Compare composition share it. A is the healthy ind_H1 and B the degraded
 * ind_D1, the manifest's own healthy_vs_degraded pair, recorded at the same recorder-clock time.
 * Every label, definition, assigner, time and level is read from the manifest and the contract
 * (excerptIdentity); the dataset name in each caption is the contract site's own.
 */

export const COMPARE_A_EXCERPT_ID = 'ind_H1_20220830_120000';
export const COMPARE_B_EXCERPT_ID = 'ind_D1_20220830_120000';
export const COMPARE_A = getExcerpt(COMPARE_A_EXCERPT_ID);
export const COMPARE_B = getExcerpt(COMPARE_B_EXCERPT_ID);

function captionFor(excerpt: AudioExcerpt, dataset: string | undefined): SpectrogramCaption | undefined {
  if (dataset === undefined) return undefined;
  return {
    siteId: excerpt.site_id,
    dataset,
    recordedAt: excerpt.recorded_at_recorder_clock,
    durationS: excerpt.duration_s,
    sampleRateHz: excerpt.sample_rate_hz,
    fftSize: SPECTROGRAM_SPEC.fftSize,
  };
}

export interface CompareFixture {
  /** Drawn once both clips and the contract have loaded; loading or error rows before that. */
  rows: CompareRowData[];
  clips: TransportClip[];
  ready: boolean;
  failed: boolean;
  /** The decoded samples and rate of each clip, for band levels (absent until loaded). */
  a: { samples?: Float32Array; sampleRate?: number };
  b: { samples?: Float32Array; sampleRate?: number };
}

export function useCompareFixture(): CompareFixture {
  const a = useClipSpectrogram(COMPARE_A.url_path);
  const b = useClipSpectrogram(COMPARE_B.url_path);
  const sites = useReferenceSites();
  const datasetOf = (siteId: string) => sites.data?.find((site) => site.site_id === siteId)?.dataset_name;
  const failed = sites.error !== null && sites.error !== undefined;

  const row = (slot: 'A' | 'B', excerpt: AudioExcerpt, clip: typeof a): CompareRowData => {
    const identity = excerptIdentity(excerpt);
    if (clip.status === 'error' || failed) return { slot, identity, state: 'error' };
    // A missing dataset name is still loading: a well without its caption would show the recording with no provenance.
    if (clip.status !== 'ready' || datasetOf(excerpt.site_id) === undefined) return { slot, state: 'loading' };
    return { slot, identity, matrix: clip.matrix, caption: captionFor(excerpt, datasetOf(excerpt.site_id)) };
  };
  const rows = [row('A', COMPARE_A, a), row('B', COMPARE_B, b)];

  const clips = useMemo<TransportClip[]>(() => {
    const out: TransportClip[] = [];
    if (a.buffer && a.samples && a.sampleRate) out.push({ id: COMPARE_A.site_id, buffer: a.buffer, durationS: a.samples.length / a.sampleRate });
    if (b.buffer && b.samples && b.sampleRate) out.push({ id: COMPARE_B.site_id, buffer: b.buffer, durationS: b.samples.length / b.sampleRate });
    return out;
  }, [a.buffer, a.samples, a.sampleRate, b.buffer, b.samples, b.sampleRate]);

  return {
    rows,
    clips,
    ready: a.status === 'ready' && b.status === 'ready' && !failed && sites.data !== undefined,
    failed: a.status === 'error' || b.status === 'error' || failed,
    a: { samples: a.samples, sampleRate: a.sampleRate },
    b: { samples: b.samples, sampleRate: b.sampleRate },
  };
}
