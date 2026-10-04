'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Selection, SortDescriptor } from 'react-aria-components';
import { Cell, Column, EmptyState, ErrorState, LoadingState, Row, Skeleton, Table, TableBody, TableHeader } from '@/features/ui';

/**
 * DataTable (DS-05, UI-SPEC "DataTable"): the base Table plus a caption row, an optional toolbar
 * slot, a footer and the loading, empty and error states.
 *
 * Counts are computed, never typed (T-04-11-02): the caption reads "{n} {noun}" and the footer
 * "Showing {k} of {n} {noun}", where k is the number of rows given and n is `total` (the size of the
 * whole set when `rows` is a filtered part of it) or, without `total`, k itself. A row set of one
 * therefore reads "Showing 1 of {n} sites" when it is a filter of n.
 *
 * Sorting is two-state, ascending and descending, held in the component: a sortable column needs a
 * `sortValue`; pressing a header toggles, and pressing another column starts ascending. Numbers
 * compare as numbers, text compares naturally ("H2" before "H10"). Selection is none or single; a
 * row action (`onRowAction`, "open the site") runs on Enter or click while Space toggles selection.
 * There is no pagination at this scale.
 *
 * Every cell is the node `render` returns, so cell text is only ever React text (T-04-11-01); there
 * is no HTML injection path. Cells wrap, nothing is cut with an ellipsis.
 *
 * On a narrow container (under 640 px) or whenever the table overflows sideways, the table sits in
 * a `role="region"` named "{title}, scrollable" that takes a Tab stop (`tabindex="0"`), so a keyboard
 * user can scroll it; the first column stays pinned (sticky) while the rest scrolls. The width is
 * measured on the container, not the window, so the fixtures can show the phone layout at 390 px
 * inside a wide page. Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x predates
 * Tailwind 4's custom colour and size names (see Button.tsx).
 */

export type DataTableState = 'default' | 'loading' | 'empty' | 'error';

export interface DataTableColumn<T> {
  id: string;
  label: string;
  /** `end` for numbers. */
  align?: 'start' | 'end';
  /** Numbers: the data face with tabular figures, end-aligned. */
  numeric?: boolean;
  /** Needs a `sortValue`. */
  sortable?: boolean;
  /** What the cell shows. Build it from verified strings; it renders as React children. */
  render: (row: T) => ReactNode;
  /** What the column sorts by: numbers compare numerically, text naturally. */
  sortValue?: (row: T) => string | number;
}

export interface DataTableProps<T> {
  /** The caption title ("Reference sites"). */
  title: string;
  /** The plural noun for the counts ("sites"). */
  noun: string;
  /** The noun when the count is one ("site"); defaults to `noun`. */
  nounSingular?: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  /** The size of the whole set when `rows` is a filtered part of it. */
  total?: number;
  getRowId: (row: T) => string;
  initialSort?: { column: string; direction: 'ascending' | 'descending' };
  selectionMode?: 'none' | 'single';
  selectedId?: string | null;
  defaultSelectedId?: string;
  onSelectionChange?: (id: string | null) => void;
  /** Runs on Enter or click on a row. */
  onRowAction?: (id: string) => void;
  /** Rows that are greyed and cannot be selected or acted on. */
  disabledIds?: readonly string[];
  /** Extra attributes for a row (the fixtures use data-force-hover and data-force-focus). */
  rowAttributes?: (row: T) => Record<string, string> | undefined;
  /** Filters or actions, between the caption and the table. */
  toolbar?: ReactNode;
  /** Replaces the table with a Loading, Empty or Error state. */
  state?: DataTableState;
  onRetry?: () => void;
  onClearFilters?: () => void;
  className?: string;
}

/** Narrower than this and the table sits in a scroll region. */
const PHONE_WIDTH = 640;
const SKELETON_ROWS = 8;

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

/** True when the container is narrower than a phone breakpoint or its table overflows sideways. */
function useScrollRegion(ref: React.RefObject<HTMLDivElement | null>, active: boolean): boolean {
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) return undefined;
    const measure = () => {
      const width = node.clientWidth;
      // A zero width means nothing has been laid out (not rendered yet): keep the plain table.
      setScrolls(width > 0 && (width < PHONE_WIDTH || node.scrollWidth > width));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const table = node.firstElementChild;
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [ref, active]);
  return scrolls && active;
}

function pluralise(count: number, noun: string, nounSingular: string | undefined): string {
  return count === 1 && nounSingular ? nounSingular : noun;
}

/** A table with a caption, counts, a footer and every state. */
export function DataTable<T>({
  title,
  noun,
  nounSingular,
  columns,
  rows,
  total,
  getRowId,
  initialSort,
  selectionMode = 'none',
  selectedId,
  defaultSelectedId,
  onSelectionChange,
  onRowAction,
  disabledIds = [],
  rowAttributes,
  toolbar,
  state = 'default',
  onRetry,
  onClearFilters,
  className,
}: DataTableProps<T>) {
  const titleId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const scrolls = useScrollRegion(regionRef, state === 'default');
  const [sort, setSort] = useState<SortDescriptor | undefined>(initialSort);
  const [innerSelected, setInnerSelected] = useState<string | null>(defaultSelectedId ?? null);
  const selected = selectedId !== undefined ? selectedId : innerSelected;

  const shown = rows.length;
  const count = total ?? shown;

  const sortColumn = sort ? columns.find((column) => column.id === sort.column) : undefined;
  const sortValue = sortColumn?.sortValue;
  const ordered = [...rows];
  if (sort && sortValue) {
    const sign = sort.direction === 'descending' ? -1 : 1;
    ordered.sort((a, b) => compareValues(sortValue(a), sortValue(b)) * sign);
  }

  function onSelection(next: Selection) {
    const id = next === 'all' ? null : (Array.from(next)[0] ?? null);
    const key = id === null ? null : String(id);
    setInnerSelected(key);
    onSelectionChange?.(key);
  }

  const caption = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
      <p id={titleId} className="text-body font-semibold text-ink">
        {title}
      </p>
      {state === 'default' ? (
        <p className="font-data text-small tabular text-muted">{`${count} ${pluralise(count, noun, nounSingular)}`}</p>
      ) : null}
    </div>
  );

  let body: ReactNode;
  if (state === 'loading') {
    body = (
      <LoadingState label="Loading rows…">
        <table aria-hidden="true" className="w-full min-w-[40rem] border-collapse">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={clsx('type-eyebrow border-b border-ink px-4 py-3 font-normal text-muted', column.align === 'end' ? 'text-end' : 'text-start')}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <tr key={index} className="border-b border-rule">
                <td colSpan={columns.length} className="h-11 px-4 py-2">
                  <Skeleton className="h-6 w-full" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </LoadingState>
    );
  } else if (state === 'empty') {
    body = (
      <EmptyState
        title="No rows match."
        body="Clear the filters to see all rows."
        action={onClearFilters ? { label: 'Clear filters', onPress: onClearFilters } : undefined}
      />
    );
  } else if (state === 'error') {
    body = <ErrorState announce="status" title="The table could not be loaded." body="Reload the page to try again." onRetry={onRetry} />;
  } else {
    body = (
      <>
        <div
          ref={regionRef}
          role={scrolls ? 'region' : undefined}
          aria-label={scrolls ? `${title}, scrollable` : undefined}
          tabIndex={scrolls ? 0 : undefined}
          className="overflow-x-auto focus-visible:focus-ring-inset"
        >
          <Table
            aria-labelledby={titleId}
            className="min-w-[40rem]"
            selectionMode={selectionMode}
            selectedKeys={selected === null ? [] : [selected]}
            onSelectionChange={onSelection}
            disabledKeys={disabledIds}
            onRowAction={onRowAction ? (key) => onRowAction(String(key)) : undefined}
            sortDescriptor={sort}
            onSortChange={setSort}
          >
            <TableHeader>
              {columns.map((column, index) => (
                <Column
                  key={column.id}
                  id={column.id}
                  isRowHeader={index === 0}
                  allowsSorting={Boolean(column.sortable && column.sortValue)}
                  align={column.align}
                  sticky={index === 0}
                >
                  {column.label}
                </Column>
              ))}
            </TableHeader>
            <TableBody>
              {ordered.map((row) => {
                const id = getRowId(row);
                return (
                  <Row key={id} id={id} textValue={id} className={onRowAction ? 'cursor-pointer' : undefined} {...rowAttributes?.(row)}>
                    {columns.map((column, index) => (
                      <Cell key={column.id} numeric={column.numeric} sticky={index === 0}>
                        {column.render(row)}
                      </Cell>
                    ))}
                  </Row>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p aria-live="polite" className="pt-3 text-small text-muted">{`Showing ${shown} of ${count} ${pluralise(count, noun, nounSingular)}`}</p>
      </>
    );
  }

  return (
    <div className={clsx('bg-ground text-start', className)}>
      {caption}
      {toolbar && state === 'default' ? <div className="pb-3">{toolbar}</div> : null}
      {body}
    </div>
  );
}
