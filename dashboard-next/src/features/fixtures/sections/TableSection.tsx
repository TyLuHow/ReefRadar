'use client';

import { Fragment, useState } from 'react';
import type { SortDescriptor } from 'react-aria-components';
import { useReferenceSites, type ContractSite } from '@/features/contract';
import { Cell, Column, ErrorState, LoadingState, Row, Skeleton, Table, TableBody, TableHeader } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Table (DS-04): the base grid over real contract sites (site id, country, licence). The sites are
 * the first site of each of up to six countries, in contract order, so the sorted-column cell has
 * something to sort. Hover, focus and the disabled row are forced onto real rows and say "State
 * forced for review"; the selected row and the sorted column are real Table state. The default
 * cell is live: Tab enters the grid, the arrow keys move between rows, Enter or Space on a header
 * sorts, Space selects a row. The table's loading, empty and error states belong to DataTable (the
 * next section family), so they are not drawn here.
 */

export const TABLE_META: FixtureSectionMeta = {
  slug: 'table',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'Table',
  contract:
    'One Tab stop; arrow keys move between rows; Space toggles selection; Enter runs the row action; a sortable header toggles on Enter or Space and carries aria-sort. Text wraps and is never cut with an ellipsis.',
  data: 'contract sites.json through useReferenceSites (site_id, country, licence), the first site of each of up to six countries',
};

const ROWS_SHOWN = 6;

/** The first site of each of up to `count` countries, in contract order. */
function onePerCountry(sites: readonly ContractSite[], count: number): ContractSite[] {
  const seen = new Set<string>();
  const picked: ContractSite[] = [];
  for (const site of sites) {
    if (seen.has(site.country)) continue;
    seen.add(site.country);
    picked.push(site);
    if (picked.length === count) break;
  }
  return picked;
}

/** A site id with a line-break opportunity after each underscore, so a narrow column never overflows. */
export function SiteIdText({ id }: { id: string }) {
  const parts = id.split('_');
  return (
    <span className="font-data">
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
    </span>
  );
}

type SortKey = 'site_id' | 'country' | 'licence';

interface SiteTableProps {
  sites: readonly ContractSite[];
  label: string;
  initialSort?: { column: SortKey; direction: 'ascending' | 'descending' };
  selectedId?: string;
  disabledId?: string;
  hoverId?: string;
  focusId?: string;
}

function SiteTable({ sites, label, initialSort, selectedId, disabledId, hoverId, focusId }: SiteTableProps) {
  const [sort, setSort] = useState<SortDescriptor | undefined>(initialSort);
  const rows = [...sites];
  if (sort) {
    const key = sort.column as SortKey;
    rows.sort((a, b) => a[key].localeCompare(b[key], 'en', { numeric: true }) * (sort.direction === 'descending' ? -1 : 1));
  }
  return (
    <Table
      aria-label={label}
      selectionMode="single"
      defaultSelectedKeys={selectedId ? [selectedId] : []}
      disabledKeys={disabledId ? [disabledId] : []}
      sortDescriptor={sort}
      onSortChange={setSort}
    >
      <TableHeader>
        <Column id="site_id" isRowHeader allowsSorting>
          Site
        </Column>
        <Column id="country" allowsSorting>
          Country
        </Column>
        <Column id="licence" allowsSorting>
          Licence
        </Column>
      </TableHeader>
      <TableBody>
        {rows.map((site) => {
          const forced = {
            ...(hoverId === site.site_id ? { 'data-force-hover': '' } : {}),
            ...(focusId === site.site_id ? { 'data-force-focus': '' } : {}),
          };
          return (
            <Row key={site.site_id} id={site.site_id} textValue={site.site_id} {...forced}>
              <Cell>
                <SiteIdText id={site.site_id} />
              </Cell>
              <Cell>{site.country}</Cell>
              <Cell>{site.licence}</Cell>
            </Row>
          );
        })}
      </TableBody>
    </Table>
  );
}

function DataCells() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const shown = onePerCountry(sites.data, ROWS_SHOWN);
    const version = sites.version ?? '?';
    const note = `${shown.length} real sites, one per country, from contract v${version}.`;
    const ids = shown.map((site) => site.site_id);
    return (
      <>
        <StateCell
          primitive="table"
          state="default"
          note={`${note} Try Tab, the arrow keys, Space on a row and Enter or Space on a header.`}
        >
          <SiteTable sites={shown} label="Reference sites, default" />
        </StateCell>
        <StateCell primitive="table" state="hover-row" forced note={note}>
          <SiteTable sites={shown} label="Reference sites, hover row" hoverId={ids[1]} />
        </StateCell>
        <StateCell primitive="table" state="focus" forced note={note}>
          <SiteTable sites={shown} label="Reference sites, focus" focusId={ids[1]} />
        </StateCell>
        <StateCell primitive="table" state="selected-row" note={note}>
          <SiteTable sites={shown} label="Reference sites, selected row" selectedId={ids[1]} />
        </StateCell>
        <StateCell primitive="table" state="disabled-row" forced note={note}>
          <SiteTable sites={shown} label="Reference sites, disabled row" disabledId={ids[1]} />
        </StateCell>
        <StateCell primitive="table" state="sorted-column" note={`Sorted by country, ascending. ${note}`}>
          <SiteTable sites={shown} label="Reference sites, sorted by country" initialSort={{ column: 'country', direction: 'ascending' }} />
        </StateCell>
      </>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="table" state="data-error">
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
    <StateCell primitive="table" state="data-loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

export function TableSection() {
  return (
    <FixtureSection {...TABLE_META}>
      <DataCells />
    </FixtureSection>
  );
}
