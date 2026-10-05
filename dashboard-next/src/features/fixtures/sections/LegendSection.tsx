'use client';

import { useState } from 'react';
import { useReferenceSites, type ContractSite } from '@/features/contract';
import { Legend, type LegendEvidence } from '@/features/instrument';
import { ErrorState, HABITAT_STATUSES, LoadingState, STATUS_LABELS, Skeleton, countBy, type HabitatStatus } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Legend (DS-05): every contract reference site, with counts computed by countBy and never typed.
 * The static cell lists all sites; the evidence cell adds the Evidence group from reference_role. The
 * interactive cells filter to one country chosen from the data, the first country in which a status
 * that exists in the full data has no site, so the disabled zero row is real and computed. The
 * interactive cell is live: its toggles narrow the counts further. The selected cell has one status
 * toggled on (the first status with sites in that country), and the zero-row cell is the same filter
 * with nothing toggled.
 */

export const LEGEND_META: FixtureSectionMeta = {
  slug: 'legend',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'Legend',
  contract:
    'Habitat statuses with counts computed from the data shown, in a fixed order. A static legend omits statuses with no sites. An interactive legend lists every status in the full data as a toggle, with its count under the current filter, and disables a status with none.',
  data: 'contract sites.json through useReferenceSites (status, reference_role, country); every count is computed by countBy over those sites',
};

const statusOf = (site: ContractSite): HabitatStatus => site.status;
const evidenceOf = (site: ContractSite): LegendEvidence => site.reference_role;

function noop() {
  /* a review cell: the selection is fixed */
}

/** The first country in which a status present in the full data has no site; the first country if none does. */
export function pickFilterCountry(sites: readonly ContractSite[]): string | undefined {
  const full = countBy(sites, statusOf);
  const countries = Array.from(new Set(sites.map((site) => site.country)));
  const withZero = countries.find((country) => {
    const local = countBy(
      sites.filter((site) => site.country === country),
      statusOf,
    );
    return HABITAT_STATUSES.some((status) => (full.get(status) ?? 0) > 0 && (local.get(status) ?? 0) === 0);
  });
  return withZero ?? countries[0];
}

function LiveInteractive({ sites, inCountry }: { sites: readonly ContractSite[]; inCountry: readonly ContractSite[] }) {
  const [selected, setSelected] = useState<HabitatStatus[]>([]);
  const filtered = selected.length === 0 ? inCountry : inCountry.filter((site) => selected.includes(site.status));
  return (
    <Legend
      items={sites}
      filtered={filtered}
      statusOf={statusOf}
      mode="interactive"
      selected={selected}
      onToggle={(status) => setSelected((current) => (current.includes(status) ? current.filter((s) => s !== status) : [...current, status]))}
    />
  );
}

function DataCells() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const all = sites.data;
    const country = pickFilterCountry(all);
    const inCountry = all.filter((site) => site.country === country);
    const local = countBy(inCountry, statusOf);
    const full = countBy(all, statusOf);
    const zeroLabels = HABITAT_STATUSES.filter((status) => (full.get(status) ?? 0) > 0 && (local.get(status) ?? 0) === 0).map(
      (status) => STATUS_LABELS[status],
    );
    const selectedStatus = HABITAT_STATUSES.find((status) => (local.get(status) ?? 0) > 0);
    const selectedSites = inCountry.filter((site) => site.status === selectedStatus);
    const version = sites.version ?? '?';
    const filterNote = `Filtered to ${country}: ${inCountry.length} of ${all.length} real sites from contract v${version}.`;
    const zeroNote =
      zeroLabels.length === 0
        ? ''
        : zeroLabels.length === 1
          ? ` ${zeroLabels[0]} has no site there, so its row is disabled and still shows 0.`
          : ` ${zeroLabels.join(', ')} have no site there, so their rows are disabled and still show 0.`;

    return (
      <>
        <StateCell primitive="legend" state="static" note={`All ${all.length} sites from contract v${version}; a status with no site is omitted.`}>
          <Legend items={all} statusOf={statusOf} mode="static" />
        </StateCell>
        <StateCell primitive="legend" state="interactive" note={`${filterNote}${zeroNote} Toggle a row to narrow the counts further.`}>
          <LiveInteractive sites={all} inCountry={inCountry} />
        </StateCell>
        <StateCell
          primitive="legend"
          state="selected"
          note={`${filterNote} ${selectedStatus ? STATUS_LABELS[selectedStatus] : 'One status'} is toggled on, so the other rows show 0.`}
        >
          <Legend items={all} filtered={selectedSites} statusOf={statusOf} mode="interactive" selected={selectedStatus ? [selectedStatus] : []} onToggle={noop} />
        </StateCell>
        <StateCell primitive="legend" state="disabled-zero-row" note={`${filterNote}${zeroNote}`}>
          <Legend items={all} filtered={inCountry} statusOf={statusOf} mode="interactive" onToggle={noop} />
        </StateCell>
        <StateCell
          primitive="legend"
          state="with-evidence"
          note="The Evidence group counts reference_role: acoustic references have a recording behind them, location-only sites give a place and a label."
        >
          <Legend items={all} statusOf={statusOf} evidenceOf={evidenceOf} mode="static" />
        </StateCell>
      </>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="legend" state="data-error">
        <ErrorState
          announce="status"
          title="The reference sites could not be loaded."
          body="Try again, or reload the page."
          onRetry={() => {
            void sites.refetch();
          }}
        />
      </StateCell>
    );
  }

  return (
    <StateCell primitive="legend" state="data-loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

export function LegendSection() {
  return (
    <FixtureSection {...LEGEND_META}>
      <DataCells />
      <StateCell primitive="legend" state="loading">
        <Legend items={[]} statusOf={statusOf} mode="static" state="loading" />
      </StateCell>
      <StateCell primitive="legend" state="empty">
        <Legend items={[]} statusOf={statusOf} mode="static" state="empty" />
      </StateCell>
    </FixtureSection>
  );
}
