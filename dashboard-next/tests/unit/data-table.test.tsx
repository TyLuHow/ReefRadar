/**
 * DataTable and the base Table (04-11, DS-04, DS-05). Behaviour comes from React Aria Components'
 * Table (a grid); these tests pin UI-SPEC "Table" and "DataTable": the caption and footer counts are
 * computed from the rows (T-04-11-02, never typed), a Site header toggles ascending and descending
 * only and aria-sort follows, Enter on a row runs the row action and Space toggles selection, the
 * table is one Tab stop with the arrow keys moving between rows, cells wrap and are never cut with an
 * ellipsis, the empty, error and loading states replace the grid, and on a narrow container the
 * table sits in a focusable labelled scroll region with a sticky first column.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from '@/features/instrument';

interface Row {
  id: string;
  country: string;
  status: string;
  note: string;
}

const ROWS: Row[] = [
  { id: 'ken_H1', country: 'Kenya', status: 'Healthy', note: 'Mombasa' },
  { id: 'aus_D1', country: 'Australia', status: 'Degraded', note: 'Great Barrier Reef' },
  { id: 'ind_R2', country: 'Indonesia', status: 'Restored (early)', note: 'Spermonde Archipelago, a very-long-unbroken-token_that_must_wrap_and_never_be_cut_with_an_ellipsis' },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { id: 'site', label: 'Site', sortable: true, sortValue: (row) => row.id, render: (row) => row.id },
  { id: 'country', label: 'Country', sortable: true, sortValue: (row) => row.country, render: (row) => row.country },
  { id: 'status', label: 'Status', render: (row) => row.status },
  { id: 'note', label: 'Note', render: (row) => row.note },
];

function Table(props: Partial<React.ComponentProps<typeof DataTable<Row>>>) {
  return (
    <>
      <button type="button">before</button>
      <DataTable<Row>
        title="Reference sites"
        noun="sites"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        initialSort={{ column: 'site', direction: 'ascending' }}
        {...props}
      />
      <button type="button">after</button>
    </>
  );
}

const rowIds = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('rowheader', { hidden: true })[0]?.textContent);
const header = (name: string) => screen.getByRole('columnheader', { name });

describe('DataTable: counts are computed', () => {
  it('shows the title, a computed count in the caption and a computed footer', () => {
    render(<Table />);
    expect(screen.getByText('Reference sites')).toBeInTheDocument();
    expect(screen.getByText('3 sites')).toBeInTheDocument();
    expect(screen.getByText('Showing 3 of 3 sites')).toBeInTheDocument();
  });

  it('a filtered set reads "Showing k of n" with n from `total`', () => {
    render(<Table rows={ROWS.slice(0, 1)} total={54} />);
    expect(screen.getByText('54 sites')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 54 sites')).toBeInTheDocument();
  });

  it('follows the rows it is given', () => {
    const { rerender } = render(<Table />);
    rerender(<Table rows={ROWS.slice(0, 2)} />);
    expect(screen.getByText('2 sites')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 sites')).toBeInTheDocument();
  });

  it('uses the singular noun when one row is all there is', () => {
    render(<Table rows={ROWS.slice(0, 1)} nounSingular="site" />);
    expect(screen.getByText('1 site')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 1 site')).toBeInTheDocument();
  });

  it('puts the toolbar slot between the caption and the table', () => {
    render(<Table toolbar={<button type="button">Filter</button>} />);
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });
});

describe('DataTable: sorting', () => {
  it('starts sorted as asked, with aria-sort on that header only', () => {
    render(<Table />);
    expect(header('Site')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Country')).not.toHaveAttribute('aria-sort', 'ascending');
    expect(rowIds()).toEqual(['aus_D1', 'ind_R2', 'ken_H1']);
  });

  it('pressing the Site header toggles descending and ascending only', async () => {
    const user = userEvent.setup();
    render(<Table />);
    await user.click(header('Site'));
    expect(header('Site')).toHaveAttribute('aria-sort', 'descending');
    expect(rowIds()).toEqual(['ken_H1', 'ind_R2', 'aus_D1']);
    await user.click(header('Site'));
    expect(header('Site')).toHaveAttribute('aria-sort', 'ascending');
    expect(rowIds()).toEqual(['aus_D1', 'ind_R2', 'ken_H1']);
  });

  it('Enter and Space on a focused sortable header toggle it', async () => {
    const user = userEvent.setup();
    render(<Table />);
    header('Country').focus();
    await user.keyboard('{Enter}');
    expect(header('Country')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Site')).not.toHaveAttribute('aria-sort', 'ascending');
    await user.keyboard(' ');
    expect(header('Country')).toHaveAttribute('aria-sort', 'descending');
    expect(rowIds()).toEqual(['ken_H1', 'ind_R2', 'aus_D1']);
  });

  it('a column without sortable has no sort control', () => {
    render(<Table />);
    expect(header('Status')).not.toHaveAttribute('aria-sort');
    expect(header('Status').querySelector('svg')).toBeNull();
  });

  it('draws a 16 px arrow in the sorted header', () => {
    render(<Table />);
    const arrow = header('Site').querySelector('svg');
    expect(arrow).not.toBeNull();
    expect(arrow).toHaveAttribute('width', '16');
  });
});

describe('DataTable: keyboard', () => {
  it('Tab enters the table once and leaves it, and the arrow keys move between rows', async () => {
    const user = userEvent.setup();
    render(<Table selectionMode="single" onRowAction={() => undefined} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus();
    await user.tab();
    const grid = screen.getByRole('grid');
    expect(grid.contains(document.activeElement)).toBe(true);
    const first = document.activeElement as HTMLElement;
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).not.toBe(first));
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('Enter on a focused row runs the row action with the row id', async () => {
    const user = userEvent.setup();
    const onRowAction = vi.fn();
    render(<Table selectionMode="single" onRowAction={onRowAction} />);
    const row = screen.getAllByRole('row')[1];
    row.focus();
    await user.keyboard('{Enter}');
    expect(onRowAction).toHaveBeenCalledWith('aus_D1');
  });

  it('Space toggles single selection and reports the id', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(<Table selectionMode="single" onRowAction={() => undefined} onSelectionChange={onSelectionChange} />);
    const row = screen.getAllByRole('row')[2];
    row.focus();
    await user.keyboard(' ');
    expect(onSelectionChange).toHaveBeenLastCalledWith('ind_R2');
    await waitFor(() => expect(screen.getAllByRole('row')[2]).toHaveAttribute('aria-selected', 'true'));
    await user.keyboard(' ');
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });

  it('shows the selected row from `defaultSelectedId`', () => {
    render(<Table selectionMode="single" defaultSelectedId="ken_H1" />);
    const selected = screen.getAllByRole('row').filter((row) => row.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('ken_H1');
  });

  it('a disabled row cannot take the action', async () => {
    const user = userEvent.setup();
    const onRowAction = vi.fn();
    render(<Table selectionMode="single" onRowAction={onRowAction} disabledIds={['aus_D1']} />);
    await user.click(screen.getAllByRole('row')[1]);
    expect(onRowAction).not.toHaveBeenCalled();
    expect(screen.getAllByRole('row')[1]).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('DataTable: text and layout', () => {
  it('cells wrap anywhere and nothing is truncated with an ellipsis', () => {
    const { container } = render(<Table />);
    const cells = container.querySelectorAll('td');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell).toHaveClass('wrap-anywhere');
      expect(cell.className).not.toMatch(/truncate|text-ellipsis|whitespace-nowrap/);
    }
    expect(screen.getByText(/a very-long-unbroken-token_that_must_wrap/)).toBeInTheDocument();
  });

  it('rows are at least 44 px high and ruled', () => {
    const { container } = render(<Table />);
    expect(container.querySelector('td')).toHaveClass('h-11');
    expect(screen.getAllByRole('row')[1]).toHaveClass('border-b', 'border-rule');
  });

  it('the first column is the row header and is sticky', () => {
    const { container } = render(<Table />);
    const firstCell = container.querySelector('tbody td');
    expect(firstCell).toHaveAttribute('role', 'rowheader');
    expect(firstCell).toHaveClass('sticky', 'start-0');
    expect(header('Site')).toHaveClass('sticky');
  });

  it('numeric columns are end-aligned in the data face', () => {
    render(
      <DataTable
        title="Counts"
        noun="rows"
        columns={[
          { id: 'name', label: 'Name', render: (row: { id: string; n: number }) => row.id },
          { id: 'n', label: 'Count', align: 'end', render: (row) => row.n, numeric: true },
        ]}
        rows={[{ id: 'a', n: 3 }]}
        getRowId={(row) => row.id}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Count' })).toHaveClass('text-end');
    expect(screen.getByText('3').closest('td')).toHaveClass('font-data', 'tabular', 'text-end');
  });
});

describe('DataTable: states', () => {
  it('empty says no rows match and offers Clear filters', async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    render(<Table rows={[]} total={54} state="empty" onClearFilters={onClearFilters} />);
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByText('No rows match.')).toBeInTheDocument();
    expect(screen.getByText('Clear the filters to see all rows.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('error says the table could not be loaded and offers Retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Table rows={[]} state="error" onRetry={onRetry} />);
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByText('The table could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Reload the page to try again.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('loading shows the header and eight skeleton rows with the words "Loading rows…"', () => {
    const { container } = render(<Table rows={[]} state="loading" />);
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Loading rows…');
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    expect(table?.querySelectorAll('thead th')).toHaveLength(COLUMNS.length);
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(8);
    expect(screen.getByText('Site')).toBeInTheDocument();
  });

  it('keeps the title in every state', () => {
    render(<Table rows={[]} state="error" />);
    expect(screen.getByText('Reference sites')).toBeInTheDocument();
  });
});

describe('DataTable: the phone scroll region', () => {
  const originalRO = globalThis.ResizeObserver;
  const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

  function measure(width: number) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
    class Observer {
      constructor(private readonly callback: () => void) {}
      observe() {
        this.callback();
      }
      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver = Observer as unknown as typeof ResizeObserver;
  }

  afterEach(() => {
    globalThis.ResizeObserver = originalRO;
    if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDescriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  });

  it('below 640 px the table is in a focusable, labelled region', async () => {
    measure(390);
    render(<Table />);
    const region = await screen.findByRole('region', { name: 'Reference sites, scrollable' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.querySelector('table')).not.toBeNull();
  });

  it('at a wide container there is no region', async () => {
    measure(1200);
    render(<Table />);
    await waitFor(() => expect(screen.getByRole('grid')).toBeInTheDocument());
    expect(screen.queryByRole('region')).toBeNull();
  });
});
