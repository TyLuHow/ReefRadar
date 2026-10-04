/**
 * Sheet and SheetSurface (04-10, DS-04). A Sheet is the Dialog's contract on an edge panel: focus
 * moves in and is trapped, Escape, the close button and a scrim press each dismiss it, and focus
 * returns to the trigger. `right` is a 420 px panel with the heavy rule on its leading edge;
 * `bottom` caps at 85dvh with square top corners. It is not draggable, so there is no handle.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button, Sheet, SheetSurface } from '@/features/ui';

function Basic(props: Partial<React.ComponentProps<typeof Sheet>>) {
  return (
    <>
      <button type="button">before</button>
      <Sheet side="right" title="Sections" trigger={<Button variant="secondary">Open sheet</Button>} {...props}>
        <a href="#one">One</a>
        <a href="#two">Two</a>
      </Sheet>
      <button type="button">after</button>
    </>
  );
}

async function openBasic(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open sheet' }));
  return screen.findByRole('dialog', { name: 'Sections' });
}

const modalOf = (dialog: HTMLElement) => dialog.parentElement as HTMLElement;
const scrimOf = (dialog: HTMLElement) => dialog.parentElement?.parentElement as HTMLElement;

describe('Sheet: focus and dismissal', () => {
  it('opens from the trigger, moves focus inside and traps Tab and Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 6; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `Shift+Tab ${i + 1}`).toBe(true);
    }
    expect(screen.queryByRole('button', { name: 'before' })).toBeNull();
  });

  it('Escape closes it and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    await openBasic(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open sheet' })).toHaveFocus());
  });

  it('the Close button (44 by 44) closes it and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(dialog.contains(close)).toBe(true);
    expect(close.className).toContain('size-11');
    await user.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open sheet' })).toHaveFocus());
  });

  it('a scrim press closes it and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    await user.click(scrimOf(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open sheet' })).toHaveFocus());
  });

  it('works the same from the bottom edge', async () => {
    const user = userEvent.setup();
    render(<Basic side="bottom" />);
    await openBasic(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open sheet' })).toHaveFocus());
  });
});

describe('Sheet: edge panels', () => {
  it("side 'right' is min(420px, 100%) wide with the heavy rule on its leading edge", async () => {
    const user = userEvent.setup();
    render(<Basic side="right" />);
    const panel = modalOf(await openBasic(user));
    expect(panel.className).toContain('w-[min(420px,100%)]');
    expect(panel.className).toContain('border-s-(length:--rule-w-heavy)');
    expect(panel.className).toContain('border-rule-heavy');
    expect(panel.className).toContain('bg-ground');
    expect(panel.className).toContain('inset-y-0');
    expect(panel.className).toContain('end-0');
    expect(panel.className).not.toContain('max-h-[85dvh]');
  });

  it("side 'bottom' caps at 85dvh with a heavy top rule and square corners", async () => {
    const user = userEvent.setup();
    render(<Basic side="bottom" />);
    const panel = modalOf(await openBasic(user));
    expect(panel.className).toContain('max-h-[85dvh]');
    expect(panel.className).toContain('border-t-(length:--rule-w-heavy)');
    expect(panel.className).toContain('border-rule-heavy');
    expect(panel.className).toContain('inset-x-0');
    expect(panel.className).toContain('bottom-0');
    expect(panel.className).not.toMatch(/rounded/);
  });

  it('moves 24 px and fades with the duration token, from the edge it opens on', async () => {
    const user = userEvent.setup();
    const right = render(<Basic side="right" />);
    const rightPanel = modalOf(await openBasic(user));
    expect(rightPanel.className).toContain('duration-(--duration-base)');
    expect(rightPanel.className).toContain('data-entering:opacity-0');
    expect(rightPanel.className).toContain('data-exiting:opacity-0');
    expect(rightPanel.className).toContain('data-entering:ltr:translate-x-6');
    expect(rightPanel.className).toContain('data-exiting:ltr:translate-x-6');
    right.unmount();

    render(<Basic side="bottom" />);
    const bottomPanel = modalOf(await openBasic(user));
    expect(bottomPanel.className).toContain('data-entering:translate-y-6');
    expect(bottomPanel.className).toContain('data-exiting:translate-y-6');
  });

  it('has a scrim with no blur and no drag handle', async () => {
    const user = userEvent.setup();
    render(<Basic side="bottom" />);
    const dialog = await openBasic(user);
    expect(scrimOf(dialog).className).toContain('bg-scrim');
    expect(scrimOf(dialog).className).not.toMatch(/blur/);
    expect(dialog.querySelector('[role="slider"], [data-drag-handle], [draggable="true"]')).toBeNull();
  });

  it('sets the title in the numeral face and labels the sheet with it', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    const heading = screen.getByRole('heading', { name: 'Sections' });
    expect(dialog.contains(heading)).toBe(true);
    expect(heading.className).toContain('font-numeral');
  });
});

describe('Sheet: body states', () => {
  it("bodyState 'loading' replaces the body with the Loading state", async () => {
    const user = userEvent.setup();
    render(<Basic bodyState="loading" loadingLabel="Loading sections…" />);
    const dialog = await openBasic(user);
    expect(dialog.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(dialog).toHaveTextContent('Loading sections…');
    expect(dialog.querySelector('a')).toBeNull();
  });

  it("bodyState 'error' replaces the body with the Error state", async () => {
    const user = userEvent.setup();
    render(<Basic bodyState="error" errorTitle="The sections could not be loaded." errorBody="Reload the page to try again." />);
    const dialog = await openBasic(user);
    expect(dialog).toHaveTextContent('ERROR');
    expect(dialog).toHaveTextContent('The sections could not be loaded.');
  });
});

describe('SheetSurface', () => {
  it('draws the same panel as a plain element with no role', () => {
    const { container } = render(
      <SheetSurface side="right" title="Sections">
        <p>Body</p>
      </SheetSurface>,
    );
    expect(screen.getByRole('heading', { name: 'Sections' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('size-11');
    expect(screen.queryByRole('dialog')).toBeNull();
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('border-s-(length:--rule-w-heavy)');
    expect(panel.className).not.toContain('fixed');
  });

  it("side 'bottom' has the heavy top rule and the 85dvh cap", () => {
    const { container } = render(
      <SheetSurface side="bottom" title="Sections">
        <p>Body</p>
      </SheetSurface>,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('border-t-(length:--rule-w-heavy)');
    expect(panel.className).toContain('max-h-[85dvh]');
  });

  it('shows the Loading and Error body states', () => {
    const { rerender } = render(<SheetSurface side="right" title="T" bodyState="loading" loadingLabel="Loading sections…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading sections…');
    rerender(<SheetSurface side="right" title="T" bodyState="error" errorTitle="The sections could not be loaded." errorBody="Reload." />);
    expect(screen.getByText('The sections could not be loaded.')).toBeInTheDocument();
  });
});
