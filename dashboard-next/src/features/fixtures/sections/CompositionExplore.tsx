'use client';

import dynamic from 'next/dynamic';
import { Fragment, useMemo, useRef, useState } from 'react';
import { scatterSpec, type ScatterSite } from '@/features/charts';
import { useProjection, useReferenceSites, type ContractSite } from '@/features/contract';
import {
  AttributionFooter,
  Legend,
  RLabel,
  SPECTROGRAM_SPEC,
  Spectrogram,
  Transport,
  useClipSpectrogram,
  useTransport,
  type SpectrogramHandle,
} from '@/features/instrument';
import {
  EmptyState,
  ErrorState,
  Listbox,
  ListboxItem,
  LoadingState,
  STATUS_LABELS,
  Skeleton,
  StatusMark,
  ToggleGroup,
  ToggleGroupItem,
} from '@/features/ui';
import { allExcerpts, type AudioExcerpt } from '@/lib/audio-manifest';
import { CompositionFrame, CompositionHeader } from '../parts/CompositionFrame';
import { exploreHeadline, exploreSubline } from '../parts/compositionCopy';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';

/**
 * Explore, a partial map (04-21, the fourth accepted board): every site that has projection
 * coordinates, placed by the two strongest patterns in its sound embedding. The headline counts the
 * plotted sites, the sub-line prints the share of variation the plane shows (both computed from the
 * projection and the sites), the country chips carry computed counts, and the scatter is the kit
 * StripPlot. Marks are not focusable, so a keyboard user selects through the Listbox of the same
 * sites (and the plot's own table); selection drives the scatter ring and the panel.
 *
 * The panel names the selected site, its reference label and who assigned it, and plays the
 * recording only when the app carries a real excerpt for that site; otherwise it says there is none.
 * Nothing here says near means similar: the projection caveat is printed under the headline and under
 * the plot.
 */

export const COMPOSITION_EXPLORE_META: FixtureSectionMeta = {
  slug: 'composition-explore',
  group: 'Composition',
  kind: 'Explore',
  title: 'Explore: partial map',
  contract:
    'A partial map on real data: sites placed by the contract projection with its caveat computed from the explained variance, country chips with computed counts, a keyboard list that drives the selection, a selected-site panel that plays a real excerpt when one exists, and a status legend over the plotted sites.',
  data: 'contracts/bucket/v1/projection.json (explained variance, cumulative share) through useProjection; contracts/bucket/v1/sites.json (projection, status, country, location_label, label_original, label_assigned_by, dataset_name) through useReferenceSites; the committed excerpts of data/audio-manifest.json for sites that have one; src/data/citations.json (attribution)',
};

const StripPlot = dynamic(() => import('@/features/charts').then((module) => module.StripPlot), {
  ssr: false,
  loading: () => (
    <LoadingState label="Loading plot…">
      <Skeleton on="ground" className="h-[420px] w-full" />
    </LoadingState>
  ),
});

const DEFAULT_SELECTED_ID = 'ind_H1';
const EXCERPTS = allExcerpts();

function excerptFor(siteId: string): AudioExcerpt | undefined {
  return EXCERPTS.find((excerpt) => excerpt.site_id === siteId);
}

/** Sites that have projection coordinates, in contract order. */
function plottedSites(sites: readonly ContractSite[]): ContractSite[] {
  return sites.filter((site) => site.projection !== null);
}

function BreakableId({ id }: { id: string }) {
  const parts = id.split('_');
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 ? (
            <>
              _<wbr />
            </>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

/** The thumbnail and a medium transport for a real excerpt. Keyed by site, so a new selection starts fresh. */
function ExcerptPlayer({ site, excerpt }: { site: ContractSite; excerpt: AudioExcerpt }) {
  const clip = useClipSpectrogram(excerpt.url_path);
  const wellRef = useRef<SpectrogramHandle>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const { buffer, samples, sampleRate } = clip;
  const clips = useMemo(
    () => (buffer && samples && sampleRate ? [{ id: excerpt.site_id, buffer, durationS: samples.length / sampleRate }] : []),
    [buffer, samples, sampleRate, excerpt.site_id],
  );
  const transport = useTransport({ clips, wells: [wellRef], observe: observeRef });
  const rate = Number((excerpt.sample_rate_hz / 1000).toFixed(3));
  const status = clip.status === 'error' ? 'error' : clip.status !== 'ready' ? 'loading' : transport.status;

  return (
    <div ref={observeRef} className="flex flex-col gap-4">
      <Spectrogram
        ref={wellRef}
        variant="thumb"
        source={clip.matrix}
        state={clip.status === 'error' ? 'error' : clip.matrix ? undefined : 'loading'}
        description={`${excerpt.duration_s} s excerpt at ${rate} kHz.`}
        caption={{
          siteId: excerpt.site_id,
          dataset: site.dataset_name,
          recordedAt: excerpt.recorded_at_recorder_clock,
          durationS: excerpt.duration_s,
          sampleRateHz: excerpt.sample_rate_hz,
          fftSize: SPECTROGRAM_SPEC.fftSize,
        }}
        onScrub={transport.seek}
      />
      <Transport
        size="medium"
        status={status}
        position={transport.positionS}
        duration={transport.durationS || excerpt.duration_s}
        onPlayPause={transport.playPause}
        onStep={transport.step}
        onSeek={transport.seek}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}

function SelectedSite({ site }: { site: ContractSite }) {
  const excerpt = excerptFor(site.site_id);
  return (
    <div data-selected-site={site.site_id} className="flex flex-col gap-4 bg-panel p-5">
      <p className="type-eyebrow text-muted">Selected site</p>
      <h4 className="font-data text-id [overflow-wrap:anywhere]">
        <BreakableId id={site.site_id} />
      </h4>
      <p className="text-body text-muted">{site.location_label}</p>
      <RLabel kind="reference">
        <p className="mt-1 flex items-center gap-2 text-body font-semibold text-ink">
          <StatusMark status={site.status} size={20} className="shrink-0" />
          <span>{site.label_original ?? STATUS_LABELS[site.status]}</span>
        </p>
        <p className="mt-1 text-small text-muted">{`Assigned by ${site.label_assigned_by}`}</p>
        {site.status === 'unknown' && site.status_basis ? <p className="mt-1 text-small text-muted">{site.status_basis}</p> : null}
      </RLabel>
      {excerpt ? <ExcerptPlayer key={site.site_id} site={site} excerpt={excerpt} /> : <p className="text-body text-muted">No excerpt is available for this site.</p>}
      <a
        href={`#site-${site.site_id}`}
        className="inline-flex min-h-11 items-center self-start text-body font-semibold text-ink underline underline-offset-4 hover:no-underline"
      >
        Open site and sources
      </a>
    </div>
  );
}

function Body() {
  const sites = useReferenceSites();
  const projection = useProjection();
  const [countries, setCountries] = useState<string[]>([]);
  const [chosenId, setChosenId] = useState<string>(DEFAULT_SELECTED_ID);

  const plotted = useMemo(() => (sites.data ? plottedSites(sites.data) : []), [sites.data]);
  const countryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const site of plotted) counts.set(site.country, (counts.get(site.country) ?? 0) + 1);
    return counts;
  }, [plotted]);

  // No chip pressed means every country is shown; pressing chips narrows to those countries.
  const visible = useMemo(() => (countries.length === 0 ? plotted : plotted.filter((site) => countries.includes(site.country))), [plotted, countries]);
  const selectedSite = plotted.find((site) => site.site_id === chosenId) ?? plotted[0];
  const ringedId = visible.some((site) => site.site_id === selectedSite?.site_id) ? selectedSite?.site_id : undefined;

  const cumulative = projection.data?.cumulative_explained_variance_ratio;
  const spec = useMemo(() => {
    if (!projection.data || visible.length === 0) return undefined;
    const scatterSites: ScatterSite[] = visible.map((site) => ({
      id: site.site_id,
      status: site.status,
      country: site.country,
      x: site.projection!.x,
      y: site.projection!.y,
    }));
    return scatterSpec({
      sites: scatterSites,
      explained: [projection.data.explained_variance_ratio[0], projection.data.explained_variance_ratio[1]],
      cumulative: projection.data.cumulative_explained_variance_ratio,
      selectedId: ringedId,
    });
  }, [projection.data, visible, ringedId]);

  const failure = sites.error ?? projection.error;
  if (failure !== null && failure !== undefined) {
    return (
      <ErrorState
        announce="status"
        title="The map could not be loaded."
        body="Try again, or reload the page."
        onRetry={() => {
          void Promise.all([sites.refetch(), projection.refetch()]);
        }}
      />
    );
  }
  if (sites.data === undefined || projection.data === undefined || cumulative === undefined || selectedSite === undefined) {
    return (
      <LoadingState label="Loading the map…">
        <Skeleton on="ground" className="h-96 w-full" />
      </LoadingState>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <h3 className="type-display text-display-l [overflow-wrap:anywhere]">{exploreHeadline(plotted.length)}</h3>
        <p className="max-w-[72ch] text-body text-muted">{exploreSubline(cumulative)}</p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ToggleGroup
            aria-label="Filter by country"
            selectionMode="multiple"
            selectedKeys={countries}
            onSelectionChange={(keys) => setCountries([...keys].map(String))}
            className="flex-wrap gap-y-2"
            helperText={countries.length === 0 ? 'All countries shown. Choose one or more to narrow the map.' : `${visible.length} of ${plotted.length} sites shown.`}
          >
            {[...countryCounts].map(([country, count]) => (
              <ToggleGroupItem key={country} id={country}>
                {`${country} ${count}`}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <StripPlot spec={spec} onSelect={setChosenId} loadingHeight={420} />
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <SelectedSite site={selectedSite} />
          <div className="flex flex-col gap-2">
            <p className="type-eyebrow text-muted">Sites on the map</p>
            {visible.length === 0 ? (
              <EmptyState variant="inline" title="No sites to show." body="Adjust the selection to include at least one site." />
            ) : (
              <Listbox
                aria-label="Sites on the map"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[selectedSite.site_id]}
                onSelectionChange={(keys) => {
                  if (keys === 'all') return;
                  const [key] = [...keys];
                  if (key !== undefined) setChosenId(String(key));
                }}
                className="max-h-80 overflow-y-auto"
              >
                {visible.map((site) => (
                  <ListboxItem key={site.site_id} id={site.site_id} textValue={site.site_id} status={site.status} description={site.location_label}>
                    {site.site_id}
                  </ListboxItem>
                ))}
              </Listbox>
            )}
          </div>
          <Legend items={visible} statusOf={(site) => site.status} mode="static" />
        </div>
      </div>
    </div>
  );
}

export function CompositionExplore() {
  return (
    <FixtureSection {...COMPOSITION_EXPLORE_META}>
      <CompositionFrame slug="composition-explore">
        <div className="px-(--gutter) pt-6">
          <CompositionHeader current="Explore" />
        </div>
        <div className="px-(--gutter) py-10">
          <Body />
        </div>
        <AttributionFooter className="border-rule border-t px-(--gutter) py-4" />
      </CompositionFrame>
    </FixtureSection>
  );
}
