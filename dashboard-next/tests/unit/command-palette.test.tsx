/**
 * CommandPalette (04-12, DS-04). Behaviour comes from React Aria Components' Autocomplete, SearchField
 * and ListBox inside a Modal; these tests pin UI-SPEC "CommandPalette": typing filters (case
 * insensitive, on the title), the arrow keys move the active result (aria-activedescendant on the
 * input), Enter runs it and closes, Escape closes and focus returns to the opener, a polite live
 * region states the count after each filter, the no-results text names the query, and the loading and
 * error states replace the list. The primitive registers no global shortcut (T-04-12-02).
 *
 * React Aria restores focus and moves virtual focus on the next frame, so every keypress that depends
 * on the result of the one before it waits for the expected state first (no fixed delays).
 */
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, CommandPalette, CommandPaletteSurface, type CommandPaletteGroup } from '@/features/ui';

const GROUPS: CommandPaletteGroup[] = [
  {
    id: 'sites',
    heading: 'Sites',
    items: [
      { id: 'site:ind_H1', title: 'ind_H1', secondary: 'South Sulawesi, Indonesia', kindLabel: 'Site', status: 'healthy', kind: 'site' },
      { id: 'site:ind_H2', title: 'ind_H2', secondary: 'South Sulawesi, Indonesia', kindLabel: 'Site', status: 'healthy', kind: 'site' },
      { id: 'site:ind_D1', title: 'ind_D1', secondary: 'South Sulawesi, Indonesia', kindLabel: 'Site', status: 'degraded', kind: 'site' },
      { id: 'site:ken_H1', title: 'ken_H1', secondary: 'Mombasa, Kenya', kindLabel: 'Site', status: 'healthy', kind: 'site' },
      { id: 'site:sanctsound_fk01', title: 'sanctsound_fk01', secondary: 'Florida Keys, USA', kindLabel: 'Site', status: 'unknown', kind: 'site' },
    ],
  },
  {
    id: 'clips',
    heading: 'Clips',
    items: [{ id: 'clip:ind_H1_a', title: 'ind_H1_a', secondary: 'Recorded 2018-09-02 06:00 (recorder clock)', kindLabel: 'Clip', kind: 'clip' }],
  },
  {
    id: 'methods',
    heading: 'Methods',
    items: [
      { id: 'method:model-card', title: 'Model card', kindLabel: 'Method', kind: 'method' },
      { id: 'method:limitations', title: 'Limitations', kindLabel: 'Method', kind: 'method' },
    ],
  },
];

const TOTAL = GROUPS.reduce((sum, group) => sum + group.items.length, 0);

interface HostProps extends Partial<React.ComponentProps<typeof CommandPalette>> {
  onAction?: (id: string) => void;
}

function Host({ onAction = () => undefined, onOpenChange, ...rest }: HostProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>Open palette</Button>
      <CommandPalette
        isOpen={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
        groups={GROUPS}
        onAction={onAction}
        {...rest}
      />
    </>
  );
}

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open palette' }));
  const dialog = await screen.findByRole('dialog');
  const input = await within(dialog).findByRole('combobox', { name: 'Search' });
  await waitFor(() => expect(document.activeElement).toBe(input));
  return { dialog, input };
}

const live = (dialog: HTMLElement) => within(dialog).getByRole('status');
const titles = (dialog: HTMLElement) => within(dialog).getAllByRole('option').map((o) => o.querySelector('[data-title]')?.textContent);

describe('CommandPalette: structure', () => {
  it('opens as a dialog with a labelled search input focused and every group listed', async () => {
    const user = userEvent.setup();
    render(<Host />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const { dialog } = await openPalette(user);
    expect(within(dialog).getAllByRole('option')).toHaveLength(TOTAL);
    for (const heading of ['Sites', 'Clips', 'Methods']) {
      expect(within(dialog).getByRole('group', { name: heading })).toBeInTheDocument();
    }
  });

  it('shows the placeholder hint and a kind label on every row', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog, input } = await openPalette(user);
    expect(input).toHaveAttribute('placeholder', 'Search sites, clips and methods');
    const rows = within(dialog).getAllByRole('option');
    expect(rows[0]).toHaveTextContent('Site');
    expect(rows[5]).toHaveTextContent('Clip');
    expect(rows[6]).toHaveTextContent('Method');
  });

  it('draws a status mark for a site and a kind icon (never a plain glyph) for other rows', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog } = await openPalette(user);
    const rows = within(dialog).getAllByRole('option');
    expect(rows[0].querySelector('svg[data-status="healthy"]')).not.toBeNull();
    expect(rows[3].querySelector('svg[data-status]')).not.toBeNull();
    const clipRow = rows[5];
    expect(clipRow.querySelector('svg[data-status]')).toBeNull();
    expect(clipRow.querySelector('svg')).not.toBeNull();
    expect(rows[6].querySelector('svg')).not.toBeNull();
  });

  it('names the status of a site row for assistive technology', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog } = await openPalette(user);
    expect(within(dialog).getByRole('option', { name: /ind_D1.*Degraded/ })).toBeInTheDocument();
  });

  it('caps the panel at 70dvh with the heavy top rule, and scrolls the list inside it', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog } = await openPalette(user);
    const panel = dialog.parentElement as HTMLElement;
    expect(panel.className).toContain('max-h-[70dvh]');
    expect(panel.className).toContain('rule-top-heavy');
    expect(panel.className).toContain('bg-ground');
    expect(within(dialog).getByRole('listbox').className).toContain('overflow-y-auto');
  });

  it('states the keys in a footer hint that is hidden on coarse pointers', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog } = await openPalette(user);
    const hint = within(dialog).getByText('Up and down arrows move, Enter opens, Esc closes');
    expect(hint.className).toContain('pointer-coarse:hidden');
  });

  it('registers no global shortcut: Ctrl+K and Cmd+K do nothing by themselves', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CommandPalette: filtering and the live region', () => {
  it('announces the full count on open', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog } = await openPalette(user);
    expect(live(dialog)).toHaveTextContent(`${TOTAL} results`);
    expect(live(dialog)).toHaveAttribute('aria-live', 'polite');
  });

  it('narrows to titles that contain the query, ignoring case, and announces the count', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog, input } = await openPalette(user);
    await user.type(input, 'IND_h');
    await waitFor(() => expect(titles(dialog)).toEqual(['ind_H1', 'ind_H2', 'ind_H1_a']));
    expect(live(dialog)).toHaveTextContent('3 results');
    // A group with no match is not drawn.
    expect(within(dialog).queryByRole('group', { name: 'Methods' })).toBeNull();
  });

  it('uses the singular for one result', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog, input } = await openPalette(user);
    await user.type(input, 'model');
    await waitFor(() => expect(titles(dialog)).toEqual(['Model card']));
    expect(live(dialog)).toHaveTextContent('1 result');
    expect(live(dialog)).not.toHaveTextContent('1 results');
  });

  it('says there is no result for the query, in curly quotes, and announces 0 results', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog, input } = await openPalette(user);
    await user.type(input, 'zzz');
    await waitFor(() => expect(within(dialog).getByText('No results for “zzz”.')).toBeInTheDocument());
    expect(live(dialog)).toHaveTextContent('0 results');
  });
});

describe('CommandPalette: keyboard', () => {
  it('moves the active result with the arrow keys (aria-activedescendant on the input)', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { dialog, input } = await openPalette(user);
    await user.type(input, 'ind_h');
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toBeTruthy());
    const first = input.getAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).not.toBe(first));
    const second = input.getAttribute('aria-activedescendant') as string;
    expect(dialog.querySelector(`[id="${second}"]`)).toHaveAttribute('role', 'option');
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toBe(first));
  });

  it('runs the active result on Enter, passing its id, then closes', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(<Host onAction={onAction} onOpenChange={onOpenChange} />);
    const { input } = await openPalette(user);
    await user.type(input, 'ind_h');
    await waitFor(() => expect(input.getAttribute('aria-activedescendant')).toBeTruthy());
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.getElementById(input.getAttribute('aria-activedescendant') as string)).toHaveTextContent('ind_H2'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('site:ind_H2'));
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('runs a clicked result and closes', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Host onAction={onAction} />);
    const { dialog } = await openPalette(user);
    await user.click(within(dialog).getByRole('option', { name: /Limitations/ }));
    await waitFor(() => expect(onAction).toHaveBeenCalledWith('method:limitations'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on Escape, calls onOpenChange(false) and returns focus to the opener', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Host onOpenChange={onOpenChange} />);
    const opener = screen.getByRole('button', { name: 'Open palette' });
    await openPalette(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('closes on Escape even while the query has text (one press, not clear-then-close)', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const { input } = await openPalette(user);
    await user.type(input, 'ken');
    await waitFor(() => expect(input).toHaveValue('ken'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('starts empty each time it opens', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const first = await openPalette(user);
    await user.type(first.input, 'ken');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const second = await openPalette(user);
    expect(second.input).toHaveValue('');
    expect(titles(second.dialog)).toHaveLength(TOTAL);
  });
});

describe('CommandPalette: states', () => {
  it('shows the loading state in the panel instead of the list', async () => {
    const user = userEvent.setup();
    render(<Host state="loading" />);
    const { dialog } = await openPalette(user);
    expect(within(dialog).getByText('Loading search…')).toBeInTheDocument();
    expect(within(dialog).queryByRole('listbox')).toBeNull();
  });

  it('shows the error state in the panel instead of the list', async () => {
    const user = userEvent.setup();
    render(<Host state="error" />);
    await user.click(screen.getByRole('button', { name: 'Open palette' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Search is unavailable.')).toBeInTheDocument();
    expect(within(dialog).getByText('Reload the page to try again.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('listbox')).toBeNull();
  });

  it('still closes on Escape in the error state', async () => {
    const user = userEvent.setup();
    render(<Host state="error" />);
    await user.click(screen.getByRole('button', { name: 'Open palette' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('CommandPaletteSurface', () => {
  it('draws the panel in place with no dialog role and a starting query', () => {
    render(<CommandPaletteSurface groups={GROUPS} defaultQuery="ind_h" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const input = screen.getByRole('combobox', { name: 'Search' });
    expect(input).toHaveValue('ind_h');
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('status')).toHaveTextContent('3 results');
  });

  it('states no results for a query that matches nothing', async () => {
    render(<CommandPaletteSurface groups={GROUPS} defaultQuery="zzz" />);
    await waitFor(() => expect(screen.getByText('No results for “zzz”.')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('0 results');
  });
});
