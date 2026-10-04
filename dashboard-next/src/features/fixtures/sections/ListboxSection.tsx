'use client';

import { useReferenceSites, type ContractSite } from '@/features/contract';
import {
  ErrorState,
  Listbox,
  ListboxItem,
  ListboxSection as ListboxGroup,
  LoadingState,
  Skeleton,
  TooltipSurface,
} from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Listbox (DS-04): every item is a real contract site, grouped by country in ListboxSection groups;
 * the label is the site id, the muted description is its location_label and the status mark is its
 * reference status from the contract (the mark is decorative; the status word is in the row's
 * text for assistive technology). The default cell lists all sites in a scrolling list (the one
 * the keyboard e2e spec drives with typeahead, Home, End, PageUp and PageDown); the other cells
 * list the first three countries with up to three sites each, so each state stays readable. Hover,
 * focus and the disabled item are forced onto real rows and say "State forced for review". While
 * the contract loads the data cells show a loading state, and if it fails an error state with a
 * Retry; the loading, empty and error list states need no data and always show.
 */

export const LISTBOX_META: FixtureSectionMeta = {
  slug: 'listbox',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'Listbox',
  contract:
    'Tab enters the list; arrow keys, Home, End, PageUp, PageDown and typing move focus; Enter selects in single selection and Space toggles in multiple selection. Rows are at least 44 px. A disabled item is skipped and says why.',
  data: 'contract sites.json through useReferenceSites (site_id, location_label, status, country); copy for the empty and error cells from UI-SPEC "Copywriting Contract"',
};

const COUNTRIES_SHOWN = 3;
const SITES_PER_COUNTRY = 3;

interface Group {
  country: string;
  sites: ContractSite[];
}

/** Sites grouped by country, in contract order. */
function groupByCountry(sites: readonly ContractSite[]): Group[] {
  const groups: Group[] = [];
  for (const site of sites) {
    const existing = groups.find((group) => group.country === site.country);
    if (existing) existing.sites.push(site);
    else groups.push({ country: site.country, sites: [site] });
  }
  return groups;
}

function noop() {
  /* a review page has nothing to retry */
}

interface RowFlags {
  forceHover?: string;
  forceFocus?: string;
  disabled?: string;
}

function SiteGroups({ groups, flags = {} }: { groups: readonly Group[]; flags?: RowFlags }) {
  return (
    <>
      {groups.map((group) => (
        <ListboxGroup key={group.country} title={group.country}>
          {group.sites.map((site) => {
            const forced = {
              ...(flags.forceHover === site.site_id ? { 'data-force-hover': '' } : {}),
              ...(flags.forceFocus === site.site_id ? { 'data-force-focus': '' } : {}),
            };
            const disabled = flags.disabled === site.site_id;
            return (
              <ListboxItem
                key={site.site_id}
                id={site.site_id}
                textValue={site.site_id}
                status={site.status}
                description={site.location_label}
                isDisabled={disabled}
                disabledReason={disabled ? DISABLED_REASON : undefined}
                {...forced}
              >
                {site.site_id}
              </ListboxItem>
            );
          })}
        </ListboxGroup>
      ))}
    </>
  );
}

const DISABLED_REASON = 'Disabled for review';

function DataCells() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const all = groupByCountry(sites.data);
    const few = all.slice(0, COUNTRIES_SHOWN).map((group) => ({ ...group, sites: group.sites.slice(0, SITES_PER_COUNTRY) }));
    const ids = few.flatMap((group) => group.sites.map((site) => site.site_id));
    const version = sites.version ?? '?';
    const subsetNote = `${ids.length} real sites in ${few.length} countries from contract v${version}.`;

    return (
      <>
        <StateCell
          primitive="listbox"
          state="default"
          span="full"
          note={`All ${sites.data.length} sites in ${all.length} countries from contract v${version}. The list scrolls; try Tab, the arrow keys, Home, End, PageUp, PageDown and typing a site id.`}
        >
          <Listbox aria-label="Reference sites, all" selectionMode="single" className="max-h-80 overflow-y-auto">
            <SiteGroups groups={all} />
          </Listbox>
        </StateCell>
        <StateCell primitive="listbox" state="hover" forced note={subsetNote}>
          <Listbox aria-label="Reference sites, hover" selectionMode="single">
            <SiteGroups groups={few} flags={{ forceHover: ids[1] }} />
          </Listbox>
        </StateCell>
        <StateCell primitive="listbox" state="focus" forced note={subsetNote}>
          <Listbox aria-label="Reference sites, focus" selectionMode="single">
            <SiteGroups groups={few} flags={{ forceFocus: ids[1] }} />
          </Listbox>
        </StateCell>
        <StateCell primitive="listbox" state="selected" note={`Single selection. ${subsetNote}`}>
          <Listbox aria-label="Reference sites, selected" selectionMode="single" defaultSelectedKeys={[ids[1] ?? '']}>
            <SiteGroups groups={few} />
          </Listbox>
        </StateCell>
        <StateCell primitive="listbox" state="multiple" note={`Multiple selection: Space toggles. ${subsetNote}`}>
          <Listbox aria-label="Reference sites, multiple" selectionMode="multiple" defaultSelectedKeys={[ids[0] ?? '', ids[4] ?? '']}>
            <SiteGroups groups={few} />
          </Listbox>
        </StateCell>
        <StateCell
          primitive="listbox"
          state="disabled-item"
          forced
          note={`One item is disabled, so the arrow keys skip it. The tooltip below is what mouse hover shows. ${subsetNote}`}
        >
          <div className="flex flex-col items-start gap-2">
            <div className="w-full">
              <Listbox aria-label="Reference sites, disabled item" selectionMode="single">
                <SiteGroups groups={few} flags={{ disabled: ids[1] }} />
              </Listbox>
            </div>
            <TooltipSurface>{DISABLED_REASON}</TooltipSurface>
          </div>
        </StateCell>
      </>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="listbox" state="data-error">
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
    <StateCell primitive="listbox" state="data-loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

export function ListboxSection() {
  return (
    <FixtureSection {...LISTBOX_META}>
      <DataCells />
      <StateCell primitive="listbox" state="loading">
        <Listbox aria-label="Reference sites, loading" selectionMode="single" state="loading" loadingLabel="Loading sites…">
          {null}
        </Listbox>
      </StateCell>
      <StateCell primitive="listbox" state="empty">
        <Listbox
          aria-label="Reference sites, empty"
          selectionMode="single"
          state="empty"
          emptyTitle="No sites to show."
          emptyBody="Choose another country."
        >
          {null}
        </Listbox>
      </StateCell>
      <StateCell primitive="listbox" state="error">
        <Listbox
          aria-label="Reference sites, error"
          selectionMode="single"
          state="error"
          errorTitle="The list could not be loaded."
          errorBody="Reload the page to try again."
          onRetry={noop}
        >
          {null}
        </Listbox>
      </StateCell>
    </FixtureSection>
  );
}
