'use client';

import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import {
  HABITAT_STATUSES,
  LoadingState,
  STATUS_BG_CLASS,
  STATUS_LABELS,
  Skeleton,
  StatusMark,
  Tooltip,
  countBy,
  type HabitatStatus,
} from '@/features/ui';

/**
 * StatusBand (DS-05, UI-SPEC "StatusBand (proportion band)").
 *
 * One bar, 64 px high with 3 px gaps, a segment per habitat status sized by its count
 * (`flex: {count} 1 0`), in the fixed ordinal order, filled with the status colour. Under each
 * segment sit the status mark (16), the count in the data face (24) and the label (14, muted), so a
 * colour is never shown without a shape and a word. Counts come from `countBy` over the data given
 * and are never typed (T-04-17-01); a status with no sites is omitted, and a segment is never
 * narrower than 4 px.
 *
 * The labels sit in a container whose width, not the window's, decides the layout, so a narrow
 * container shows the phone layout on a wide page: at 640 px and up the labels align under their
 * segments; below, they move to a two-column grid under the band. When any segment holds under 8% of
 * the sites its label would not fit under it, so the grid is used at every width.
 *
 * Static, the band is a group named "Sites by habitat status" whose segments are images named
 * "{Label}: {count} sites" (singular "1 site"). With `onSelect` each segment is a toggle button with
 * that name inside a toolbar of the same name: pressed it has an inset 3 px ink outline, hovered a
 * 3 px ink bottom edge and a tooltip repeating the name. The parent owns the selection (`selected`).
 * The label row repeats the segment names, so it is hidden from assistive technology.
 *
 * Loading is one track-coloured bar and five label skeletons with "Loading counts…"; empty (a state
 * of `empty`, or no items) is the text "No sites to show.". There is no error state: a failed load
 * shows the parent's error. Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x
 * predates Tailwind 4's custom colour and size names (see Button.tsx).
 */

export type StatusBandState = 'default' | 'loading' | 'empty';

export interface StatusBandProps<T> {
  items: readonly T[];
  statusOf: (item: T) => HabitatStatus;
  /** Makes each segment a toggle button; called with the status that was pressed. */
  onSelect?: (status: HabitatStatus) => void;
  /** The statuses currently toggled on (interactive only). */
  selected?: readonly HabitatStatus[];
  state?: StatusBandState;
  /** Fixtures only (interactive): draws the hover treatment on one segment, as a forced state. */
  forcedHover?: HabitatStatus;
  className?: string;
}

const BAND_LABEL = 'Sites by habitat status';
const SKELETON_LABELS = 5;
const MIN_SEGMENT_PX = '4px';
/** Below this share of the total a label cannot sit under its own segment. */
const CROWDED_SHARE = 0.08;

const SEGMENT_BASE = 'h-full';

const SEGMENT_TOGGLE = clsx(
  'cursor-pointer border-b-[3px] border-transparent',
  'transition-colors duration-(--duration-fast) ease-(--ease)',
  'hover-state:border-ink focus-state:focus-ring-inset',
  'data-selected:shadow-[inset_0_0_0_3px_var(--dir-ink)]',
);

function sitesLabel(status: HabitatStatus, count: number): string {
  return `${STATUS_LABELS[status]}: ${count} ${count === 1 ? 'site' : 'sites'}`;
}

function grow(count: number): CSSProperties {
  return { flexGrow: count, flexShrink: 1, flexBasis: 0 };
}

/** The proportion band of habitat statuses, sized by counts computed from the data. */
export function StatusBand<T>({ items, statusOf, onSelect, selected = [], state = 'default', forcedHover, className }: StatusBandProps<T>) {
  let body: ReactNode;

  if (state === 'loading') {
    body = (
      <LoadingState label="Loading counts…">
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {Array.from({ length: SKELETON_LABELS }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </LoadingState>
    );
  } else if (state === 'empty' || items.length === 0) {
    body = <p className="text-body text-muted">No sites to show.</p>;
  } else {
    const counts = countBy(items, statusOf);
    const segments = HABITAT_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 })).filter((segment) => segment.count > 0);
    const total = segments.reduce((sum, segment) => sum + segment.count, 0);
    const crowded = segments.some((segment) => segment.count / total < CROWDED_SHARE);
    const interactive = onSelect !== undefined;

    const bandClass = 'flex h-16 gap-[3px]';

    body = (
      <>
        {interactive ? (
          <ToggleButtonGroup
            aria-label={BAND_LABEL}
            selectionMode="multiple"
            selectedKeys={selected}
            onSelectionChange={(keys) => {
              // The parent owns the selection: report each status whose state changed.
              const next = new Set(Array.from(keys, String));
              for (const { status } of segments) {
                if (next.has(status) !== selected.includes(status)) onSelect(status);
              }
            }}
            className={bandClass}
          >
            {segments.map(({ status, count }) => (
              <Tooltip key={status} content={sitesLabel(status, count)}>
                <ToggleButton
                  id={status}
                  data-segment={status}
                  data-force-hover={forcedHover === status ? '' : undefined}
                  aria-label={sitesLabel(status, count)}
                  className={clsx(SEGMENT_BASE, SEGMENT_TOGGLE, STATUS_BG_CLASS[status])}
                  style={{ ...grow(count), minWidth: MIN_SEGMENT_PX }}
                />
              </Tooltip>
            ))}
          </ToggleButtonGroup>
        ) : (
          <div role="group" aria-label={BAND_LABEL} className={bandClass}>
            {segments.map(({ status, count }) => (
              <div
                key={status}
                role="img"
                data-segment={status}
                aria-label={sitesLabel(status, count)}
                className={clsx(SEGMENT_BASE, STATUS_BG_CLASS[status])}
                style={{ ...grow(count), minWidth: MIN_SEGMENT_PX }}
              />
            ))}
          </div>
        )}
        <div
          aria-hidden="true"
          data-band-labels={crowded ? 'grid' : 'aligned'}
          className={clsx(
            'grid grid-cols-2 gap-x-4 gap-y-3',
            crowded ? '@min-[40rem]:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]' : '@min-[40rem]:flex @min-[40rem]:gap-[3px]',
          )}
        >
          {segments.map(({ status, count }) => (
            <div
              key={status}
              data-band-label={status}
              className="flex min-w-0 flex-col items-start gap-1 break-words"
              style={{ ...grow(count), minWidth: 0 }}
            >
              <StatusMark status={status} size={16} />
              <span className="font-data text-lead tabular text-ink">{count}</span>
              <span className="text-small text-muted">{STATUS_LABELS[status]}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return <div className={clsx('@container flex flex-col gap-3 text-start', className)}>{body}</div>;
}
