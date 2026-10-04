'use client';

import { useState } from 'react';
import { useReferenceSites, type ContractSite } from '@/features/contract';
import { DataTable, type DataTableColumn } from '@/features/instrument';
import { ErrorState, HABITAT_STATUSES, LoadingState, STATUS_LABELS, Skeleton, StatusMark } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';
import { SiteIdText } from './TableSection';

/**
 * DataTable (DS-05): every contract reference site, with the UI-SPEC columns Site (the mono id, with
 * a break opportunity after each underscore), Status (the mark and its word), Country, Dataset,
 * Evidence ("Acoustic reference" or "Location only", from reference_role) and Licence. The default
 * cell lists all sites and is live: the caption and footer counts are computed from the rows, the
 * Site header sorts, Enter or click on a row runs the row action (shown under the table) and Space
 * selects. The other cells show six real sites spread evenly through the contract (the footer reads
 * "Showing 6 of {n} sites", so the subset is stated), with hover, focus and the disabled row forced
 * onto real rows. The long-text cell and the phone cell are drawn in a 390 px container; the long
 * text cell leads with the rows whose longest text is longest.
 */

export const DATA_TABLE_META: FixtureSectionMeta = {
  slug: 'data-table',
  group: 'DS-05',
  kind: 'Primitive',
  title: 'DataTable',
  contract:
    'A caption with a computed count, a toolbar slot, a sortable table and a footer that reads "Showing k of n". Sorting is ascending or descending only. Enter or click runs the row action, Space selects. On a narrow container the table scrolls in a focusable region with a pinned first column.',
  data: 'contract sites.json through useReferenceSites (site_id, status, country, dataset_name, reference_role, licence); copy for the empty and error cells from UI-SPEC "DataTable"',
};

const SUBSET_ROWS = 6;
const LONG_TEXT_ROWS = 4;
const PHONE_WIDTH_CLASS = 'w-[390px] max-w-full';

const EVIDENCE_LABELS: Record<ContractSite['reference_role'], string> = {
  acoustic_reference: 'Acoustic reference',
  location_only: 'Location only',
};

const COLUMNS: DataTableColumn<ContractSite>[] = [
  { id: 'site', label: 'Site', sortable: true, sortValue: (site) => site.site_id, render: (site) => <SiteIdText id={site.site_id} /> },
  {
    id: 'status',
    label: 'Status',
    sortable: true,
    sortValue: (site) => HABITAT_STATUSES.indexOf(site.status),
    render: (site) => (
      <span className="inline-flex items-center gap-2">
        <StatusMark status={site.status} size={16} className="shrink-0" />
        <span>{STATUS_LABELS[site.status]}</span>
      </span>
    ),
  },
  { id: 'country', label: 'Country', sortable: true, sortValue: (site) => site.country, render: (site) => site.country },
  { id: 'dataset', label: 'Dataset', sortable: true, sortValue: (site) => site.dataset_name, render: (site) => site.dataset_name },
  { id: 'evidence', label: 'Evidence', render: (site) => EVIDENCE_LABELS[site.reference_role] },
  { id: 'licence', label: 'Licence', render: (site) => site.licence },
];

const INITIAL_SORT = { column: 'site', direction: 'ascending' } as const;

/** `count` sites spread evenly through the contract order, so the subset shows several countries and statuses. */
function spread(sites: readonly ContractSite[], count: number): ContractSite[] {
  const every = Math.max(1, Math.floor(sites.length / count));
  return sites.filter((_, index) => index % every === 0).slice(0, count);
}

/** The sites whose longest text (id, dataset, licence) is longest, longest first. */
function longestFirst(sites: readonly ContractSite[], count: number): ContractSite[] {
  const length = (site: ContractSite) => Math.max(site.site_id.length, site.dataset_name.length, site.licence.length);
  return [...sites].sort((a, b) => length(b) - length(a)).slice(0, count);
}

function noop() {
  /* a review page has nothing to retry or clear */
}

const siteId = (site: ContractSite) => site.site_id;

/** The live default table: the row action is shown under it, so it can be seen to run. */
function LiveTable({ sites }: { sites: readonly ContractSite[] }) {
  const [acted, setActed] = useState<string | null>(null);
  return (
    <>
      <DataTable<ContractSite>
        title="Reference sites"
        noun="sites"
        nounSingular="site"
        columns={COLUMNS}
        rows={sites}
        getRowId={siteId}
        initialSort={INITIAL_SORT}
        selectionMode="single"
        onRowAction={setActed}
      />
      <p className="mt-3 text-small text-muted" data-testid="row-action">
        {acted === null ? 'Row action: none yet.' : `Row action: open ${acted}.`}
      </p>
    </>
  );
}

function DataCells() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const all = sites.data;
    const subset = spread(all, SUBSET_ROWS);
    const ids = subset.map(siteId);
    const version = sites.version ?? '?';
    const subsetNote = `${subset.length} of ${all.length} real sites, evenly spaced through contract v${version}.`;
    const common = { title: 'Reference sites', noun: 'sites', nounSingular: 'site', columns: COLUMNS, getRowId: siteId } as const;

    return (
      <>
        <StateCell
          primitive="data-table"
          state="default"
          span="full"
          note={`All ${all.length} sites from contract v${version}. Try Tab, the arrow keys, Enter on a row, Space to select and Enter on a header to sort.`}
        >
          <LiveTable sites={all} />
        </StateCell>
        <StateCell primitive="data-table" state="hover" forced span="full" note={subsetNote}>
          <DataTable<ContractSite>
            {...common}
            title="Reference sites, hover"
            rows={subset}
            total={all.length}
            initialSort={INITIAL_SORT}
            selectionMode="single"
            onRowAction={noop}
            rowAttributes={(site) => (site.site_id === ids[1] ? { 'data-force-hover': '' } : undefined)}
          />
        </StateCell>
        <StateCell primitive="data-table" state="focus" forced span="full" note={subsetNote}>
          <DataTable<ContractSite>
            {...common}
            title="Reference sites, focus"
            rows={subset}
            total={all.length}
            initialSort={INITIAL_SORT}
            selectionMode="single"
            onRowAction={noop}
            rowAttributes={(site) => (site.site_id === ids[1] ? { 'data-force-focus': '' } : undefined)}
          />
        </StateCell>
        <StateCell primitive="data-table" state="selected" span="full" note={subsetNote}>
          <DataTable<ContractSite>
            {...common}
            title="Reference sites, selected"
            rows={subset}
            total={all.length}
            initialSort={INITIAL_SORT}
            selectionMode="single"
            defaultSelectedId={ids[1]}
          />
        </StateCell>
        <StateCell primitive="data-table" state="disabled-row" forced span="full" note={subsetNote}>
          <DataTable<ContractSite>
            {...common}
            title="Reference sites, disabled row"
            rows={subset}
            total={all.length}
            initialSort={INITIAL_SORT}
            selectionMode="single"
            onRowAction={noop}
            disabledIds={ids[1] ? [ids[1]] : []}
          />
        </StateCell>
        <StateCell primitive="data-table" state="sorted-descending" span="full" note={subsetNote}>
          <DataTable<ContractSite>
            {...common}
            title="Reference sites, sorted descending"
            rows={subset}
            total={all.length}
            initialSort={{ column: 'site', direction: 'descending' }}
          />
        </StateCell>
        <StateCell primitive="data-table" state="one-row" span="full" note={`One real site (${all[0]?.site_id ?? ''}) of ${all.length}.`}>
          <DataTable<ContractSite> {...common} title="Reference sites, one row" rows={all.slice(0, 1)} total={all.length} initialSort={INITIAL_SORT} />
        </StateCell>
        <StateCell
          primitive="data-table"
          state="long-text"
          note={`The ${LONG_TEXT_ROWS} real sites with the longest text, longest first, in a 390 px container: cells wrap and nothing ends in an ellipsis.`}
        >
          <div className={PHONE_WIDTH_CLASS}>
            <DataTable<ContractSite> {...common} title="Reference sites, long text" rows={longestFirst(all, LONG_TEXT_ROWS)} total={all.length} />
          </div>
        </StateCell>
        <StateCell
          primitive="data-table"
          state="phone-scroll"
          note={`${subsetNote} In a 390 px container the table scrolls sideways in a focusable region and the Site column stays pinned.`}
        >
          <div className={PHONE_WIDTH_CLASS}>
            <DataTable<ContractSite> {...common} title="Reference sites, phone" rows={subset} total={all.length} initialSort={INITIAL_SORT} />
          </div>
        </StateCell>
      </>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="data-table" state="data-error">
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
    <StateCell primitive="data-table" state="data-loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

export function DataTableSection() {
  return (
    <FixtureSection {...DATA_TABLE_META}>
      <DataCells />
      <StateCell primitive="data-table" state="loading" span="full">
        <DataTable<ContractSite>
          title="Reference sites, loading"
          noun="sites"
          columns={COLUMNS}
          getRowId={siteId}
          rows={[]}
          state="loading"
        />
      </StateCell>
      <StateCell primitive="data-table" state="empty">
        <DataTable<ContractSite>
          title="Reference sites, empty"
          noun="sites"
          columns={COLUMNS}
          getRowId={siteId}
          rows={[]}
          state="empty"
          onClearFilters={noop}
        />
      </StateCell>
      <StateCell primitive="data-table" state="error">
        <DataTable<ContractSite>
          title="Reference sites, error"
          noun="sites"
          columns={COLUMNS}
          getRowId={siteId}
          rows={[]}
          state="error"
          onRetry={noop}
        />
      </StateCell>
    </FixtureSection>
  );
}
