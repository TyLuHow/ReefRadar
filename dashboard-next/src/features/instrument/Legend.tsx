'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { HABITAT_STATUSES, LoadingState, STATUS_LABELS, Skeleton, StatusMark, countBy, type HabitatStatus } from '@/features/ui';

/**
 * Legend (DS-05, UI-SPEC "Legend (data-driven, with counts)").
 *
 * Counts are computed from the data shown by `countBy`: the Legend takes the data and a status
 * accessor and never a typed number, so it cannot disagree with what the page lists (T-04-17-01).
 * Rows are in the fixed ordinal order (degraded, restored early, restored mid, healthy, unknown),
 * each a status mark, its word and its count in the data face, with a 1 px rule above it. Under the
 * rows, "{n} sites shown" (singular "1 site shown"), the unknown explainer when unknown appears, and
 * an optional second group, "Evidence", listing "Acoustic reference {n}" and "Location only {n}"
 * from `evidenceOf` (text and count only; how a location-only site is drawn on a map is a Phase 6
 * decision).
 *
 * - `static`: the rows of the data given, zero-count statuses omitted.
 * - `interactive` (a filter): `items` is the full data set and `filtered` the part that passes the
 *   current filter. Every status present in the full data is a toggle button showing its count under
 *   the filter. A status with no sites under the filter is disabled and still shown ("Healthy 0"),
 *   except when it is selected: a selected row stays enabled so the filter can always be undone. The
 *   group is a toolbar named "Filter by habitat status"; each row is `aria-pressed` and at least 44 px
 *   high. The parent owns the selection (`selected`, `onToggle`).
 *
 * Loading is five skeleton rows with "Loading counts…"; empty (a state of `empty`, or no items) is the
 * text "No sites to show." There is no error state: the counts come from data already in memory, and
 * a failed load shows the parent's error. Classes are joined with `clsx`, not `cn`, because
 * tailwind-merge 2.x predates Tailwind 4's custom colour and size names (see Button.tsx).
 */

export type LegendEvidence = 'acoustic_reference' | 'location_only';

export type LegendState = 'default' | 'loading' | 'empty';

export interface LegendProps<T> {
  /** Static: the sites shown. Interactive: the full data set. */
  items: readonly T[];
  statusOf: (item: T) => HabitatStatus;
  /** Adds the Evidence group. */
  evidenceOf?: (item: T) => LegendEvidence;
  mode: 'static' | 'interactive';
  /** Interactive: the items that pass the current filter (defaults to all of `items`). */
  filtered?: readonly T[];
  /** Interactive: the statuses currently toggled on. */
  selected?: readonly HabitatStatus[];
  /** Interactive: a row was pressed (the parent adds or removes the status). */
  onToggle?: (status: HabitatStatus) => void;
  state?: LegendState;
  className?: string;
}

const SKELETON_ROWS = 5;
const EVIDENCE_LABELS: Record<LegendEvidence, string> = {
  acoustic_reference: 'Acoustic reference',
  location_only: 'Location only',
};
const EVIDENCE_ORDER: readonly LegendEvidence[] = ['acoustic_reference', 'location_only'];

const ROW_BASE = 'border-rule flex min-h-11 w-full items-center gap-3 border-t px-2 text-start text-body font-body text-ink';

const TOGGLE_ROW = clsx(
  ROW_BASE,
  'cursor-pointer transition-colors duration-(--duration-fast) ease-(--ease)',
  'hover-state:bg-panel-hover pressed-state:bg-selected focus-state:focus-ring-inset',
  'data-selected:bg-selected data-selected:font-semibold data-selected:shadow-[inset_3px_0_0_0_var(--dir-ink)]',
  'data-disabled:cursor-not-allowed data-disabled:text-muted',
);

function RowContent({ status, count }: { status: HabitatStatus; count: number }) {
  return (
    <>
      <StatusMark status={status} size={20} className="shrink-0" />
      <span className="flex-1">{STATUS_LABELS[status]}</span>{' '}
      <span data-count className="font-data tabular">
        {count}
      </span>
    </>
  );
}

function sitesShown(count: number): string {
  return `${count} ${count === 1 ? 'site' : 'sites'} shown`;
}

/** The status legend, with counts computed from the data shown. */
export function Legend<T>({ items, statusOf, evidenceOf, mode, filtered, selected = [], onToggle, state = 'default', className }: LegendProps<T>) {
  let body: ReactNode;

  if (state === 'loading') {
    body = (
      <LoadingState label="Loading counts…">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </LoadingState>
    );
  } else if (state === 'empty' || items.length === 0) {
    body = <p className="text-body text-muted">No sites to show.</p>;
  } else {
    const interactive = mode === 'interactive';
    const shown = interactive ? (filtered ?? items) : items;
    const shownCounts = countBy(shown, statusOf);
    const fullCounts = interactive ? countBy(items, statusOf) : shownCounts;
    const rows = HABITAT_STATUSES.filter((status) => (fullCounts.get(status) ?? 0) > 0);

    const evidenceCounts = new Map<LegendEvidence, number>(EVIDENCE_ORDER.map((kind) => [kind, 0]));
    if (evidenceOf) {
      for (const item of shown) {
        const kind = evidenceOf(item);
        evidenceCounts.set(kind, (evidenceCounts.get(kind) ?? 0) + 1);
      }
    }
    const evidenceRows = EVIDENCE_ORDER.filter((kind) => interactive || (evidenceCounts.get(kind) ?? 0) > 0);

    body = (
      <>
        {interactive ? (
          <ToggleButtonGroup
            aria-label="Filter by habitat status"
            selectionMode="multiple"
            selectedKeys={selected}
            onSelectionChange={(keys) => {
              // The parent owns the selection: report each status whose state changed.
              const next = new Set(Array.from(keys, String));
              for (const status of HABITAT_STATUSES) {
                if (next.has(status) !== selected.includes(status)) onToggle?.(status);
              }
            }}
            className="flex flex-col"
          >
            {rows.map((status) => {
              const count = shownCounts.get(status) ?? 0;
              return (
                <ToggleButton
                  key={status}
                  id={status}
                  data-legend-row={status}
                  isDisabled={count === 0 && !selected.includes(status)}
                  className={TOGGLE_ROW}
                >
                  <RowContent status={status} count={count} />
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
        ) : (
          <ul className="flex flex-col">
            {rows.map((status) => (
              <li key={status} data-legend-row={status} className={ROW_BASE}>
                <RowContent status={status} count={shownCounts.get(status) ?? 0} />
              </li>
            ))}
          </ul>
        )}
        <p className="border-rule text-small text-muted border-t px-2 pt-3">{sitesShown(shown.length)}</p>
        {(shownCounts.get('unknown') ?? 0) > 0 ? (
          <p className="text-small text-muted px-2">No health status is assigned to these sites; see each site&apos;s status basis.</p>
        ) : null}
        {evidenceOf && evidenceRows.length > 0 ? (
          <div className="mt-2 flex flex-col">
            <p className="type-eyebrow text-muted px-2 pb-2">Evidence</p>
            <ul className="flex flex-col">
              {evidenceRows.map((kind) => (
                <li key={kind} className="border-rule text-body text-ink flex min-h-9 items-center border-t px-2">
                  {`${EVIDENCE_LABELS[kind]} ${evidenceCounts.get(kind) ?? 0}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className={clsx('flex flex-col gap-2 text-start', className)}>
      <p className="type-eyebrow text-muted px-2">Habitat status</p>
      {body}
    </div>
  );
}
