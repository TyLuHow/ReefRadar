'use client';

import { useEffect, useRef, useState } from 'react';
import { useReferenceSites } from '@/features/contract';
import {
  AccentBlock,
  AttributionFooter,
  BandSection,
  Spectrogram,
  Stat,
  StatusBand,
  Transport,
  useTransport,
  type SpectrogramHandle,
} from '@/features/instrument';
import { ErrorState, LinkButton, LoadingState, Skeleton } from '@/features/ui';
import { allExcerpts } from '@/lib/audio-manifest';
import { CompositionFrame, CompositionHeader } from '../parts/CompositionFrame';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { FIXTURE_EXCERPT, useFixtureClip } from '../parts/useFixtureClip';
import { LiveCard } from './ClipCardSection';

/**
 * Listen, the front door (04-21, the second accepted board): the expressive register. A full-bleed
 * band carries the eyebrow, the display headline, a large Transport and the hero spectrogram of one
 * real recording (the ind_H1 excerpt); below, on the ground, the other eight real excerpts as cards,
 * one accent block, two very large numerals and the proportion band of habitat statuses.
 *
 * Nothing is typed that data could say: the site and country counts and the status proportions are
 * computed from the contract sites, the cards are the committed excerpts, and the recording's facts
 * are in the spectrogram's caption. One accent block only (the direction allows one; the Poster
 * direction allows three). Nothing plays until a press, and starting one recording stops another.
 */

export const COMPOSITION_LISTEN_META: FixtureSectionMeta = {
  slug: 'composition-listen',
  group: 'Composition',
  kind: 'Listen',
  title: 'Listen: front door',
  contract:
    'The expressive register on real data: a band with the headline, a large transport and a hero spectrogram of one real recording; the other real excerpts as cards; one accent block; two numerals and the status proportions, all computed from the contract. Nothing plays until a press.',
  data: 'public/audio/marrs/ind_H1_20220830_120000.wav and the eight other excerpts through data/audio-manifest.json (url_path, recorded_at_recorder_clock, label, sample_rate_hz, duration_s); contract sites.json through useReferenceSites (counts, status, location_label, dataset_name); src/data/citations.json (attribution)',
};

const HERO_ID = 'hero';
const OTHER_EXCERPTS = allExcerpts().filter((excerpt) => excerpt.site_id !== FIXTURE_EXCERPT.site_id);

function HeroBand({ activeId, onActivate }: { activeId: string | null; onActivate: (id: string) => void }) {
  const fixture = useFixtureClip();
  const wellRef = useRef<SpectrogramHandle>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const transport = useTransport({ clips: fixture.transportClips, wells: [wellRef], observe: observeRef });
  const { status, playPause } = transport;
  const displayStatus = fixture.failed ? 'error' : fixture.waiting ? 'loading' : status;

  // Another recording started: the hero stops.
  useEffect(() => {
    if (activeId !== null && activeId !== HERO_ID && status === 'playing') playPause();
  }, [activeId, status, playPause]);

  return (
    <>
      <BandSection eyebrow="A real recording · nothing synthetic" headline="This is what a reef sounds like." headingLevel={3} className="px-(--gutter) pt-10 pb-6" />
      <BandSection as="div" className="pb-8">
        <div ref={observeRef} className="flex flex-col gap-8">
          <div className="px-(--gutter)">
            <Transport
              size="large"
              tone="band"
              status={displayStatus}
              position={transport.positionS}
              duration={transport.durationS || fixture.excerpt.duration_s}
              onPlayPause={() => {
                onActivate(HERO_ID);
                playPause();
              }}
              onStep={transport.step}
              onSeek={transport.seek}
              onRetry={() => window.location.reload()}
              playLabel="Play"
              showScrub
            />
          </div>
          <Spectrogram
            ref={wellRef}
            variant="hero"
            source={fixture.clip.matrix}
            description={fixture.description}
            caption={fixture.caption}
            state={fixture.wellState}
            onScrub={transport.seek}
          />
        </div>
      </BandSection>
    </>
  );
}

function Lower() {
  const sites = useReferenceSites();
  const [activeId, setActiveId] = useState<string | null>(null);

  const countries = sites.data === undefined ? undefined : new Set(sites.data.map((site) => site.country)).size;

  return (
    <>
      <HeroBand activeId={activeId} onActivate={setActiveId} />

      <div className="px-(--gutter) py-12">
        <h3 className="type-display text-h2">Now hear the reef next door.</h3>
        <div className="mt-8 grid gap-6 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {OTHER_EXCERPTS.map((excerpt) => (
            <LiveCard key={excerpt.excerpt_id} excerpt={excerpt} activeId={activeId} onActivate={setActiveId} />
          ))}
        </div>
      </div>

      <div className="px-(--gutter) pb-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <AccentBlock
            lead="Have a recording of your own?"
            sentence="Place it among labelled reference recordings to hear how it compares."
            action={
              <LinkButton variant="inverse" tone="accent" href="#place-a-recording">
                Place a recording
              </LinkButton>
            }
          />
          <div className="flex flex-col justify-center gap-8">
            {sites.error !== null && sites.error !== undefined ? (
              <ErrorState announce="status" title="The contract could not be loaded." body="Reload the page to try again." />
            ) : sites.data === undefined || countries === undefined ? (
              <LoadingState label="Loading counts…">
                <Skeleton on="ground" className="h-24 w-full" />
              </LoadingState>
            ) : (
              <>
                <Stat value={sites.data.length} label="reference sites" />
                <Stat value={countries} label={countries === 1 ? 'country' : 'countries'} />
              </>
            )}
          </div>
        </div>
        <div className="mt-10">
          <StatusBand items={sites.data ?? []} statusOf={(site) => site.status} state={sites.data === undefined ? 'loading' : 'default'} />
        </div>
      </div>
    </>
  );
}

export function CompositionListen() {
  return (
    <FixtureSection {...COMPOSITION_LISTEN_META}>
      <CompositionFrame slug="composition-listen">
        <div className="px-(--gutter) pt-6">
          <CompositionHeader current="Listen" />
        </div>
        <Lower />
        <AttributionFooter className="border-rule border-t px-(--gutter) py-4" />
      </CompositionFrame>
    </FixtureSection>
  );
}
