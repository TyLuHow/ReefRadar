'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Cell as RacCell,
  Column as RacColumn,
  Row as RacRow,
  Table as RacTable,
  TableBody as RacTableBody,
  TableHeader as RacTableHeader,
  type CellProps as RacCellProps,
  type ColumnProps as RacColumnProps,
  type RowProps as RacRowProps,
  type TableBodyProps as RacTableBodyProps,
  type TableHeaderProps as RacTableHeaderProps,
  type TableProps as RacTableProps,
} from 'react-aria-components';

/**
 * Table, TableHeader, Column, TableBody, Row and Cell (DS-04, UI-SPEC "Table (base for DataTable)").
 *
 * Behaviour comes from React Aria Components' `Table`, a `grid`: it is one Tab stop, the arrow keys
 * move between rows (Left and Right then move between a row's cells), Home and End jump, Space
 * toggles selection when the table has a `selectionMode`, Enter runs the row's action, and a
 * sortable header toggles on Enter or Space and carries `aria-sort`. Tab then moves on to focusable
 * contents inside cells.
 *
 * Look: the header row is eyebrow type with a 1 px ink rule below; body rows are at least 44 px high
 * with a 1 px rule between them; hover is `panel-hover`; keyboard focus is an inset outline on the
 * row; a selected row takes the `selected` fill, semibold text and a 3 px ink bar on its first cell;
 * a disabled row is greyed. A sortable header is a button-like cell with a 16 px arrow that follows
 * the sort state (the space is reserved, so the header does not jump). Text always wraps: there is
 * no ellipsis, a long unbroken string breaks anywhere (`wrap-anywhere`). Numbers are end-aligned in
 * the data face with tabular figures (`numeric` on a Column and its Cells).
 *
 * `sticky` pins a column to the inline start edge of a horizontally scrolling container (DataTable
 * uses it on the first column for phones); the pinned cell is opaque and follows the row's hover and
 * selected fill. Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x predates
 * Tailwind 4's custom colour and size names (see Button.tsx).
 */

// Disabled text: rule-strong lightened 40% toward the ground (UI-SPEC common rules).
const DISABLED_TEXT = 'data-disabled:text-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]';

const STICKY = 'sticky start-0 z-[1] bg-ground';
// A pinned cell must stay opaque, so it repeats the row fills through the named row group.
const STICKY_ROW_FILLS =
  'group-data-[hovered]/row:bg-panel-hover group-data-[force-hover]/row:bg-panel-hover group-data-[selected]/row:bg-selected';

export type TableProps = Omit<RacTableProps, 'className'> & { className?: string };

/** The grid. Give it an `aria-label` or `aria-labelledby`. */
export function Table({ className, ...rest }: TableProps) {
  return <RacTable {...rest} className={clsx('w-full border-collapse font-body text-body text-ink', className)} />;
}

export type TableHeaderProps<T extends object> = Omit<RacTableHeaderProps<T>, 'className'> & { className?: string };

export function TableHeader<T extends object>({ className, ...rest }: TableHeaderProps<T>) {
  return <RacTableHeader {...rest} className={className} />;
}

export type ColumnProps = Omit<RacColumnProps, 'className' | 'children'> & {
  children: ReactNode;
  /** `end` aligns the header to the end edge, for numbers. */
  align?: 'start' | 'end';
  /** Pins the column to the inline start edge of a scrolling container. */
  sticky?: boolean;
  className?: string;
};

/** A column header; pass `allowsSorting` for a sortable one. The first column is usually the row header (`isRowHeader`). */
export function Column({ align = 'start', sticky = false, className, children, ...rest }: ColumnProps) {
  return (
    <RacColumn
      {...rest}
      className={clsx(
        'type-eyebrow h-11 border-b border-ink bg-ground px-4 py-3 font-normal text-muted outline-none',
        align === 'end' ? 'text-end' : 'text-start',
        'data-[allows-sorting]:cursor-pointer data-[allows-sorting]:text-ink',
        'focus-state:focus-ring-inset',
        sticky && STICKY,
        className,
      )}
    >
      {({ allowsSorting, sortDirection }) => (
        <span className={clsx('inline-flex items-center gap-1', align === 'end' && 'flex-row-reverse')}>
          <span>{children}</span>
          {allowsSorting ? (
            <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
              {sortDirection === 'ascending' ? <ArrowUp size={16} /> : null}
              {sortDirection === 'descending' ? <ArrowDown size={16} /> : null}
            </span>
          ) : null}
        </span>
      )}
    </RacColumn>
  );
}

export type TableBodyProps<T extends object> = Omit<RacTableBodyProps<T>, 'className'> & { className?: string };

export function TableBody<T extends object>({ className, ...rest }: TableBodyProps<T>) {
  return <RacTableBody {...rest} className={className} />;
}

export type RowProps<T extends object> = Omit<RacRowProps<T>, 'className'> & { className?: string };

/** One row. Give it an `id`; selection, disabled keys and the row action are set on the Table. Pass `cursor-pointer` in `className` for a row that acts. */
export function Row<T extends object>({ className, ...rest }: RowProps<T>) {
  return (
    <RacRow
      {...rest}
      className={clsx(
        'group/row border-b border-rule outline-none',
        'transition-colors duration-(--duration-fast) ease-(--ease)',
        'hover-state:bg-panel-hover focus-state:focus-ring-inset',
        'data-selected:bg-selected data-selected:font-semibold',
        'data-disabled:cursor-not-allowed',
        DISABLED_TEXT,
        className,
      )}
    />
  );
}

export type CellProps = Omit<RacCellProps, 'className'> & {
  /** Numbers: end-aligned, in the data face, with tabular figures. */
  numeric?: boolean;
  /** Pins the cell to the inline start edge (use with a sticky Column). */
  sticky?: boolean;
  className?: string;
};

export function Cell({ numeric = false, sticky = false, className, ...rest }: CellProps) {
  return (
    <RacCell
      {...rest}
      className={clsx(
        'h-11 px-4 py-2 align-middle wrap-anywhere',
        numeric && 'font-data tabular text-end',
        // The selected bar: 3 px ink on the first cell's inline start edge.
        'group-data-[selected]/row:first:shadow-[inset_3px_0_0_var(--dir-ink)]',
        sticky && clsx(STICKY, STICKY_ROW_FILLS),
        className,
      )}
    />
  );
}
