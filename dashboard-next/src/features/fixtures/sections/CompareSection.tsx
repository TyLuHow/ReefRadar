'use client';

import { useMemo } from 'react';
import { useReferenceSites } from '@/features/contract';
import {
  CompareDeck,
  SPECTROGRAM_SPEC,
  computeSpectrogram,
  useClipSpectrogram,
  type CompareRowData,
  type SpectrogramCaption,
  type SpectrogramSpec,
  type TransportClip,
} from '@/features/instrument';
import { attributionLine, getExcerpt, type AudioExcerpt } from '@/lib/audio-manifest';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';
import { excerptIdentity } from '../parts/excerptIdentity';

/**
 * CompareRow and CompareDeck (DS-05, 04-16): two real MARRS recordings from one location, the healthy
 * ind_H1 as A and the degraded ind_D1 as B (the manifest's own healthy_vs_degraded pair), on one
 * colour scale with a shared playhead and an A/B crossfader. Every label, definition, assigner, time
 * and RMS level is read from the manifest and the contract; nothing is typed here. The live cell
 * plays both recordings (nothing starts until a press); the other cells are drawn states and say
 * when one is forced. The DIFFERENT SCALES cell computes the B spectrogram of the same real audio
 * with a different hop, to show the state that stops the deck from rescaling anything.
 */

export const COMPARE_META: FixtureSectionMeta = {
  slug: 'compare',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'CompareRow and CompareDeck',
  contract:
    'Two real recordings on one fixed colour scale, with one shared playhead and one equal-power A/B crossfader. If the analysis settings differ, the deck says so and rescales neither well. Playback levels are matched to the quieter clip by attenuation only, and the deck says that original levels differ. Each row shows who assigned its label and what it means.',
  data: 'public/audio/marrs/ind_H1_20220830_120000.wav and ind_D1_20220830_120000.wav through data/audio-manifest.json (url_path, recorded_at_recorder_clock, rms_dbfs, label_original, label_definition, label_assigned_by, sample_rate_hz, duration_s); dataset_name from contract sites.json (ind_H1, ind_D1) through useReferenceSites; levels and gains computed from rms_dbfs; the DIFFERENT SCALES cell recomputes ind_D1 with hop 512',
};

const H1 = getExcerpt('ind_H1_20220830_120000');
const D1 = getExcerpt('ind_D1_20220830_120000');
const PLAYING_AT = 12.4;

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

interface CompareFixture {
  /** The two rows as the page knows them now: drawn once both clips have loaded, loading or error before. */
  rows: CompareRowData[];
  clips: TransportClip[];
  /** ind_D1 recomputed with a different hop, for the DIFFERENT SCALES cell (absent until it has loaded). */
  coarseRows: CompareRowData[] | undefined;
  ready: boolean;
}

function useCompareFixture(): CompareFixture {
  const a = useClipSpectrogram(H1.url_path);
  const b = useClipSpectrogram(D1.url_path);
  const sites = useReferenceSites();
  const datasetOf = (siteId: string) => sites.data?.find((site) => site.site_id === siteId)?.dataset_name;

  const identityA = excerptIdentity(H1);
  const identityB = excerptIdentity(D1);
  const failed = sites.error !== null && sites.error !== undefined;

  const row = (slot: 'A' | 'B', excerpt: AudioExcerpt, clip: typeof a): CompareRowData => {
    const identity = slot === 'A' ? identityA : identityB;
    if (clip.status === 'error' || failed) return { slot, identity, state: 'error' };
    // A missing dataset name is still loading: a well without its caption would show the recording with no provenance.
    if (clip.status !== 'ready' || datasetOf(excerpt.site_id) === undefined) return { slot, state: 'loading' };
    return { slot, identity, matrix: clip.matrix, caption: captionFor(excerpt, datasetOf(excerpt.site_id)) };
  };

  const rows = [row('A', H1, a), row('B', D1, b)];

  const clips = useMemo<TransportClip[]>(() => {
    const out: TransportClip[] = [];
    if (a.buffer && a.samples && a.sampleRate) out.push({ id: H1.site_id, buffer: a.buffer, durationS: a.samples.length / a.sampleRate });
    if (b.buffer && b.samples && b.sampleRate) out.push({ id: D1.site_id, buffer: b.buffer, durationS: b.samples.length / b.sampleRate });
    return out;
  }, [a.buffer, a.samples, a.sampleRate, b.buffer, b.samples, b.sampleRate]);

  const coarse = useMemo(() => {
    if (!b.samples || !b.sampleRate) return undefined;
    // Real audio, different analysis settings: the same ind_D1 samples with hop 512 instead of 256.
    return computeSpectrogram(b.samples, b.sampleRate, { ...SPECTROGRAM_SPEC, hop: 512 } as unknown as SpectrogramSpec);
  }, [b.samples, b.sampleRate]);

  const ready = a.status === 'ready' && b.status === 'ready' && !failed && sites.data !== undefined;
  const coarseRows = ready && coarse ? [rows[0], { ...rows[1], matrix: coarse }] : undefined;

  return { rows, clips, coarseRows, ready };
}

const noop = () => undefined;

export function CompareSection() {
  const { rows, clips, coarseRows, ready } = useCompareFixture();
  const [a, b] = rows;
  const ident = (row: CompareRowData) => row.identity;

  return (
    <FixtureSection {...COMPARE_META}>
      <StateCell
        primitive="compare"
        state="default"
        span="full"
        note="The real recordings. Press Play both, or use the crossfader (arrows move 5, PageUp and PageDown move 20). Nothing plays until a press."
      >
        <CompareDeck rows={rows} clips={clips} onRetry={() => window.location.reload()} />
      </StateCell>
      <StateCell primitive="compare" state="hover" forced span="full" note="Hover is drawn on the identity blocks (panel-hover behind them only).">
        <CompareDeck rows={rows} clips={clips} forcedRowState="hover" />
      </StateCell>
      <StateCell primitive="compare" state="focus" forced span="full" note="Focus is drawn on the slot buttons. The row itself is not a tab stop.">
        <CompareDeck rows={rows} clips={clips} forcedRowState="focus" />
      </StateCell>
      <StateCell primitive="compare" state="selected" span="full" note="B is the listening focus: a 3 px ink bar on its start edge, and the mix is at B alone.">
        <CompareDeck rows={rows} clips={clips} defaultListening="B" defaultMix={1} />
      </StateCell>
      <StateCell primitive="compare" state="playing" forced span="full" note={`Position forced at ${PLAYING_AT} s of ${H1.duration_s.toFixed(1)} s; the transport in this cell does nothing.`}>
        <CompareDeck rows={rows} clips={clips} forcedPlaying={{ positionS: PLAYING_AT }} />
      </StateCell>
      <StateCell primitive="compare" state="disabled-row" span="full" note="Row B is unavailable: its identity stays, the well is replaced, and playing is off.">
        <CompareDeck rows={[a, { slot: 'B', identity: ident(b) ?? excerptIdentity(D1), state: 'disabled' }]} clips={clips} />
      </StateCell>
      <StateCell primitive="compare" state="loading" span="full">
        <CompareDeck rows={[{ slot: 'A', state: 'loading' }, { slot: 'B', state: 'loading' }]} clips={[]} />
      </StateCell>
      <StateCell primitive="compare" state="empty-slot" span="full" note="A third slot with nothing in it.">
        <CompareDeck rows={[a, b, { slot: 'C', state: 'empty' }]} clips={clips} onAdd={noop} />
      </StateCell>
      <StateCell primitive="compare" state="error-row" forced span="full" note="Row B forced into its error state (the recording itself loaded).">
        <CompareDeck rows={[a, { slot: 'B', identity: ident(b) ?? excerptIdentity(D1), state: 'error' }]} clips={clips} onRetry={noop} onRemove={noop} />
      </StateCell>
      <StateCell
        primitive="compare"
        state="different-scales"
        forced
        span="full"
        note="Forced: row B's spectrogram is recomputed from the same real audio with hop 512 instead of 256, so the two no longer share analysis settings."
      >
        {ready && coarseRows ? <CompareDeck rows={coarseRows} clips={clips} /> : <CompareDeck rows={[{ slot: 'A', state: 'loading' }, { slot: 'B', state: 'loading' }]} clips={[]} />}
      </StateCell>
      <p className="col-span-full text-small text-muted [overflow-wrap:anywhere]">{`Audio: ${attributionLine()}`}</p>
    </FixtureSection>
  );
}
