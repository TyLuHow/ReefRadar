'use client';

import { useReferenceSites, type ContractSite } from '@/features/contract';
import { Button, ErrorState, LoadingState, STATUS_LABELS, Sheet, SheetSurface, Skeleton, StatusMark } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Sheet (DS-04): the closed state is two live triggers (right and bottom), the open states are
 * drawn with SheetSurface because the live overlay portals out of its cell. The long-content cell
 * lists real contract sites (id, location and the reference status with its word, never colour
 * alone); while the contract loads it shows a loading state, and if it fails an error state with a
 * Retry. The Sheet is also used by this route's own phone navigation (the "Sections" button below
 * 1024 px), so the kit dogfoods itself.
 */

export const SHEET_META: FixtureSectionMeta = {
  slug: 'sheet',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'Sheet',
  contract:
    'A sheet is a dialog on an edge: the right edge on tablet and desktop, the bottom edge on phone. It has the dialog focus contract and is dismissed by the close button, a scrim press or Escape. It is not draggable, so it has no handle.',
  data: 'contract sites.json through useReferenceSites (site_id, location_label, status in the scrolling cell); this route\'s own "Sections" sheet below 1024 px',
};

const LONG_ROWS = 16;

function noop() {
  /* a review page has nothing to retry */
}

const SHEET_BODY = 'This panel opens from an edge of the screen. Focus stays inside it until it closes.';

function SiteRows({ sites }: { sites: readonly ContractSite[] }) {
  return (
    <ul>
      {sites.map((site) => (
        <li key={site.site_id} className="flex min-h-11 items-center gap-3 border-b border-rule">
          <StatusMark status={site.status} size={16} />
          <span className="min-w-0">
            <span className="font-data text-small">{site.site_id}</span>
            <span className="text-small text-muted">{` · ${site.location_label} · ${STATUS_LABELS[site.status]}`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function LongContentCell() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const shown = sites.data.slice(0, LONG_ROWS);
    return (
      <StateCell
        primitive="sheet"
        state="long-content-scrolling"
        note={`${shown.length} real sites from contract v${sites.version ?? '?'}. The body scrolls under the fixed title row.`}
      >
        <SheetSurface side="right" title="Reference sites" className="h-96">
          <SiteRows sites={shown} />
        </SheetSurface>
      </StateCell>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="sheet" state="long-content-error">
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
    <StateCell primitive="sheet" state="long-content-loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

export function SheetSection() {
  return (
    <FixtureSection {...SHEET_META}>
      <StateCell primitive="sheet" state="closed" note="Live triggers: press one, then try Tab, Escape and a click on the scrim.">
        <div className="flex flex-wrap items-center gap-3">
          <Sheet side="right" title="Right sheet" trigger={<Button variant="secondary">Open right sheet</Button>}>
            <p>{SHEET_BODY}</p>
          </Sheet>
          <Sheet side="bottom" title="Bottom sheet" trigger={<Button variant="secondary">Open bottom sheet</Button>}>
            <p>{SHEET_BODY}</p>
          </Sheet>
        </div>
      </StateCell>
      <StateCell primitive="sheet" state="open-right" note="Drawn with SheetSurface: 420 px at most, heavy rule on the leading edge.">
        <SheetSurface side="right" title="Right sheet" className="h-72">
          <p>{SHEET_BODY}</p>
        </SheetSurface>
      </StateCell>
      <StateCell primitive="sheet" state="open-bottom" note="Drawn with SheetSurface: at most 85dvh, heavy rule on top, square corners.">
        <SheetSurface side="bottom" title="Bottom sheet">
          <p>{SHEET_BODY}</p>
        </SheetSurface>
      </StateCell>
      <LongContentCell />
      <StateCell primitive="sheet" state="loading">
        <SheetSurface side="right" title="Site details" bodyState="loading" loadingLabel="Loading site details…" className="h-72" />
      </StateCell>
      <StateCell primitive="sheet" state="error">
        <SheetSurface
          side="right"
          title="Site details"
          bodyState="error"
          errorTitle="The site details could not be loaded."
          errorBody="Reload the page to try again."
          onRetry={noop}
          className="h-72"
        />
      </StateCell>
    </FixtureSection>
  );
}
