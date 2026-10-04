'use client';

import clsx from 'clsx';
import { AudioLines, BookOpen, Layers, Lightbulb, MapPin, Search } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Autocomplete,
  Dialog as RacDialog,
  DialogTrigger,
  Header,
  Input,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Modal,
  SearchField,
  useFilter,
} from 'react-aria-components';
import { OVERLAY_SCRIM, SurfaceModalOverlay } from './Dialog';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { Skeleton } from './Skeleton';
import { StatusMark } from './StatusMark';
import { STATUS_LABELS, type HabitatStatus } from './status-shapes';

/**
 * CommandPalette, CommandPaletteSurface (DS-04, UI-SPEC "CommandPalette").
 *
 * A search box over grouped results in a modal. Behaviour comes from React Aria Components:
 * `Autocomplete` keeps focus in the input and moves a virtual focus through the `ListBox`, so the
 * arrow keys, Home and End move the active result (`aria-activedescendant` on the input), typing
 * filters, and Enter runs the active result. `ModalOverlay` and `Modal` trap focus, hide the page
 * behind and return focus to whatever opened the palette when it closes.
 *
 * Escape closes the palette in one press: a search field would clear its text first and close on the
 * second press, so the key is taken before the field sees it. The palette starts empty each time it
 * opens (its state lives inside the open panel).
 *
 * Filtering is "title contains the query", ignoring case and accents (`useFilter` with base
 * sensitivity). The same function drives the visible list and the count in the polite live region,
 * so what is announced is what is listed ("7 results", "1 result", "0 results"). A group with no
 * match is not drawn, and a query with no match says so ("No results for “zzz”.").
 *
 * The primitive owns no keyboard shortcut: whoever uses it decides when it opens (the fixtures page
 * registers Ctrl+K and Cmd+K for itself; the global registration is a later phase). Classes are joined
 * with `clsx`, not `cn`, because tailwind-merge 2.x predates Tailwind 4's custom colour and size
 * names (see Button.tsx). `CommandPaletteSurface` draws the same panel as a plain element for the
 * open-state cells of the fixtures route.
 */

export type CommandPaletteKind = 'site' | 'cluster' | 'clip' | 'question' | 'method';

export interface CommandPaletteItem {
  /** The key passed to `onAction`. */
  id: string;
  /** The result's name; the filter matches on it. */
  title: string;
  /** A muted second line. */
  secondary?: string;
  /** What sort of result this is, in words, shown at the end of the row ("Site", "Clip"). */
  kindLabel: string;
  /** A site's status: draws the status mark. Without it the row draws a kind icon. */
  status?: HabitatStatus;
  /** Picks the kind icon for a row that has no status. Defaults to `site`. */
  kind?: CommandPaletteKind;
}

export interface CommandPaletteGroup {
  id: string;
  /** The group's name, set as an eyebrow and used as its accessible name. */
  heading: string;
  items: CommandPaletteItem[];
}

export type CommandPaletteState = 'default' | 'loading' | 'error';

interface StateCopy {
  /** The input's accessible name. */
  inputLabel?: string;
  loadingLabel?: string;
  errorTitle?: string;
  errorBody?: string;
}

export interface CommandPaletteProps extends StateCopy {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  groups: CommandPaletteGroup[];
  /** Called with the result's id when it is run (Enter or a press); the palette then closes. */
  onAction: (id: string) => void;
  /** `loading` or `error` replaces the list. */
  state?: CommandPaletteState;
  /** The dialog's accessible name. */
  label?: string;
}

const KIND_ICON: Record<CommandPaletteKind, typeof MapPin> = {
  site: MapPin,
  cluster: Layers,
  clip: AudioLines,
  question: Lightbulb,
  method: BookOpen,
};

const PANEL =
  'flex flex-col bg-ground text-ink font-body text-body outline-none rule-top-heavy rounded-surface max-h-[70dvh]';

const ROW = clsx(
  'relative flex min-h-11 items-center gap-3 px-4 py-2 border-b border-rule text-start font-body text-body text-ink outline-none cursor-pointer',
  'transition-colors duration-(--duration-fast) ease-(--ease)',
  'hover-state:bg-panel-hover data-focused:bg-panel-hover data-focused:focus-ring-inset',
);

const LOADING_ROWS = 5;

function plural(count: number): string {
  return `${count} ${count === 1 ? 'result' : 'results'}`;
}

function Row({ item }: { item: CommandPaletteItem }) {
  const Icon = KIND_ICON[item.kind ?? 'site'];
  return (
    <ListBoxItem id={item.id} textValue={item.title} className={ROW}>
      {item.status ? (
        <StatusMark status={item.status} size={16} className="shrink-0" />
      ) : (
        <Icon aria-hidden="true" size={16} className="shrink-0" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span data-title="" className="text-body font-semibold wrap-anywhere">
          {item.title}
        </span>
        {item.secondary ? <span className="text-small text-muted wrap-anywhere">{item.secondary}</span> : null}
        {item.status ? <span className="sr-only">{`, ${STATUS_LABELS[item.status]}`}</span> : null}
      </span>
      <span className="font-data text-eyebrow text-muted ms-auto shrink-0">{item.kindLabel}</span>
    </ListBoxItem>
  );
}

interface PaletteBodyProps extends StateCopy {
  groups: CommandPaletteGroup[];
  state: CommandPaletteState;
  defaultQuery?: string;
  autoFocus?: boolean;
  /** Runs a result (the caller closes the panel). */
  onRun?: (id: string) => void;
  /** Closes the panel; Escape in the input calls it. */
  onDismiss?: () => void;
}

/** The search row, the results (or the state replacing them), the live region and the footer hint. */
function PaletteBody({
  groups,
  state,
  defaultQuery = '',
  autoFocus = false,
  onRun,
  onDismiss,
  inputLabel = 'Search',
  loadingLabel = 'Loading search…',
  errorTitle = 'Search is unavailable.',
  errorBody = 'Reload the page to try again.',
}: PaletteBodyProps) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [query, setQuery] = useState(defaultQuery);
  const needle = query.trim();
  const matches = (title: string) => contains(title, needle);
  const count = groups.reduce((sum, group) => sum + group.items.filter((item) => matches(item.title)).length, 0);

  function onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || !onDismiss) return;
    event.preventDefault();
    event.stopPropagation();
    onDismiss();
  }

  let results: ReactNode;
  if (state === 'loading') {
    results = (
      <LoadingState label={loadingLabel} className="px-4 py-4">
        {Array.from({ length: LOADING_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </LoadingState>
    );
  } else if (state === 'error') {
    results = <ErrorState announce="status" headingLevel={3} title={errorTitle} body={errorBody} className="mx-4 my-4" />;
  } else {
    results = (
      <ListBox
        aria-label="Results"
        onAction={(key) => onRun?.(String(key))}
        renderEmptyState={() => <p className="px-4 py-6 text-body text-ink">{`No results for “${needle}”.`}</p>}
        className="min-h-0 flex-1 overflow-y-auto outline-none"
      >
        {groups.map((group) => (
          <ListBoxSection key={group.id}>
            <Header className="type-eyebrow text-muted px-4 pt-4 pb-2 border-b border-rule bg-ground">{group.heading}</Header>
            {group.items.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ListBoxSection>
        ))}
      </ListBox>
    );
  }

  return (
    <div onKeyDownCapture={onKeyDownCapture} className="flex min-h-0 flex-1 flex-col">
      <Autocomplete
        inputValue={query}
        onInputChange={setQuery}
        filter={(textValue, inputValue) => contains(textValue, inputValue.trim())}
      >
        <SearchField aria-label={inputLabel} autoFocus={autoFocus} isDisabled={state === 'error'} className="relative block border-b border-rule">
          <Search aria-hidden="true" size={20} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search sites, clips and methods"
            className={clsx(
              'block h-14 w-full bg-transparent ps-12 pe-4 font-body text-body text-ink outline-none placeholder:text-muted',
              'focus-visible:focus-ring-inset [&::-webkit-search-cancel-button]:hidden',
            )}
          />
        </SearchField>
        {results}
      </Autocomplete>
      {state === 'default' ? (
        <div role="status" aria-live="polite" className="sr-only">
          {plural(count)}
        </div>
      ) : null}
      <p className="pointer-coarse:hidden border-t border-rule px-4 py-3 font-data text-eyebrow text-muted">
        Up and down arrows move, Enter opens, Esc closes
      </p>
    </div>
  );
}

/** A command palette in a modal: opened and closed by the caller, focus returns to the opener. */
export function CommandPalette({ isOpen, onOpenChange, groups, onAction, state = 'default', label = 'Command palette', ...copy }: CommandPaletteProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <SurfaceModalOverlay isDismissable className={clsx(OVERLAY_SCRIM, 'flex items-start justify-center')}>
        <Modal className={clsx(PANEL, 'w-[min(640px,calc(100%-32px))] mt-[15vh] max-sm:mt-4')}>
          <RacDialog aria-label={label} className="flex min-h-0 flex-1 flex-col outline-none">
            {({ close }) => (
              <PaletteBody
                {...copy}
                groups={groups}
                state={state}
                autoFocus
                onRun={(id) => {
                  onAction(id);
                  close();
                }}
                onDismiss={close}
              />
            )}
          </RacDialog>
        </Modal>
      </SurfaceModalOverlay>
    </DialogTrigger>
  );
}

export interface CommandPaletteSurfaceProps extends StateCopy {
  groups: CommandPaletteGroup[];
  state?: CommandPaletteState;
  /** The query the panel starts with. */
  defaultQuery?: string;
  onAction?: (id: string) => void;
  /** Sizes it (a width for the phone cell). */
  className?: string;
}

/**
 * The palette panel as a plain element (no overlay, no role), for static open-state cells. It is
 * still a working search: typing filters and the arrow keys move the active result.
 */
export function CommandPaletteSurface({ groups, state = 'default', defaultQuery, onAction, className, ...copy }: CommandPaletteSurfaceProps) {
  return (
    <div data-command-palette-surface="" className={clsx(PANEL, 'w-full max-w-[640px]', className)}>
      <PaletteBody {...copy} groups={groups} state={state} defaultQuery={defaultQuery} onRun={onAction} />
    </div>
  );
}
