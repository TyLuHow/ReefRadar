'use client';

import { useReferenceSites, type ContractSite } from '@/features/contract';
import { AlertDialog, Button, Dialog, DialogSurface, ErrorState, LoadingState, Skeleton } from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * Dialog (DS-04): the closed state is a live trigger (the cell the keyboard and axe e2e specs open);
 * every open state is drawn with DialogSurface, because the live overlay portals out of its cell.
 * The long-content cell fills the body with real contract sites, each row showing that site's own
 * id, location and label definition (never one site's definition under another site's name); the
 * site with the longest definition comes first so the wrapping is exercised. While the contract
 * loads that cell shows a loading state, and if it fails an error state with a Retry.
 */

export const DIALOG_META: FixtureSectionMeta = {
  slug: 'dialog',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'Dialog',
  contract:
    'A modal dialog traps focus, cycles Tab and Shift+Tab inside, closes on Escape and returns focus to its trigger. An alertdialog starts on its safe action and ignores a scrim press. The body scrolls under a fixed title row and action row.',
  data: 'contract sites.json through useReferenceSites (site_id, location_label, label_definition in the scrolling cell); UI-SPEC "Copywriting Contract" for the discard and error copy',
};

const LONG_ROWS = 14;

/** The first `count` sites, led by the one whose own label definition is longest. */
function longContentSites(sites: readonly ContractSite[], count: number): ContractSite[] {
  const withDefinition = sites.filter((site) => site.label_definition !== null && site.label_definition !== '');
  const longest = withDefinition.reduce<ContractSite | undefined>(
    (best, site) => (best === undefined || (site.label_definition?.length ?? 0) > (best.label_definition?.length ?? 0) ? site : best),
    undefined,
  );
  const rest = withDefinition.filter((site) => site !== longest);
  return (longest === undefined ? rest : [longest, ...rest]).slice(0, count);
}

function noop() {
  /* a review page has nothing to retry */
}

function SiteDefinitionRows({ sites }: { sites: readonly ContractSite[] }) {
  return (
    <ul className="grid gap-4">
      {sites.map((site) => (
        <li key={site.site_id}>
          <p className="font-data text-small">{`${site.site_id} · ${site.location_label}`}</p>
          <p className="text-body">{site.label_definition}</p>
        </li>
      ))}
    </ul>
  );
}

function LongContentCell() {
  const sites = useReferenceSites();

  if (sites.data !== undefined) {
    const shown = longContentSites(sites.data, LONG_ROWS);
    return (
      <StateCell
        primitive="dialog"
        state="scrolling-long-content"
        note={`${shown.length} real sites from contract v${sites.version ?? '?'}, each with its own label definition. The body scrolls; the title row and the action row stay.`}
      >
        <DialogSurface
          title="Label definitions"
          className="max-h-96"
          actions={
            <Button variant="secondary" onPress={noop}>
              Done
            </Button>
          }
        >
          <SiteDefinitionRows sites={shown} />
        </DialogSurface>
      </StateCell>
    );
  }

  if (sites.error !== null) {
    return (
      <StateCell primitive="dialog" state="scrolling-long-content-error">
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
    <StateCell primitive="dialog" state="scrolling-long-content-loading">
      <LoadingState label="Loading reference sites…">
        <Skeleton on="panel" className="h-40 w-full" />
      </LoadingState>
    </StateCell>
  );
}

const CONTRACT_BODY = 'Focus moves into this dialog when it opens. It stays here until the dialog closes, and it returns to the control that opened it.';

export function DialogSection() {
  return (
    <FixtureSection {...DIALOG_META}>
      <StateCell primitive="dialog" state="closed" note="A live trigger: press it, then try Tab, Shift+Tab and Escape.">
        <Dialog
          title="About this dialog"
          trigger={<Button variant="secondary">Open dialog</Button>}
          actions={({ close }) => (
            <Button variant="primary" onPress={close}>
              Done
            </Button>
          )}
        >
          <p>{CONTRACT_BODY}</p>
        </Dialog>
      </StateCell>
      <StateCell primitive="dialog" state="open" note="Drawn with DialogSurface; the trigger in the closed cell opens the real dialog.">
        <DialogSurface
          title="About this dialog"
          actions={
            <Button variant="primary" onPress={noop}>
              Done
            </Button>
          }
        >
          <p>{CONTRACT_BODY}</p>
        </DialogSurface>
      </StateCell>
      <LongContentCell />
      <StateCell primitive="dialog" state="loading">
        <DialogSurface title="Site details" bodyState="loading" loadingLabel="Loading site details…" />
      </StateCell>
      <StateCell primitive="dialog" state="error">
        <DialogSurface
          title="Provenance"
          bodyState="error"
          errorTitle="Provenance could not be loaded."
          errorBody="Try again, or open Methods and limits."
          onRetry={noop}
        />
      </StateCell>
      <StateCell primitive="dialog" state="phone" note="On a 390 px screen the panel is 358 px wide (16 px margins) and scrolls inside.">
        <DialogSurface
          title="About this dialog"
          className="w-[358px] max-w-full"
          actions={
            <Button variant="primary" onPress={noop}>
              Done
            </Button>
          }
        >
          <p>{CONTRACT_BODY}</p>
        </DialogSurface>
      </StateCell>
      <StateCell
        primitive="dialog"
        state="alertdialog"
        span="full"
        note="A live trigger opens the real alertdialog; the surface below is the same panel drawn statically."
      >
        <div className="flex flex-col items-start gap-4">
          <AlertDialog
            title="Discard this comparison?"
            body="The clips and their levels will be removed from this view."
            safeLabel="Keep comparison"
            confirmLabel="Discard comparison"
            trigger={<Button variant="secondary">Open alert dialog</Button>}
          />
          <DialogSurface
            variant="alertdialog"
            title="Discard this comparison?"
            actions={
              <>
                <Button variant="secondary" onPress={noop}>
                  Keep comparison
                </Button>
                <Button variant="primary" onPress={noop}>
                  Discard comparison
                </Button>
              </>
            }
          >
            <p>The clips and their levels will be removed from this view.</p>
          </DialogSurface>
        </div>
      </StateCell>
    </FixtureSection>
  );
}
