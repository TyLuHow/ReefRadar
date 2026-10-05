'use client';

import { startTransition, useMemo, useRef, useState, ViewTransition, type ReactNode } from 'react';
import { useContract, useModelVersion, useReferenceSites, type ContractSite } from '@/features/contract';
import {
  CompareDeck,
  ProvenanceChip,
  RLabel,
  Spectrogram,
  Transport,
  useTransport,
  whyPanelDataFromSite,
  type SpectrogramHandle,
} from '@/features/instrument';
import {
  Button,
  ErrorState,
  HABITAT_STATUSES,
  Listbox,
  ListboxItem,
  LoadingState,
  STATUS_LABELS,
  Skeleton,
  StatusMark,
  ToggleGroup,
  ToggleGroupItem,
  countBy,
} from '@/features/ui';
import { attributionLine } from '@/lib/audio-manifest';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';
import { COMPARE_A, COMPARE_B, useCompareFixture } from '../parts/useCompareFixture';
import { useFixtureClip } from '../parts/useFixtureClip';

/**
 * Motion (DS-06, UI-SPEC "Motion"): each continuity motion of the kit on real data, one cell each.
 * Motion exists only to keep a person oriented across a change; nothing here decorates. With Reduced
 * motion on, every duration token is 0 ms, view transitions do not animate, the playhead steps once a
 * second and the spectrogram does not scroll (turn it on in the toolbar to check each cell).
 *
 * - SELECTION: the toggle and listbox fills use `--duration-fast` through the kit classes.
 * - LAYOUT MORPH: rows reorder inside `startTransition`, each wrapped in a named `<ViewTransition>`;
 *   tokens.css gives the `motion-morph` class its `--duration-morph` (transform only).
 * - PLAYHEAD: the real ind_H1 excerpt through `useTransport`; the playhead moves by transform from the clock.
 * - CROSSFADE: the live CompareDeck on ind_H1 and ind_D1; the far well dims by `--duration-fast`.
 * - VIEW TRANSITION: a content swap between two real sites inside `startTransition`, crossfaded by
 *   `--duration-view` (the `motion-view` class).
 * `<ViewTransition>` animates only inside a transition, so every state change that should move is
 * wrapped in `startTransition`. Counts come from the contract (`countBy`); nothing is typed.
 */

export const MOTION_META: FixtureSectionMeta = {
  slug: 'motion',
  group: 'Foundation',
  kind: 'Motion',
  title: 'Motion',
  contract:
    'Motion is used only for continuity: a selection fill, a reorder, a playhead, a crossfade and a content swap. Each duration is a token, and every one is zero under reduced motion.',
  data: 'contract sites.json through useReferenceSites (status counts, ind_H1 and ind_D1 provenance), contract manifest dataset_version and useModelVersion model_version; public/audio/marrs/ind_H1_20220830_120000.wav and ind_D1_20220830_120000.wav through data/audio-manifest.json',
};

const REDUCED_NOTE =
  'With Reduced motion on (toolbar or the operating system), every duration is 0 ms, view transitions do not animate, the playhead steps once per second and the spectrogram does not scroll.';

const SELECTABLE_STATUSES = HABITAT_STATUSES.filter((status) => status !== 'unknown');
const LISTED_SITES = 5;
const SWAP_IDS = [COMPARE_A.site_id, COMPARE_B.site_id] as const;

/** Loading and error states for a cell that needs the contract's sites; `children` runs once they are here. */
function WithSites({ children }: { children: (sites: readonly ContractSite[]) => ReactNode }) {
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
  if (sites.data === undefined) {
    return (
      <LoadingState label="Loading the contract…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    );
  }
  return <>{children(sites.data)}</>;
}

function SelectionCell({ sites }: { sites: readonly ContractSite[] }) {
  const [status, setStatus] = useState<string>('healthy');
  const [chosen, setChosen] = useState<string | null>(null);
  const listed = useMemo(() => sites.filter((site) => site.reference_role === 'acoustic_reference').slice(0, LISTED_SITES), [sites]);
  const selected = chosen ?? listed[0]?.site_id;

  return (
    <div className="flex flex-col gap-6">
      <ToggleGroup
        aria-label="Habitat status"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[status]}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          if (key !== undefined) setStatus(String(key));
        }}
      >
        {SELECTABLE_STATUSES.map((value) => (
          <ToggleGroupItem key={value} id={value}>
            {STATUS_LABELS[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Listbox
        aria-label="Reference sites"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={selected === undefined ? [] : [selected]}
        onSelectionChange={(keys) => {
          if (keys === 'all') return;
          const [key] = [...keys];
          if (key !== undefined) setChosen(String(key));
        }}
      >
        {listed.map((site) => (
          <ListboxItem key={site.site_id} id={site.site_id} textValue={site.site_id} status={site.status} description={site.location_label}>
            {site.site_id}
          </ListboxItem>
        ))}
      </Listbox>
    </div>
  );
}

type MorphOrder = 'habitat' | 'count';

function MorphCell({ sites }: { sites: readonly ContractSite[] }) {
  const [order, setOrder] = useState<MorphOrder>('habitat');
  const counts = countBy(sites, (site) => site.status);
  const rows = HABITAT_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })).filter((row) => row.count > 0);
  // Array.prototype.sort is stable, so equal counts keep the ordinal order.
  const shown = order === 'habitat' ? rows : [...rows].sort((a, b) => b.count - a.count);
  const orderName = order === 'habitat' ? 'habitat status' : 'count';

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="secondary"
        onPress={() => {
          // A view transition animates only an update made inside a transition.
          startTransition(() => setOrder(order === 'habitat' ? 'count' : 'habitat'));
        }}
      >
        {order === 'habitat' ? 'Order by count' : 'Order by habitat status'}
      </Button>
      <ul aria-label={`Sites by habitat status, ordered by ${orderName}`} className="flex flex-col">
        {shown.map(({ status, count }) => (
          <ViewTransition key={status} name={`motion-morph-${status}`} default="motion-morph">
            <li data-morph-row={status} className="border-rule flex min-h-11 items-center gap-3 border-t px-2 text-body text-ink">
              <StatusMark status={status} size={20} className="shrink-0" />
              <span className="flex-1">{STATUS_LABELS[status]}</span>
              <span className="font-data tabular">{count}</span>
            </li>
          </ViewTransition>
        ))}
      </ul>
    </div>
  );
}

function PlayheadCell() {
  const fixture = useFixtureClip();
  const wellRef = useRef<SpectrogramHandle>(null);
  const observeRef = useRef<HTMLDivElement>(null);
  const transport = useTransport({ clips: fixture.transportClips, wells: [wellRef], observe: observeRef });
  const status = fixture.failed ? 'error' : fixture.waiting ? 'loading' : transport.status;

  return (
    <div ref={observeRef} className="flex flex-col gap-4">
      <Spectrogram
        ref={wellRef}
        variant="panel"
        source={fixture.clip.matrix}
        description={fixture.description}
        caption={fixture.caption}
        state={fixture.wellState}
        onScrub={transport.seek}
      />
      <Transport
        size="compact"
        status={status}
        position={transport.positionS}
        duration={transport.durationS || fixture.excerpt.duration_s}
        onPlayPause={transport.playPause}
        onStep={transport.step}
        onSeek={transport.seek}
        onRetry={() => window.location.reload()}
        showScrub
      />
    </div>
  );
}

function CrossfadeCell() {
  const { rows, clips } = useCompareFixture();
  return <CompareDeck rows={rows} clips={clips} onRetry={() => window.location.reload()} />;
}

function SwapCell({ sites }: { sites: readonly ContractSite[] }) {
  const contract = useContract();
  const model = useModelVersion();
  const [siteId, setSiteId] = useState<string>(SWAP_IDS[0]);
  const site = sites.find((candidate) => candidate.site_id === siteId);

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        aria-label="Recording to show"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[siteId]}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          // The swap is a view transition, so it is made inside a transition.
          if (key !== undefined) startTransition(() => setSiteId(String(key)));
        }}
      >
        {SWAP_IDS.map((id) => (
          <ToggleGroupItem key={id} id={id}>
            {id}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <ViewTransition key={siteId} enter="motion-view" exit="motion-view" update="none" default="none">
        <div data-swap-content={siteId} className="flex flex-col gap-3">
          {site ? (
            <>
              <p className="font-data text-lead text-ink [overflow-wrap:anywhere]">{site.site_id}</p>
              <RLabel kind="reference">
                <p className="text-body font-semibold text-ink">{site.label_original ?? STATUS_LABELS[site.status]}</p>
                <p className="text-small text-muted">{`Assigned by ${site.label_assigned_by}`}</p>
              </RLabel>
              <div className="flex flex-wrap items-center gap-3">
                {(['source', 'label'] as const).map((kind) => (
                  <ProvenanceChip
                    key={kind}
                    kind={kind}
                    panel={whyPanelDataFromSite(site, { datasetVersion: contract.data?.dataset_version, modelVersion: model.data?.model_version })}
                   
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-body text-muted">This site is not in the contract.</p>
          )}
        </div>
      </ViewTransition>
    </div>
  );
}

export function MotionSection() {
  return (
    <FixtureSection {...MOTION_META}>
      <StateCell primitive="motion" state="selection" note="Press a segment or a row: the fill changes over --duration-fast (120 ms).">
        <WithSites>{(sites) => <SelectionCell sites={sites} />}</WithSites>
      </StateCell>
      <StateCell primitive="motion" state="layout-morph" note="Press the button: the rows move to their new places over --duration-morph (400 ms), transform only.">
        <WithSites>{(sites) => <MorphCell sites={sites} />}</WithSites>
      </StateCell>
      <StateCell primitive="motion" state="view-transition" note="Choose the other recording: the content crossfades over --duration-view (200 ms).">
        <WithSites>{(sites) => <SwapCell sites={sites} />}</WithSites>
      </StateCell>
      <StateCell primitive="motion" state="playhead" span="full" note="The real recording. Press Play: the playhead moves by transform, once per frame, and the readout follows once a second.">
        <PlayheadCell />
      </StateCell>
      <StateCell
        primitive="motion"
        state="crossfade"
        span="full"
        note="The real healthy and degraded recordings. Move the crossfader: the well it moves away from dims over --duration-fast (120 ms)."
      >
        <CrossfadeCell />
      </StateCell>
      <p className="col-span-full text-small text-muted max-w-[72ch]">{REDUCED_NOTE}</p>
      <p className="col-span-full text-small text-muted [overflow-wrap:anywhere]">{`Audio: ${attributionLine()}`}</p>
    </FixtureSection>
  );
}
