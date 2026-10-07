'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { pairedSpec } from '@/features/charts';
import { useReferenceSites, type ContractSite } from '@/features/contract';
import { AttributionFooter, CompareDeck, bandMeanDb, haversineKm } from '@/features/instrument';
import { ErrorState, LoadingState, Skeleton } from '@/features/ui';
import { CompositionFrame, CompositionHeader, findSite } from '../parts/CompositionFrame';
import { compareHeadline, compareSubline } from '../parts/compositionCopy';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { COMPARE_A, COMPARE_B, useCompareFixture, type CompareFixture } from '../parts/useCompareFixture';

/**
 * Compare, two reefs (04-21, the third accepted board): the healthy ind_H1 and the degraded ind_D1,
 * recorded at the same recorder-clock time at one location. The headline's distance is the haversine
 * distance of the two contract sites' coordinates, the sub-line's date and time are the manifest's, the
 * deck is the kit CompareDeck on one fixed colour scale with a shared playhead and an A/B crossfader,
 * and "Where the two differ" is a paired StripPlot of mean band levels computed from the two real
 * recordings with the same STFT as the spectrograms (dB re full scale, uncalibrated). The paired plot
 * says it covers two recordings only; nothing here generalises from the pair.
 */

export const COMPOSITION_COMPARE_META: FixtureSectionMeta = {
  slug: 'composition-compare',
  group: 'Composition',
  kind: 'Compare',
  title: 'Compare: two reefs',
  contract:
    'Two real recordings from one location on one colour scale with one playhead and one crossfader, a headline whose distance is computed from the two sites\' coordinates, and a paired plot of band levels computed from the audio. Attribution closes the screen.',
  data: 'public/audio/marrs/ind_H1_20220830_120000.wav and ind_D1_20220830_120000.wav through data/audio-manifest.json (url_path, recorded_at_recorder_clock, rms_dbfs, label_original, label_definition, label_assigned_by); contract sites.json through useReferenceSites (ind_H1 and ind_D1 status, latitude, longitude, dataset_name); band levels by dsp/levels.ts bandMeanDb; src/data/citations.json (attribution)',
};

const StripPlot = dynamic(() => import('@/features/charts').then((module) => module.StripPlot), {
  ssr: false,
  loading: () => (
    <LoadingState label="Loading plot…">
      <Skeleton on="ground" className="h-[220px] w-full" />
    </LoadingState>
  ),
});

/** Band edges in Hz below the recording's top frequency; the last band ends at that frequency. */
const INNER_EDGES_HZ = [0, 1000, 4000] as const;

const khz = (hz: number) => String(Number((hz / 1000).toFixed(1)));

function PairedPlot({ siteA, siteB, fixture }: { siteA: ContractSite; siteB: ContractSite; fixture: CompareFixture }) {
  const { a, b } = fixture;
  const spec = useMemo(() => {
    if (!a.samples || !a.sampleRate || !b.samples || !b.sampleRate) return undefined;
    // Both clips share a sample rate (the deck refuses to compare anything else); the top band ends at its Nyquist.
    const nyquist = Math.min(a.sampleRate, b.sampleRate) / 2;
    const edges = [...INNER_EDGES_HZ.filter((hz) => hz < nyquist), nyquist];
    const bands = edges.slice(0, -1).map((low, index) => ({ label: `${khz(low)} to ${khz(edges[index + 1])} kHz`, lowHz: low, highHz: edges[index + 1] }));
    const levels = (samples: Float32Array, rate: number) => bands.map((band) => bandMeanDb(samples, rate, band.lowHz, band.highHz));
    return pairedSpec({
      a: { siteId: siteA.site_id, status: siteA.status, levels: levels(a.samples, a.sampleRate) },
      b: { siteId: siteB.site_id, status: siteB.status, levels: levels(b.samples, b.sampleRate) },
      bands: bands.map((band) => band.label),
      // The footnote states the shorter excerpt, so it can never overstate.
      durationS: Math.min(COMPARE_A.duration_s, COMPARE_B.duration_s),
    });
  }, [a.samples, a.sampleRate, b.samples, b.sampleRate, siteA, siteB]);

  return <StripPlot spec={spec} />;
}

function Body() {
  const sites = useReferenceSites();
  const fixture = useCompareFixture();
  const siteA = findSite(sites.data, COMPARE_A.site_id);
  const siteB = findSite(sites.data, COMPARE_B.site_id);

  if (sites.error !== null && sites.error !== undefined) {
    return (
      <ErrorState
        announce="status"
        title="The contract could not be loaded."
        body="Try again, or reload the page."
        onRetry={() => {
          void sites.refetch();
        }}
      />
    );
  }
  if (siteA === undefined || siteB === undefined) {
    return (
      <LoadingState label="Loading the contract…">
        <Skeleton on="ground" className="h-64 w-full" />
      </LoadingState>
    );
  }

  const km = haversineKm({ lat: siteA.latitude, lon: siteA.longitude }, { lat: siteB.latitude, lon: siteB.longitude });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h3 className="type-display text-display-l [overflow-wrap:anywhere]">{compareHeadline(siteA.status, siteB.status, km)}</h3>
        <p className="max-w-[72ch] text-body text-muted">{compareSubline(COMPARE_A.recorded_at_recorder_clock, COMPARE_B.recorded_at_recorder_clock, {
            a: siteA.label_assigned_by,
            b: siteB.label_assigned_by,
          })}</p>
      </div>
      <CompareDeck rows={fixture.rows} clips={fixture.clips} onRetry={() => window.location.reload()} />
      <div className="flex flex-col gap-6">
        <h3 className="type-display text-h2">Where the two differ</h3>
        {fixture.failed ? (
          <ErrorState title="The plot could not be drawn." body="One of the two recordings could not be loaded. Reload the page to try again." headingLevel={4} />
        ) : (
          <div className="max-w-[900px]">
            <PairedPlot siteA={siteA} siteB={siteB} fixture={fixture} />
          </div>
        )}
      </div>
    </div>
  );
}

export function CompositionCompare() {
  return (
    <FixtureSection {...COMPOSITION_COMPARE_META}>
      <CompositionFrame slug="composition-compare">
        <div className="px-(--gutter) pt-6">
          <CompositionHeader current="Compare" />
        </div>
        <div className="px-(--gutter) py-10">
          <Body />
        </div>
        <AttributionFooter className="border-rule border-t px-(--gutter) py-4" />
      </CompositionFrame>
    </FixtureSection>
  );
}
