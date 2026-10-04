'use client';

import { useEffect, useMemo, useState } from 'react';
import { useReferenceSites, type ContractSite } from '@/features/contract';
import { allExcerpts, type AudioExcerpt } from '@/lib/audio-manifest';
import {
  Button,
  CommandPalette,
  CommandPaletteSurface,
  ErrorState,
  LoadingState,
  Skeleton,
  type CommandPaletteGroup,
} from '@/features/ui';
import { FixtureSection, type FixtureSectionMeta } from '../parts/FixtureSection';
import { StateCell } from '../parts/StateCell';

/**
 * CommandPalette (DS-04). The groups come from real data: Sites (every contract site: its id, its
 * location and its status mark), Clips (every committed audio excerpt: its id and its recorder-clock
 * time) and Methods (the four static page names). The UI-SPEC groups Clusters and Questions have no
 * real data in this phase, so no empty group is drawn for them; the primitive renders whatever groups
 * it is given.
 *
 * The closed cell is live: its button, and Ctrl+K or Cmd+K, open the real modal palette. The shortcut
 * is registered here, on this section only, and removed when the section unmounts; the primitive
 * itself owns no shortcut (the global registration is Phase 15). Every open state is drawn with
 * CommandPaletteSurface because the live modal portals out of its cell.
 */

export const COMMAND_PALETTE_META: FixtureSectionMeta = {
  slug: 'command-palette',
  group: 'DS-04',
  kind: 'Primitive',
  title: 'CommandPalette',
  contract:
    'Ctrl+K or Cmd+K opens it. Typing filters, the arrow keys move the active result, Enter runs it, Escape closes it and focus returns to the opener. A polite live region states the result count; the list scrolls inside a panel capped at 70dvh.',
  data: 'contract sites.json through useReferenceSites (site_id, location_label, status); data/audio-manifest.json (excerpt_id, recorded_at_recorder_clock); the four method page names of UI-SPEC "CommandPalette"',
};

const METHOD_PAGES = ['Model card', 'Frequency bands', 'Datasets', 'Limitations'] as const;

/** "2023-02-08T12:00:00" as "Recorded 2023-02-08 12:00, recorder clock". */
function recordedText(excerpt: AudioExcerpt): string {
  const [date, time = ''] = excerpt.recorded_at_recorder_clock.split('T');
  return `Recorded ${date} ${time.slice(0, 5)}, recorder clock`;
}

/** The three groups that have real items, from the contract sites, the audio manifest and the page names. */
export function paletteGroups(sites: readonly ContractSite[]): CommandPaletteGroup[] {
  return [
    {
      id: 'sites',
      heading: 'Sites',
      items: sites.map((site) => ({
        id: `site:${site.site_id}`,
        title: site.site_id,
        secondary: site.location_label,
        kindLabel: 'Site',
        status: site.status,
        kind: 'site' as const,
      })),
    },
    {
      id: 'clips',
      heading: 'Clips',
      items: allExcerpts().map((excerpt) => ({
        id: `clip:${excerpt.excerpt_id}`,
        title: excerpt.excerpt_id,
        secondary: recordedText(excerpt),
        kindLabel: 'Clip',
        kind: 'clip' as const,
      })),
    },
    {
      id: 'methods',
      heading: 'Methods',
      items: METHOD_PAGES.map((name) => ({
        id: `method:${name.toLowerCase().replace(/\s+/g, '-')}`,
        title: name,
        kindLabel: 'Method',
        kind: 'method' as const,
      })),
    },
  ];
}

/** True for Ctrl+K or Cmd+K. */
function isShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}

function noop() {
  /* a review page has nothing to run */
}

/** The live palette: the opener button, the page-local shortcut, and the result of the last action. */
function LivePalette({ groups, state }: { groups: CommandPaletteGroup[]; state: 'default' | 'loading' | 'error' }) {
  const [open, setOpen] = useState(false);
  const [acted, setActed] = useState<string | null>(null);

  // The shortcut belongs to this section: it is added on mount and removed on unmount.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isShortcut(event)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Open command palette
      </Button>
      <p className="text-small text-muted">Or press Ctrl+K or Cmd+K while this page is in front.</p>
      <p className="text-small text-muted" data-testid="palette-action">
        {acted === null ? 'Result run: none yet.' : `Result run: ${acted}.`}
      </p>
      <CommandPalette isOpen={open} onOpenChange={setOpen} groups={groups} state={state} onAction={setActed} />
    </div>
  );
}

function Cells() {
  const sites = useReferenceSites();
  const loaded = sites.data;
  const groups = useMemo(() => (loaded === undefined ? [] : paletteGroups(loaded)), [loaded]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const version = sites.version ?? '?';
  const state = loaded !== undefined ? 'default' : sites.error !== null ? 'error' : 'loading';

  const dataCells =
    loaded !== undefined ? (
      <>
        <StateCell
          primitive="command-palette"
          state="open-empty-query"
          note={`${total} real items: ${loaded.length} sites from contract v${version}, ${groups[1]?.items.length ?? 0} clips from the audio manifest and ${METHOD_PAGES.length} method pages.`}
        >
          <CommandPaletteSurface groups={groups} onAction={noop} />
        </StateCell>
        <StateCell primitive="command-palette" state="results" note="The query “ind” is typed in; the count is computed from the same filter.">
          <CommandPaletteSurface groups={groups} defaultQuery="ind" onAction={noop} />
        </StateCell>
        <StateCell primitive="command-palette" state="no-results" note="The query “zzz” matches nothing.">
          <CommandPaletteSurface groups={groups} defaultQuery="zzz" onAction={noop} />
        </StateCell>
      </>
    ) : sites.error !== null ? (
      <StateCell primitive="command-palette" state="data-error">
        <ErrorState
          announce="status"
          title="The reference sites could not be loaded."
          body="Try again, or reload the page."
          onRetry={() => {
            void sites.refetch();
          }}
        />
      </StateCell>
    ) : (
      <StateCell primitive="command-palette" state="data-loading">
        <LoadingState label="Loading reference sites…">
          <Skeleton on="panel" className="h-40 w-full" />
        </LoadingState>
      </StateCell>
    );

  return (
    <>
      <StateCell primitive="command-palette" state="closed" note="A live opener: press the button or Ctrl+K, type, use the arrow keys, Enter and Escape.">
        <LivePalette groups={groups} state={state} />
      </StateCell>
      {dataCells}
      <StateCell primitive="command-palette" state="loading">
        <CommandPaletteSurface groups={[]} state="loading" />
      </StateCell>
      <StateCell primitive="command-palette" state="error">
        <CommandPaletteSurface groups={[]} state="error" errorTitle="Search is unavailable." errorBody="Reload the page to try again." />
      </StateCell>
    </>
  );
}

export function CommandPaletteSection() {
  return (
    <FixtureSection {...COMMAND_PALETTE_META}>
      <Cells />
    </FixtureSection>
  );
}
