/**
 * Listbox, ListboxItem and ListboxSection (04-10, DS-04). Behaviour comes from React Aria
 * Components' ListBox; these tests pin UI-SPEC "Listbox": arrow keys, Home, End and typeahead move
 * focus, Enter selects in single mode and Space toggles in multiple mode (with a 16 px checkbox
 * square), a disabled item is skipped by the keys and explains itself, rows are 44 px with a rule
 * between them, and the loading, empty and error states replace the list.
 *
 * PageUp and PageDown need real layout (they move by the visible height), so they are covered by
 * the browser keyboard spec, not here.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Listbox, ListboxItem, ListboxSection } from '@/features/ui';

function Sites(props: Partial<React.ComponentProps<typeof Listbox>> & { disabled?: boolean }) {
  const { disabled, ...rest } = props;
  return (
    <>
      <button type="button">before</button>
      <Listbox aria-label="Sites" selectionMode="single" {...rest}>
        <ListboxSection title="Australia">
          <ListboxItem id="aus_D1" textValue="aus_D1" status="degraded" description="Great Barrier Reef, Australia" count={3}>
            aus_D1
          </ListboxItem>
          <ListboxItem id="aus_H1" textValue="aus_H1" status="healthy" description="Great Barrier Reef, Australia">
            aus_H1
          </ListboxItem>
        </ListboxSection>
        <ListboxSection title="Indonesia">
          <ListboxItem
            id="ind_D2"
            textValue="ind_D2"
            status="degraded"
            description="Spermonde Archipelago, Indonesia"
            isDisabled={disabled}
            disabledReason={disabled ? 'Disabled for review' : undefined}
          >
            ind_D2
          </ListboxItem>
          <ListboxItem id="ind_H4" textValue="ind_H4" status="healthy" description="Spermonde Archipelago, Indonesia">
            ind_H4
          </ListboxItem>
        </ListboxSection>
        <ListboxSection title="Kenya">
          <ListboxItem id="ken_H1" textValue="ken_H1" status="healthy" description="Mombasa, Kenya">
            ken_H1
          </ListboxItem>
        </ListboxSection>
      </Listbox>
    </>
  );
}

const option = (name: RegExp | string) => screen.getByRole('option', { name });

describe('Listbox: structure', () => {
  it('is a labelled listbox of options grouped by labelled sections', () => {
    render(<Sites />);
    expect(screen.getByRole('listbox', { name: 'Sites' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(5);
    const groups = screen.getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-labelledby')).every(Boolean)).toBe(true);
    expect(screen.getByRole('group', { name: 'Australia' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Indonesia' })).getAllByRole('option')).toHaveLength(2);
  });

  it('sets the section header in the eyebrow style', () => {
    render(<Sites />);
    const header = screen.getByText('Australia');
    expect(header.className).toContain('type-eyebrow');
  });

  it('holds a status mark, a label, a muted description and a trailing count in the data face', () => {
    render(<Sites />);
    const row = option(/aus_D1/);
    expect(row.querySelector('svg[data-status="degraded"]')).not.toBeNull();
    expect(within(row).getByText('aus_D1')).toBeInTheDocument();
    const description = within(row).getByText('Great Barrier Reef, Australia');
    expect(description.className).toContain('text-muted');
    const count = within(row).getByText('3');
    expect(count.className).toContain('font-data');
    expect(count.className).toContain('tabular');
  });

  it('speaks the status word in the row text so the mark is never the only carrier', () => {
    render(<Sites />);
    expect(within(option(/aus_D1/)).getByText(/Degraded/).className).toContain('sr-only');
    expect(within(option(/aus_H1/)).getByText(/Healthy/).className).toContain('sr-only');
  });

  it('rows are 44 px with a rule between them, token-only hover, inset focus and selected treatment', () => {
    render(<Sites />);
    const cls = option(/aus_H1/).className;
    expect(cls).toContain('min-h-11');
    expect(cls).toContain('border-b');
    expect(cls).toContain('border-rule');
    expect(cls).toContain('hover-state:bg-panel-hover');
    expect(cls).toContain('focus-state:focus-ring-inset');
    expect(cls).toContain('data-selected:bg-selected');
    expect(cls).toContain('data-selected:font-semibold');
    expect(cls).toContain('before:bg-ink');
    expect(cls).toContain('before:w-[3px]');
    expect(cls).toContain('before:start-0');
  });

  it('passes the fixtures forced-state attributes through to the row', () => {
    render(
      <Listbox aria-label="Sites" selectionMode="single">
        <ListboxItem id="a" textValue="a" data-force-hover="">
          a
        </ListboxItem>
        <ListboxItem id="b" textValue="b" data-force-focus="">
          b
        </ListboxItem>
      </Listbox>,
    );
    expect(option('a')).toHaveAttribute('data-force-hover');
    expect(option('b')).toHaveAttribute('data-force-focus');
  });
});

describe('Listbox: keyboard', () => {
  it('Tab enters the list on an option and the arrow keys move focus', async () => {
    const user = userEvent.setup();
    render(<Sites />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus();
    await user.tab();
    expect(option(/aus_D1/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(option(/aus_H1/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(option(/ind_D2/)).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(option(/aus_H1/)).toHaveFocus();
  });

  it('Home and End jump to the first and last option', async () => {
    const user = userEvent.setup();
    render(<Sites />);
    await user.tab();
    await user.tab();
    await user.keyboard('{End}');
    expect(option(/ken_H1/)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(option(/aus_D1/)).toHaveFocus();
  });

  it('typing the start of an item label moves focus to it', async () => {
    const user = userEvent.setup();
    render(<Sites />);
    await user.tab();
    await user.tab();
    await user.keyboard('ken');
    expect(option(/ken_H1/)).toHaveFocus();
  });

  it('typeahead matches the whole typed prefix, not just the first letter', async () => {
    const user = userEvent.setup();
    render(<Sites />);
    await user.tab();
    await user.tab();
    await user.keyboard('ind_H');
    expect(option(/ind_H4/)).toHaveFocus();
  });

  it('single selection: Enter selects and aria-selected updates; selecting another replaces it', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(<Sites onSelectionChange={onSelectionChange} />);
    await user.tab();
    await user.tab();
    expect(option(/aus_D1/)).toHaveAttribute('aria-selected', 'false');
    await user.keyboard('{Enter}');
    expect(option(/aus_D1/)).toHaveAttribute('aria-selected', 'true');
    expect([...(onSelectionChange.mock.calls.at(-1)?.[0] as Set<string>)]).toEqual(['aus_D1']);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(option(/aus_D1/)).toHaveAttribute('aria-selected', 'false');
    expect(option(/aus_H1/)).toHaveAttribute('aria-selected', 'true');
  });

  it('multiple selection: Space toggles each option and the list is aria-multiselectable', async () => {
    const user = userEvent.setup();
    render(<Sites selectionMode="multiple" />);
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');
    await user.tab();
    await user.tab();
    await user.keyboard(' ');
    await user.keyboard('{ArrowDown}{ArrowDown} ');
    expect(option(/aus_D1/)).toHaveAttribute('aria-selected', 'true');
    expect(option(/aus_H1/)).toHaveAttribute('aria-selected', 'false');
    expect(option(/ind_D2/)).toHaveAttribute('aria-selected', 'true');
    await user.keyboard(' ');
    expect(option(/ind_D2/)).toHaveAttribute('aria-selected', 'false');
  });

  it('multiple selection shows a 16 px square checkbox that is filled when on and empty when off', async () => {
    const user = userEvent.setup();
    render(<Sites selectionMode="multiple" defaultSelectedKeys={['aus_H1']} />);
    const on = option(/aus_H1/).querySelector('[data-checkbox]') as HTMLElement;
    const off = option(/aus_D1/).querySelector('[data-checkbox]') as HTMLElement;
    for (const box of [on, off]) {
      expect(box).not.toBeNull();
      expect(box.className).toContain('size-4');
      expect(box.className).toContain('border-ink');
      expect(box.className).not.toMatch(/rounded/);
    }
    expect(on.className).toContain('bg-control');
    expect(on.querySelector('svg')).not.toBeNull();
    expect(off.className).not.toContain('bg-control');
    expect(off.querySelector('svg')).toBeNull();
    await user.tab();
    await user.tab();
    // Tab lands on the selected option; step up to the unselected one and turn it on.
    expect(option(/aus_H1/)).toHaveFocus();
    await user.keyboard('{ArrowUp} ');
    expect((option(/aus_D1/).querySelector('[data-checkbox]') as HTMLElement).querySelector('svg')).not.toBeNull();
  });

  it('single selection has no checkbox square', () => {
    render(<Sites />);
    expect(document.querySelector('[data-checkbox]')).toBeNull();
  });
});

describe('Listbox: disabled item', () => {
  it('is aria-disabled and skipped by the arrow keys, Home and End and typeahead', async () => {
    const user = userEvent.setup();
    render(<Sites disabled />);
    expect(option(/ind_D2/)).toHaveAttribute('aria-disabled', 'true');
    await user.tab();
    await user.tab();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(option(/ind_H4/)).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(option(/aus_H1/)).toHaveFocus();
    await user.keyboard('ind_D');
    expect(option(/ind_D2/)).not.toHaveFocus();
  });

  it('cannot be selected', async () => {
    const user = userEvent.setup();
    render(<Sites disabled />);
    await user.click(option(/ind_D2/));
    expect(option(/ind_D2/)).toHaveAttribute('aria-selected', 'false');
  });

  it('gives its reason in words for assistive technology and in a tooltip on mouse hover', async () => {
    const user = userEvent.setup();
    render(<Sites disabled />);
    const row = option(/ind_D2/);
    expect(within(row).getByText(/Disabled for review/).className).toContain('sr-only');
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.hover(row);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Disabled for review');
    await user.unhover(row);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('Escape dismisses the tooltip', async () => {
    const user = userEvent.setup();
    render(<Sites disabled />);
    await user.hover(option(/ind_D2/));
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('a disabled row with no reason has no tooltip and no hidden text', async () => {
    const user = userEvent.setup();
    render(
      <Listbox aria-label="Sites" selectionMode="single">
        <ListboxItem id="a" textValue="a" isDisabled>
          a
        </ListboxItem>
      </Listbox>,
    );
    await user.hover(option('a'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(option('a').querySelector('.sr-only')).toBeNull();
  });
});

describe('Listbox: states', () => {
  it("state 'loading' renders six skeleton rows and a label instead of the list", () => {
    const { container } = render(
      <Listbox aria-label="Sites" selectionMode="single" state="loading" loadingLabel="Loading sites…">
        <ListboxItem id="a" textValue="a">
          a
        </ListboxItem>
      </Listbox>,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Loading sites…');
    expect(container.querySelectorAll('[aria-hidden="true"].h-11')).toHaveLength(6);
  });

  it("state 'empty' renders the Empty state instead of the list", () => {
    render(
      <Listbox aria-label="Sites" selectionMode="single" state="empty" emptyTitle="No sites to show." emptyBody="Choose another country.">
        <ListboxItem id="a" textValue="a">
          a
        </ListboxItem>
      </Listbox>,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('No sites to show.')).toBeInTheDocument();
    expect(screen.getByText('Choose another country.')).toBeInTheDocument();
  });

  it("state 'error' renders the Error state instead of the list", () => {
    render(
      <Listbox
        aria-label="Sites"
        selectionMode="single"
        state="error"
        errorTitle="The list could not be loaded."
        errorBody="Reload the page to try again."
      >
        <ListboxItem id="a" textValue="a">
          a
        </ListboxItem>
      </Listbox>,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('The list could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Reload the page to try again.')).toBeInTheDocument();
  });

  it('an items collection with no items shows the Empty state', () => {
    render(
      <Listbox aria-label="Sites" selectionMode="single" items={[]} emptyTitle="No sites to show." emptyBody="Choose another country.">
        {(item: { id: string }) => (
          <ListboxItem id={item.id} textValue={item.id}>
            {item.id}
          </ListboxItem>
        )}
      </Listbox>,
    );
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText('No sites to show.')).toBeInTheDocument();
  });

  it('renders dynamic items from a collection', () => {
    render(
      <Listbox aria-label="Sites" selectionMode="single" items={[{ id: 'aus_D1' }, { id: 'ken_H1' }]}>
        {(item: { id: string }) => (
          <ListboxItem id={item.id} textValue={item.id}>
            {item.id}
          </ListboxItem>
        )}
      </Listbox>,
    );
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['aus_D1', 'ken_H1']);
  });
});
