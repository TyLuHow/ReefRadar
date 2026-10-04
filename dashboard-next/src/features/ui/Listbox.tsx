'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  Header,
  ListBox as RacListBox,
  ListBoxItem as RacListBoxItem,
  ListBoxSection as RacListBoxSection,
  type ListBoxItemProps as RacListBoxItemProps,
  type ListBoxProps as RacListBoxProps,
} from 'react-aria-components';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { Skeleton } from './Skeleton';
import { StatusMark } from './StatusMark';
import { STATUS_LABELS, type HabitatStatus } from './status-shapes';
import { TooltipSurface } from './Tooltip';

/**
 * Listbox, ListboxItem and ListboxSection (DS-04, UI-SPEC "Listbox").
 *
 * Behaviour comes from React Aria Components' `ListBox`: Tab enters, the arrow keys, Home, End,
 * PageUp and PageDown move focus, typing the start of an item's `textValue` jumps to it, Enter
 * selects in single selection and Space toggles in multiple selection, and a disabled item is
 * skipped by every one of those keys. Rows are at least 44 px high with a rule between them;
 * hover fills with `panel-hover`; keyboard focus is an inset outline in the focus token (the row is
 * flush with its neighbours); a selected row takes the `selected` fill, semibold text and a 3 px
 * ink bar on the inline start edge. Multiple selection adds a leading 16 px square checkbox
 * (1 px ink outline, `control` fill with a check when on).
 *
 * A row may hold a status mark (decorative: the status word is also in the row's text for assistive technology), a label, a
 * muted description and a trailing count in the data face. A disabled row explains itself: the
 * reason is in the row's text for assistive technology and in a tooltip after 300 ms of mouse hover
 * (a disabled row cannot take focus, and touch devices never show a tooltip, so the words are not
 * lost). The tooltip is fixed-positioned beside the row, so a scrolling list cannot clip it, and
 * Escape dismisses it.
 *
 * `state` replaces the list with the Loading state (six skeleton rows and a label), the Empty state
 * or the Error state, so a list with nothing to show never renders an empty `listbox`. Classes are
 * joined with `clsx`, not `cn`, because tailwind-merge 2.x predates Tailwind 4's custom colour and
 * size names (see Button.tsx).
 */

export type ListboxState = 'default' | 'loading' | 'empty' | 'error';

const LOADING_ROWS = 6;

// Disabled text: rule-strong lightened 40% toward the ground (UI-SPEC common rules).
const DISABLED_TEXT = 'data-disabled:text-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]';

const ROW = clsx(
  'relative flex min-h-11 items-center gap-3 px-4 py-2 border-b border-rule text-start font-body text-body text-ink outline-none cursor-pointer',
  'transition-colors duration-(--duration-fast) ease-(--ease)',
  'hover-state:bg-panel-hover focus-state:focus-ring-inset',
  'data-selected:bg-selected data-selected:font-semibold',
  // The selected bar: 3 px ink on the inline start edge.
  'before:absolute before:inset-y-0 before:start-0 before:hidden before:w-[3px] before:bg-ink data-selected:before:block',
  'data-disabled:cursor-not-allowed',
  DISABLED_TEXT,
);

export interface ListboxProps<T extends object = object>
  extends Omit<RacListBoxProps<T>, 'className' | 'children' | 'renderEmptyState' | 'aria-label'> {
  /** The list's accessible name. */
  'aria-label': string;
  /** Replaces the list with a Loading, Empty or Error state. */
  state?: ListboxState;
  /** What is loading, as words (Loading state label). */
  loadingLabel?: string;
  /** What is missing, as a sentence (Empty state heading). */
  emptyTitle?: string;
  /** What to do next, as a sentence (Empty state body). */
  emptyBody?: string;
  /** What failed, as a sentence (Error state heading). */
  errorTitle?: string;
  /** What to do next, as a sentence (Error state body). */
  errorBody?: string;
  /** Adds a Retry action to the Error state. */
  onRetry?: () => void;
  /** Static `ListboxItem` and `ListboxSection` children, or a function over `items`. */
  children: ReactNode | ((item: T) => ReactNode);
  /** Sizing and scrolling (`max-h-80 overflow-y-auto`). Scroll on the list itself so PageUp and PageDown know the visible height. */
  className?: string;
}

/** A single- or multiple-selection list. Give it an `aria-label`. */
export function Listbox<T extends object = object>({
  state = 'default',
  loadingLabel = 'Loading list…',
  emptyTitle = 'No items to show.',
  emptyBody = 'Choose another filter.',
  errorTitle = 'The list could not be loaded.',
  errorBody = 'Reload the page to try again.',
  onRetry,
  className,
  children,
  items,
  ...rest
}: ListboxProps<T>) {
  if (state === 'loading') {
    return (
      <LoadingState label={loadingLabel} className={className}>
        {Array.from({ length: LOADING_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </LoadingState>
    );
  }
  if (state === 'error') {
    return <ErrorState announce="status" title={errorTitle} body={errorBody} onRetry={onRetry} className={className} />;
  }
  const noItems = items !== undefined && Array.from(items).length === 0;
  if (state === 'empty' || noItems) {
    return <EmptyState title={emptyTitle} body={emptyBody} className={className} />;
  }

  return (
    <RacListBox {...rest} items={items} className={clsx('border-t border-rule outline-none', className)}>
      {children}
    </RacListBox>
  );
}

export interface ListboxSectionProps {
  /** The group's name, set as an eyebrow and used as the group's accessible name. */
  title: string;
  children: ReactNode;
}

/** A labelled group of `ListboxItem`s. */
export function ListboxSection({ title, children }: ListboxSectionProps) {
  return (
    <RacListBoxSection>
      <Header className="type-eyebrow text-muted px-4 pt-4 pb-2 border-b border-rule bg-ground">{title}</Header>
      {children}
    </RacListBoxSection>
  );
}

function CheckSquare({ checked }: { checked: boolean }) {
  return (
    <span
      data-checkbox=""
      aria-hidden="true"
      className={clsx('inline-flex size-4 shrink-0 items-center justify-center border border-ink', checked && 'bg-control text-on-control')}
    >
      {checked ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : null}
    </span>
  );
}

export type ListboxItemProps = Omit<RacListBoxItemProps, 'className' | 'children' | 'id' | 'textValue' | 'aria-label'> & {
  /** The key reported through `selectedKeys` and `onSelectionChange`. */
  id: string | number;
  /** The label as plain text: typeahead matches the start of it, and a screen reader falls back to it. */
  textValue: string;
  /** The label. */
  children: ReactNode;
  /** A leading status mark. The label beside it carries the meaning. */
  status?: HabitatStatus;
  /** A muted second line. */
  description?: ReactNode;
  /** A trailing count in the data face. */
  count?: number | string;
  /** Why the item is disabled, in words. Read by assistive technology and shown in a tooltip on mouse hover. */
  disabledReason?: string;
};

const TOOLTIP_DELAY_MS = 300;

interface TipPlace {
  top: number;
  left: number;
  below: boolean;
}

/** One option of a Listbox. */
export function ListboxItem({
  id,
  textValue,
  children,
  status,
  description,
  count,
  isDisabled,
  disabledReason,
  ...rest
}: ListboxItemProps) {
  const reason = isDisabled ? disabledReason : undefined;
  const [tip, setTip] = useState<TipPlace | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The pending open is cancelled on unmount; an open tooltip closes on Escape.
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (tip === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTip(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tip]);

  function showTip(event: ReactPointerEvent<HTMLDivElement>) {
    if (reason === undefined || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const below = rect.top < 56;
      setTip({ top: below ? rect.bottom + 8 : rect.top - 8, left: rect.left + 16, below });
    }, TOOLTIP_DELAY_MS);
  }

  function hideTip() {
    clearTimeout(timer.current);
    setTip(null);
  }

  return (
    <RacListBoxItem
      {...rest}
      id={id}
      textValue={textValue}
      isDisabled={isDisabled}
      className={ROW}
      onPointerEnter={reason === undefined ? undefined : showTip}
      onPointerLeave={reason === undefined ? undefined : hideTip}
    >
      {({ isSelected, selectionMode }) => (
        <>
          {selectionMode === 'multiple' ? <CheckSquare checked={isSelected} /> : null}
          {status ? <StatusMark status={status} size={16} className="shrink-0" /> : null}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="break-words">{children}</span>
            {description ? <span className="text-small text-muted font-normal break-words">{description}</span> : null}
            {status ? <span className="sr-only">{`, ${STATUS_LABELS[status]}`}</span> : null}
            {reason ? <span className="sr-only">{`, ${reason}`}</span> : null}
          </span>
          {count !== undefined ? <span className="font-data tabular text-small text-muted ms-auto shrink-0">{count}</span> : null}
          {tip !== null && reason !== undefined ? (
            <div
              className="pointer-events-none fixed z-50 font-normal"
              style={{ top: tip.top, left: tip.left, transform: tip.below ? undefined : 'translateY(-100%)' }}
            >
              <TooltipSurface>{reason}</TooltipSurface>
            </div>
          ) : null}
        </>
      )}
    </RacListBoxItem>
  );
}
