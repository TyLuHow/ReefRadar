'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState, type ReactNode } from 'react';
import { pairedSpec, scatterSpec, stripSpec, type ScatterSite, type StripPoint } from '@/features/charts';
import { useProjection, useReferenceSites, type ContractSite } from '@/features/contract';
import { bandMeanDb, useClipSpectrogram } from '@/features/instrument';
import { ErrorState, LoadingState, Skeleton } from '@/features/ui';
import { getExcerpt } from '@/lib/audio-manifest';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * StripPlot (DS-05, 04-19): the three variants on real data. Nothing here is invented.
 *
 * - strip: each acoustic-reference site's position on component 1 of the contract projection (the
 *   one real per-site number the contract carries; there is no per-site score yet), one row per status;
 * - paired: ind_H1 against ind_D1, the mean level in three bands computed from the two committed WAV
 *   excerpts with the same STFT as the spectrograms (dsp/levels.ts bandMeanDb, dB re full scale,
 *   uncalibrated);
 * - scatter: every site that has projection coordinates, with the projection's own caveat computed
 *   from its cumulative explained variance.
 *
 * Plot is loaded through next/dynamic with ssr false, so its chunk stays off every other route.
 * The hover cell forces the hover label for one real site and says so; no state is faked otherwise.
 */

export const STRIP_PLOT_META: FixtureSectionMeta = {
  slug: 'strip-plot',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'StripPlot',
  contract:
    'Three Observable Plot variants with the status shapes, an ink outline on every mark and a caption computed from the data. The accent appears only as the scatter’s selected-site ring. Marks are not focusable: every figure has a visible "Show as table" disclosure, and that table is the keyboard path.',
  data: 'contracts/bucket/v1/projection.json (coordinates, explained variance, caveat) and contracts/bucket/v1/sites.json (status, country, projection) through useProjection and useReferenceSites; band levels from public/audio/marrs/ind_H1_20220830_120000.wav and public/audio/marrs/ind_D1_20220830_120000.wav (data/audio-manifest.json) by dsp/levels.ts bandMeanDb',
};

const StripPlot = dynamic(() => import('@/features/charts').then((module) => module.StripPlot), {
  ssr: false,
  loading: () => (
    <LoadingState label="Loading plot…">
      <Skeleton on="panel" className="h-[220px] w-full" />
    </LoadingState>
  ),
});

const MEASURE = 'Position on component 1 of the reference projection';
const SELECTED_ID = 'ind_H1';
const PAIR_A = 'ind_H1';
const PAIR_B = 'ind_D1';
const EXCERPT_A = getExcerpt('ind_H1_20220830_120000');
const EXCERPT_B = getExcerpt('ind_D1_20220830_120000');

/** The paired plot's bands, in Hz. Both clips are 16 kHz, so the top band ends at their Nyquist. */
const BANDS: ReadonlyArray<{ label: string; lowHz: number; highHz: number }> = [
  { label: '0 to 1 kHz', lowHz: 0, highHz: 1000 },
  { label: '1 to 4 kHz', lowHz: 1000, highHz: 4000 },
  { label: '4 to 8 kHz', lowHz: 4000, highHz: 8000 },
];

function stripPoints(sites: readonly ContractSite[]): StripPoint[] {
  return sites
    .filter((site) => site.reference_role === 'acoustic_reference' && site.projection !== null)
    .map((site) => ({ id: site.site_id, status: site.status, value: site.projection!.x }));
}

function scatterSites(sites: readonly ContractSite[]): ScatterSite[] {
  return sites
    .filter((site) => site.projection !== null)
    .map((site) => ({ id: site.site_id, status: site.status, country: site.country, x: site.projection!.x, y: site.projection!.y }));
}

/** A strip whose selection follows the pointer or the table's Select buttons: the only selection path. */
function SelectableStrip({ points }: { points: StripPoint[] }) {
  const [selected, setSelected] = useState(SELECTED_ID);
  const spec = useMemo(() => stripSpec(points, { measureLabel: MEASURE, selectedId: selected }), [points, selected]);
  return (
    <>
      <StripPlot spec={spec} onSelect={setSelected} />
      <p className="text-small text-muted mt-3" data-testid="strip-plot-selected">{`Selected: ${selected}`}</p>
    </>
  );
}

function PairedCell({ sites }: { sites: readonly ContractSite[] }) {
  const clipA = useClipSpectrogram(EXCERPT_A.url_path);
  const clipB = useClipSpectrogram(EXCERPT_B.url_path);
  const siteA = sites.find((site) => site.site_id === PAIR_A);
  const siteB = sites.find((site) => site.site_id === PAIR_B);

  const spec = useMemo(() => {
    if (!siteA || !siteB || !clipA.samples || !clipA.sampleRate || !clipB.samples || !clipB.sampleRate) return undefined;
    const levels = (samples: Float32Array, rate: number) => BANDS.map((band) => bandMeanDb(samples, rate, band.lowHz, band.highHz));
    return pairedSpec({
      a: { siteId: siteA.site_id, status: siteA.status, levels: levels(clipA.samples, clipA.sampleRate) },
      b: { siteId: siteB.site_id, status: siteB.status, levels: levels(clipB.samples, clipB.sampleRate) },
      bands: BANDS.map((band) => band.label),
      // Both manifest excerpts are the same length; the footnote states the shorter, so it can never overstate.
      durationS: Math.min(EXCERPT_A.duration_s, EXCERPT_B.duration_s),
    });
  }, [siteA, siteB, clipA.samples, clipA.sampleRate, clipB.samples, clipB.sampleRate]);

  if (clipA.status === 'error' || clipB.status === 'error' || !siteA || !siteB) {
    return <ErrorState title="The plot could not be drawn." body="One of the two recordings could not be loaded. Reload the page to try again." headingLevel={3} />;
  }
  return <StripPlot spec={spec} />;
}

function cell(state: string, children: ReactNode, options: { forced?: boolean; note?: string; narrow?: boolean } = {}) {
  return (
    <StateCell key={state} primitive="strip-plot" state={state} span="full" forced={options.forced} note={options.note}>
      <div className={options.narrow ? 'max-w-[720px]' : undefined}>{children}</div>
    </StateCell>
  );
}

function Cells() {
  const sites = useReferenceSites();
  const projection = useProjection();

  const failed = sites.error !== null || projection.error !== null;
  const siteData = sites.data;
  const projectionData = projection.data;

  const points = useMemo(() => (siteData ? stripPoints(siteData) : []), [siteData]);
  const oneValue = useMemo(() => points.filter((point) => point.id === SELECTED_ID), [points]);
  const scatterData = useMemo(() => (siteData ? scatterSites(siteData) : []), [siteData]);

  const defaultSpec = useMemo(() => stripSpec(points, { measureLabel: MEASURE }), [points]);
  const hoverSpec = useMemo(() => stripSpec(points, { measureLabel: MEASURE, hoverId: SELECTED_ID }), [points]);
  const oneSpec = useMemo(() => stripSpec(oneValue, { measureLabel: MEASURE }), [oneValue]);
  const emptySpec = useMemo(() => stripSpec([], { measureLabel: MEASURE }), []);
  const scatter = useMemo(
    () =>
      projectionData
        ? scatterSpec({
            sites: scatterData,
            explained: [projectionData.explained_variance_ratio[0], projectionData.explained_variance_ratio[1]],
            cumulative: projectionData.cumulative_explained_variance_ratio,
            selectedId: SELECTED_ID,
          })
        : undefined,
    [scatterData, projectionData],
  );

  const stateless = [
    cell('loading', <StripPlot state="loading" />, { narrow: true }),
    cell('empty', <StripPlot spec={emptySpec} />, { narrow: true }),
  ];

  if (failed) {
    return (
      <>
        {cell(
          'error',
          <ErrorState title="The plot could not be drawn." body="The reference sites or the projection could not be loaded. Reload the page to try again." headingLevel={3} />,
        )}
        {stateless}
      </>
    );
  }

  const ready = siteData !== undefined && projectionData !== undefined;
  const count = points.length;
  const subsetNote = ready ? `${count} acoustic-reference sites from contract v${sites.version ?? '?'}.` : undefined;

  return (
    <>
      {cell('default', <StripPlot spec={ready ? defaultSpec : undefined} />, { note: subsetNote })}
      {cell('hover', <StripPlot spec={ready ? hoverSpec : undefined} />, {
        forced: true,
        note: `The hover label is forced onto ${SELECTED_ID}; on a pointer the same text is each mark's native tooltip.`,
      })}
      {cell('selected', ready ? <SelectableStrip points={points} /> : <StripPlot />, {
        note: 'Click a mark or press a table Select button: the selected mark is enlarged with a 2 px ink ring.',
      })}
      {cell('paired', ready ? <PairedCell sites={siteData} /> : <StripPlot />, {
        narrow: true,
        note: `${PAIR_A} against ${PAIR_B}: mean band levels computed from the two real recordings in this browser.`,
      })}
      {cell('scatter', <StripPlot spec={scatter} />, { narrow: true, note: 'Only sites with projection coordinates are plotted; the caveat is computed from the projection.' })}
      {stateless}
      {cell('one-value', <StripPlot spec={ready ? oneSpec : undefined} />, { narrow: true })}
      {cell('error', <StripPlot spec={ready ? defaultSpec : undefined} state={ready ? 'error' : undefined} />, { forced: true, narrow: true })}
    </>
  );
}

export function StripPlotSection() {
  return (
    <FixtureSection {...STRIP_PLOT_META}>
      <Cells />
    </FixtureSection>
  );
}
