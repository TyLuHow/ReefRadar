'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useReferenceSites } from '@/features/contract';
import {
  ClipCard,
  SPECTROGRAM_SPEC,
  useClipSpectrogram,
  useTransport,
  type ClipCardProps,
  type SpectrogramCaption,
  type SpectrogramHandle,
  type TransportClip,
} from '@/features/instrument';
import { STATUS_LABELS } from '@/features/ui';
import { allExcerpts, attributionLine, getExcerpt, type AudioExcerpt } from '@/lib/audio-manifest';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';
import { excerptStatus } from '../parts/excerptIdentity';

/**
 * ClipCard (DS-05, 04-16): all nine committed MARRS excerpts as cards. The place is the contract
 * site's `location_label`, the date is the manifest's recorder-clock date, and the status mark and its
 * label come from the manifest label (a reference label assigned by the dataset's authors, named on
 * every card). Each card in the grid plays its own recording on a press and pauses when another card
 * starts; nothing plays by itself. The other cells are drawn states on one real recording and say
 * when one is forced.
 */

export const CLIP_CARD_META: FixtureSectionMeta = {
  slug: 'clip-card',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'ClipCard',
  contract:
    'A thumbnail spectrogram, a play button named "Play {site_id}", the status mark and label inside a reference-label rule that names who assigned it, and "{place} · {recorded date}". The card is not a link; the site id would be, when a site page exists.',
  data: 'the nine excerpts of data/audio-manifest.json (url_path, recorded_at_recorder_clock, label status and label_assigned_by) under public/audio/marrs; location_label and dataset_name from contract sites.json through useReferenceSites; states are forced through props',
};

const noop = () => undefined;
const EXCERPTS = allExcerpts();
const SAMPLE = getExcerpt('ind_H1_20220830_120000');

function dateOf(excerpt: AudioExcerpt): string {
  return excerpt.recorded_at_recorder_clock.split('T')[0];
}

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

/** What the card shows about an excerpt, from the manifest and the contract; `waiting` until the contract has loaded. */
function useCardFacts(excerpt: AudioExcerpt) {
  const sites = useReferenceSites();
  const site = sites.data?.find((candidate) => candidate.site_id === excerpt.site_id);
  const status = excerptStatus(excerpt);
  const failed = sites.error !== null && sites.error !== undefined;
  return {
    failed,
    waiting: site === undefined && !failed,
    props: {
      siteId: excerpt.site_id,
      status,
      statusLabel: STATUS_LABELS[status],
      assignedBy: excerpt.label?.label_assigned_by,
      place: site?.location_label ?? '',
      recordedDate: dateOf(excerpt),
      caption: captionFor(excerpt, site?.dataset_name),
    } satisfies Omit<ClipCardProps, 'onPlay'>,
  };
}

/** One card that plays its own recording; `activeId` makes the others pause when another starts. */
export function LiveCard({ excerpt, activeId, onActivate }: { excerpt: AudioExcerpt; activeId: string | null; onActivate: (id: string) => void }) {
  const facts = useCardFacts(excerpt);
  const clip = useClipSpectrogram(excerpt.url_path);
  const wellRef = useRef<SpectrogramHandle>(null);
  const { buffer, samples, sampleRate } = clip;
  const clips = useMemo<TransportClip[]>(
    () => (buffer && samples && sampleRate ? [{ id: excerpt.site_id, buffer, durationS: samples.length / sampleRate }] : []),
    [buffer, samples, sampleRate, excerpt.site_id],
  );
  const transport = useTransport({ clips, wells: [wellRef] });
  const { status, playPause } = transport;

  // Another card started: this one stops.
  useEffect(() => {
    if (activeId !== excerpt.site_id && status === 'playing') playPause();
  }, [activeId, excerpt.site_id, status, playPause]);

  const state = clip.status === 'error' || facts.failed ? 'error' : clip.status !== 'ready' || facts.waiting ? 'loading' : undefined;
  return (
    <ClipCard
      {...facts.props}
      matrix={clip.matrix}
      wellRef={wellRef}
      isPlaying={status === 'playing'}
      state={state}
      onRetry={() => window.location.reload()}
      onPlay={() => {
        onActivate(excerpt.site_id);
        playPause();
      }}
    />
  );
}

/** A drawn state of one card on the real ind_H1 recording; its play button does nothing. */
function StaticCard({ state, forcedState, isPlaying }: Pick<ClipCardProps, 'state' | 'forcedState' | 'isPlaying'>) {
  const facts = useCardFacts(SAMPLE);
  const clip = useClipSpectrogram(SAMPLE.url_path);
  const waiting = clip.status !== 'ready' || facts.waiting;
  return <ClipCard {...facts.props} matrix={clip.matrix} state={state ?? (waiting ? 'loading' : undefined)} forcedState={forcedState} isPlaying={isPlaying} onPlay={noop} onRetry={noop} />;
}

export function ClipCardSection() {
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <FixtureSection {...CLIP_CARD_META}>
      <StateCell primitive="clip-card" state="default" span="full" note="All nine real excerpts. Press a play button to hear one; starting another stops it. Nothing plays until a press.">
        <div className="grid gap-6 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {EXCERPTS.map((excerpt) => (
            <LiveCard key={excerpt.excerpt_id} excerpt={excerpt} activeId={activeId} onActivate={setActiveId} />
          ))}
        </div>
      </StateCell>
      <StateCell primitive="clip-card" state="hover" forced note="Hover is drawn behind the text only.">
        <StaticCard forcedState="hover" />
      </StateCell>
      <StateCell primitive="clip-card" state="focus" forced note="Focus is drawn on the play button.">
        <StaticCard forcedState="focus" />
      </StateCell>
      <StateCell primitive="clip-card" state="playing" forced note="Drawn as playing; the button does nothing in this cell.">
        <StaticCard isPlaying />
      </StateCell>
      <StateCell primitive="clip-card" state="loading">
        <StaticCard state="loading" />
      </StateCell>
      <StateCell primitive="clip-card" state="error" forced note="Forced: the recording itself loaded.">
        <StaticCard state="error" />
      </StateCell>
      <p className="col-span-full text-small text-muted [overflow-wrap:anywhere]">{`Audio: ${attributionLine()}`}</p>
    </FixtureSection>
  );
}
