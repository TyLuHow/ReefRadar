'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { useContract, useModelVersion, useReferenceSites, type ContractSite, type ModelVersion } from '@/features/contract';
import {
  AttributionFooter,
  BandToggle,
  ProbabilityBar,
  ProvenanceChip,
  RLabel,
  Spectrogram,
  Transport,
  doiUrl,
  recordedLine,
  safeHttpsUrl,
  useTransport,
  whyPanelDataFromSite,
  type BandDefinition,
  type ProbabilityBarModelCard,
  type SpectrogramBand,
  type SpectrogramHandle,
} from '@/features/instrument';
import { EmptyState, ErrorState, Listbox, ListboxItem, LoadingState, STATUS_LABELS, Skeleton, StatusMark, type HabitatStatus } from '@/features/ui';
import { FIXTURE_ANALYSIS } from '../data/analysis';
import { CompositionFrame, CompositionHeader, findSite } from '../parts/CompositionFrame';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { FIXTURE_EXCERPT, useFixtureClip } from '../parts/useFixtureClip';

/**
 * Inspector composition (04-21, the first accepted board): the quiet register. One site's facts on
 * the left (id, its reference label with who assigned it, the recording's facts, its source), and on
 * the right its recording with a transport and bands, the model's reading beside that reference label
 * and the similar sites the analysis returned. Built only from kit primitives; every value is read
 * from the contract site, the audio manifest, the audio itself or the captured analysis.
 *
 * The captured live analysis of ind_H1 returned no similar sites, so the list shows its inline empty
 * state; the composition never fills it with a guess. The bands are the equal three-way fixture split
 * of the recording's range, labelled as such, and the selection filters no audio.
 */

export const COMPOSITION_INSPECTOR_META: FixtureSectionMeta = {
  slug: 'composition-inspector',
  group: 'Composition',
  kind: 'Inspector',
  title: 'Inspector',
  contract:
    'The quiet register on real data: a site\'s facts and sources, its recording with a transport and bands, the model reading beside the reference label with who assigned it, and similar sites when the analysis returns them. Attribution closes the screen.',
  data: 'contract sites.json through useReferenceSites (ind_H1: label, definition, assigner, dataset, DOI, licence, status); contract manifest and useModelVersion (versions, classes, training); public/audio/marrs/ind_H1_20220830_120000.wav through data/audio-manifest.json; tests/fixtures/api/visualize-ind_H1-captured.json (analysis d5e62ea6, probabilities and similar_sites as returned); src/data/citations.json (attribution)',
};

const SITE_ID = 'ind_H1';
const NYQUIST_HZ = FIXTURE_EXCERPT.sample_rate_hz / 2;
const BANDS: BandDefinition[] = ['Low', 'Mid', 'High'].map((label, index) => ({
  id: label.toLowerCase(),
  label,
  lowHz: (NYQUIST_HZ * index) / 3,
  highHz: (NYQUIST_HZ * (index + 1)) / 3,
}));
const BAND_NOTE =
  "Fixture bands split 0 to the recording's top frequency into three equal ranges. The cited band table arrives in a later phase. The selection does not filter any audio.";

const LINK = 'underline underline-offset-4 hover:no-underline [overflow-wrap:anywhere]';

function modelCardOf(model: ModelVersion): ProbabilityBarModelCard {
  return { rows: model.training.rows, sites: model.training.sites, countries: model.training.countries, evaluation: model.evaluation };
}

/** A site id with a line-break chance after each underscore, so a narrow column wraps where it reads naturally. */
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

function ExternalLink({ href, children }: { href: string | null | undefined; children: string }) {
  const safe = safeHttpsUrl(href);
  return safe ? (
    <a href={safe} className={LINK}>
      {children}
    </a>
  ) : (
    <span className="[overflow-wrap:anywhere]">{children}</span>
  );
}

function Facts({ site }: { site: ContractSite }) {
  const contract = useContract();
  const model = useModelVersion();
  const panel = whyPanelDataFromSite(site, {
    datasetVersion: contract.data?.dataset_version,
    modelVersion: model.data?.model_version,
    recordedAt: FIXTURE_EXCERPT.recorded_at_recorder_clock,
  });
  const rate = Number((FIXTURE_EXCERPT.sample_rate_hz / 1000).toFixed(3));

  return (
    <div className="grid content-start gap-6 sm:grid-cols-2 lg:grid-cols-1">
      <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
        <p className="type-eyebrow text-muted">Site</p>
        <h3 data-inspector-id="" className="font-data text-id [overflow-wrap:anywhere]">
          <BreakableId id={site.site_id} />
        </h3>
        <p className="text-body text-muted">{site.location_label}</p>
      </div>

      <RLabel kind="reference">
        <p className="mt-1 flex items-center gap-2 text-body font-semibold text-ink">
          <StatusMark status={site.status} size={20} className="shrink-0" />
          <span>{site.label_original ?? STATUS_LABELS[site.status]}</span>
        </p>
        {site.label_definition ? <p className="mt-1 text-small text-ink">{`“${site.label_definition}”`}</p> : null}
        <p className="mt-1 text-small text-muted">{`Assigned by ${site.label_assigned_by}`}</p>
      </RLabel>

      <div className="flex flex-col gap-2">
        <p className="type-eyebrow text-muted">Recording</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
          <dt className="text-muted">Recorded</dt>
          <dd className="text-ink">{recordedLine(FIXTURE_EXCERPT.recorded_at_recorder_clock)}</dd>
          <dt className="text-muted">Duration</dt>
          <dd className="font-data tabular text-ink">{`${FIXTURE_EXCERPT.duration_s} s`}</dd>
          <dt className="text-muted">Sample rate</dt>
          <dd className="font-data tabular text-ink">{`${rate} kHz`}</dd>
        </dl>
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
        <p className="type-eyebrow text-muted">Source</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-small">
          <dt className="text-muted">Dataset</dt>
          <dd className="text-ink">
            <ExternalLink href={site.dataset_url}>{site.dataset_name}</ExternalLink>
          </dd>
          <dt className="text-muted">DOI</dt>
          <dd className="text-ink">
            {site.doi ? <ExternalLink href={doiUrl(site.doi)}>{`doi.org/${site.doi}`}</ExternalLink> : `Not recorded. ${site.doi_note ?? ''}`.trim()}
          </dd>
          <dt className="text-muted">Licence</dt>
          <dd className="text-ink">
            <ExternalLink href={site.licence_url}>{site.licence}</ExternalLink>
          </dd>
        </dl>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ProvenanceChip kind="source" panel={panel} />
          <ProvenanceChip kind="label" panel={panel} />
        </div>
      </div>
    </div>
  );
}

function RecordingPanel() {
  const fixture = useFixtureClip();
  const wellRef = useRef<SpectrogramHandle>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const transport = useTransport({ clips: fixture.transportClips, wells: [wellRef], observe: observeRef });
  const [selected, setSelected] = useState<Set<string>>(new Set(['low', 'mid']));
  const status = fixture.failed ? 'error' : fixture.waiting ? 'loading' : transport.status;
  const shownBands = useMemo<SpectrogramBand[]>(() => BANDS.filter((band) => selected.has(band.id)), [selected]);

  return (
    <div ref={observeRef} className="flex flex-col gap-4 bg-panel p-5">
      <p className="type-eyebrow text-muted">Recording</p>
      <Spectrogram
        ref={wellRef}
        variant="panel"
        source={fixture.clip.matrix}
        description={fixture.description}
        caption={fixture.caption}
        state={fixture.wellState}
        bands={shownBands}
        onScrub={transport.seek}
      />
      <Transport
        size="compact"
        status={status}
        position={transport.positionS}
        duration={transport.durationS || FIXTURE_EXCERPT.duration_s}
        onPlayPause={transport.playPause}
        onStep={transport.step}
        onSeek={transport.seek}
        onRetry={() => window.location.reload()}
        showScrub
      />
      <div className="flex flex-col gap-2">
        <BandToggle bands={BANDS} nyquistHz={NYQUIST_HZ} selectedKeys={selected} onSelectionChange={setSelected} />
        <p className="text-small text-muted">{BAND_NOTE}</p>
      </div>
    </div>
  );
}

function ReadingPanel({ site, sites }: { site: ContractSite; sites: readonly ContractSite[] }) {
  const model = useModelVersion();
  const analysis = FIXTURE_ANALYSIS;
  const similar = analysis.similarSites;

  return (
    <div className="grid gap-6 @min-[40rem]:grid-cols-2">
      <div className="min-w-0 bg-panel p-5">
        {model.data ? (
          <ProbabilityBar
            probabilities={analysis.probabilities}
            modelClasses={model.data.classes}
            reference={{ status: site.status, assignedBy: site.label_assigned_by }}
            modelCard={modelCardOf(model.data)}
            note={analysis.note}
          />
        ) : model.error ? (
          <ErrorState announce="status" title="The model card could not be loaded." body="Reload the page to try again." />
        ) : (
          <LoadingState label="Loading the model card…">
            <Skeleton on="panel" className="h-40 w-full" />
          </LoadingState>
        )}
      </div>
      <div className="min-w-0 bg-panel p-5">
        <p className="type-eyebrow text-muted">Similar sites</p>
        <div className="mt-3">
          {similar.length === 0 ? (
            <EmptyState variant="inline" title="No similar sites in this reading." body="Similar sites appear when the analysis returns them." />
          ) : (
            <Listbox aria-label="Similar sites" selectionMode="single">
              {similar.map((entry) => {
                const known = findSite(sites, entry.site_id);
                const status = (known?.status ?? 'unknown') as HabitatStatus;
                return (
                  <ListboxItem key={entry.site_id} id={entry.site_id} textValue={entry.site_id} status={status} description={entry.country} count={entry.similarity}>
                    {entry.site_id}
                  </ListboxItem>
                );
              })}
            </Listbox>
          )}
        </div>
      </div>
    </div>
  );
}

function Body() {
  const sites = useReferenceSites();
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
  const site = findSite(sites.data, SITE_ID);
  if (sites.data === undefined || site === undefined) {
    return (
      <LoadingState label="Loading the contract…">
        <Skeleton on="ground" className="h-64 w-full" />
      </LoadingState>
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Facts site={site} />
      <div className="@container flex min-w-0 flex-col gap-6">
        <RecordingPanel />
        <ReadingPanel site={site} sites={sites.data} />
      </div>
    </div>
  );
}

export function CompositionInspector() {
  return (
    <FixtureSection {...COMPOSITION_INSPECTOR_META}>
      <CompositionFrame slug="composition-inspector">
        <div className="px-(--gutter) pt-6">
          <CompositionHeader current="Explore" />
        </div>
        <div className="px-(--gutter) py-8">
          <Body />
        </div>
        <AttributionFooter className="border-rule border-t px-(--gutter) py-4" />
      </CompositionFrame>
    </FixtureSection>
  );
}
