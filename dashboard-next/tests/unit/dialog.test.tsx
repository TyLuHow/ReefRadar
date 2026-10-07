/**
 * Dialog, AlertDialog and DialogSurface (04-10, DS-04). Behaviour comes from React Aria Components'
 * ModalOverlay, Modal and Dialog; these tests pin the contract of UI-SPEC "Dialog (modal and
 * alertdialog)": focus moves in and is trapped, Escape closes (or cancels) and focus returns to the
 * trigger, the alertdialog starts on its safe action and a scrim press does not close it, and the
 * visual surface is token-only (scrim without blur, heavy top rule, 44 px close button).
 */
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AlertDialog, Button, Dialog, DialogSurface } from '@/features/ui';

function Basic(props: Partial<React.ComponentProps<typeof Dialog>>) {
  return (
    <>
      <button type="button">before</button>
      <Dialog
        title="Reference label"
        trigger={<Button>Open dialog</Button>}
        actions={({ close }) => (
          <>
            <Button variant="secondary">Cancel</Button>
            <Button onPress={close}>Done</Button>
          </>
        )}
        {...props}
      >
        <p>Assigned by the dataset authors.</p>
      </Dialog>
      <button type="button">after</button>
    </>
  );
}

async function openBasic(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Open dialog' }));
  return screen.findByRole('dialog', { name: 'Reference label' });
}

/** The scrim is the ModalOverlay: the parent of the Modal that holds the dialog. */
function scrimOf(dialog: HTMLElement): HTMLElement {
  return dialog.parentElement?.parentElement as HTMLElement;
}

describe('Dialog: open, focus and close', () => {
  it('opens from the trigger and moves focus inside', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    expect(screen.queryByRole('dialog')).toBeNull();
    const dialog = await openBasic(user);
    expect(dialog).toHaveTextContent('Assigned by the dataset authors.');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('opens with Enter on the focused trigger', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    await user.tab();
    await user.tab();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Reference label' })).toBeInTheDocument();
  });

  it('Tab and Shift+Tab cycle inside the dialog and never reach the page behind it', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement), `Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 8; i += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement), `Shift+Tab ${i + 1}`).toBe(true);
    }
  });

  it('hides the page behind the dialog from assistive technology while it is open', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    await openBasic(user);
    expect(screen.queryByRole('button', { name: 'before' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'after' })).toBeNull();
  });

  it('Escape closes it and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    await openBasic(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus());
  });

  it('an action that calls close closes it and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    await openBasic(user);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus());
  });

  it('reports open and close through onOpenChange when controlled', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog
          title="Reference label"
          isOpen={open}
          onOpenChange={(next) => {
            onOpenChange(next);
            setOpen(next);
          }}
        >
          <p>Body</p>
        </Dialog>
      );
    }
    render(<Controlled />);
    expect(await screen.findByRole('dialog', { name: 'Reference label' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Dialog: dismissal and the close button', () => {
  it('has a Close button named "Close" that is a 44 by 44 icon button and closes it', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(dialog.contains(close)).toBe(true);
    expect(close.className).toContain('size-11');
    await user.click(close);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a scrim press closes a dismissable dialog', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    await user.click(scrimOf(dialog));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a scrim press does nothing when isDismissable is false, and Escape still closes it', async () => {
    const user = userEvent.setup();
    render(<Basic isDismissable={false} />);
    const dialog = await openBasic(user);
    await user.click(scrimOf(dialog));
    expect(screen.getByRole('dialog', { name: 'Reference label' })).toBeInTheDocument();
    // The press blurs the dialog; React Aria puts focus back inside it on the next frame, and
    // Escape is only heard once it has.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Dialog: surface and states', () => {
  it('uses the semantic tokens: scrim without blur, heavy top rule, opacity motion from the duration token', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    const scrim = scrimOf(dialog);
    expect(scrim.className).toContain('bg-scrim');
    expect(scrim.className).not.toMatch(/blur/);
    expect(scrim.className).toContain('duration-(--duration-base)');
    expect(scrim.className).toContain('data-exiting:opacity-0');
    const modal = dialog.parentElement as HTMLElement;
    expect(modal.className).toContain('bg-ground');
    expect(modal.className).toContain('rule-top-heavy');
    expect(modal.className).toContain('rounded-surface');
    expect(modal.className).toContain('w-[min(560px,calc(100%-32px))]');
    expect(modal.className).toContain('max-h-[calc(100dvh-32px)]');
    expect(modal.className).not.toMatch(/shadow/);
  });

  it('sets the title in the numeral face (roman) and labels the dialog with it', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    const heading = screen.getByRole('heading', { name: 'Reference label' });
    expect(dialog.contains(heading)).toBe(true);
    expect(heading.className).toContain('font-numeral');
    expect(heading.className).toContain('text-lead');
  });

  it("bodyState 'loading' shows the Loading state in the body", async () => {
    const user = userEvent.setup();
    render(<Basic bodyState="loading" loadingLabel="Loading site details…" />);
    const dialog = await openBasic(user);
    expect(dialog.querySelector('[role="status"]:not([aria-busy])')).not.toBeNull();
    expect(dialog).toHaveTextContent('Loading site details…');
    expect(dialog).not.toHaveTextContent('Assigned by the dataset authors.');
  });

  it("bodyState 'error' shows the Error state in the body", async () => {
    const user = userEvent.setup();
    render(<Basic bodyState="error" errorTitle="Provenance could not be loaded." errorBody="Try again, or open Methods and limits." />);
    const dialog = await openBasic(user);
    expect(dialog).toHaveTextContent('ERROR');
    expect(dialog).toHaveTextContent('Provenance could not be loaded.');
    expect(dialog).toHaveTextContent('Try again, or open Methods and limits.');
  });
});

describe('Dialog: portal target', () => {
  it('portals into the instrument surface root when there is one', async () => {
    const user = userEvent.setup();
    render(
      <div data-surface="instrument" data-testid="surface">
        <Basic />
      </div>,
    );
    const dialog = await openBasic(user);
    expect(screen.getByTestId('surface').contains(dialog)).toBe(true);
  });

  it('looks the surface up when it opens, not at first render (a replaced prerender fallback must not capture it)', async () => {
    const user = userEvent.setup();
    const stale = document.createElement('div');
    stale.setAttribute('data-surface', 'instrument');
    document.body.appendChild(stale);
    render(<Basic />);
    // The fallback surface is discarded and the real one mounts before the dialog is opened.
    stale.remove();
    const real = document.createElement('div');
    real.setAttribute('data-surface', 'instrument');
    document.body.appendChild(real);
    const dialog = await openBasic(user);
    expect(real.contains(dialog)).toBe(true);
    expect(stale.isConnected).toBe(false);
    real.remove();
  });

  it('portals to the document body when there is no surface', async () => {
    const user = userEvent.setup();
    render(<Basic />);
    const dialog = await openBasic(user);
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.closest('[data-surface]')).toBeNull();
  });
});

describe('AlertDialog', () => {
  function Discard(props: { onConfirm?: () => void } = {}) {
    return (
      <>
        <button type="button">before</button>
        <AlertDialog
          title="Discard this comparison?"
          body="The clips and their levels will be removed from this view."
          safeLabel="Keep comparison"
          confirmLabel="Discard comparison"
          onConfirm={props.onConfirm}
          trigger={<Button variant="secondary">Open alert dialog</Button>}
        />
      </>
    );
  }

  it('is an alertdialog with initial focus on the safe action', async () => {
    const user = userEvent.setup();
    render(<Discard />);
    await user.click(screen.getByRole('button', { name: 'Open alert dialog' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard this comparison?' });
    expect(dialog).toHaveTextContent('The clips and their levels will be removed from this view.');
    expect(screen.getByRole('button', { name: 'Keep comparison' })).toHaveFocus();
  });

  it('puts the safe action first and the confirm last, with no Close button', async () => {
    const user = userEvent.setup();
    render(<Discard />);
    await user.click(screen.getByRole('button', { name: 'Open alert dialog' }));
    const dialog = await screen.findByRole('alertdialog');
    const names = [...dialog.querySelectorAll('button')].map((b) => b.textContent);
    expect(names).toEqual(['Keep comparison', 'Discard comparison']);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('a scrim press does not close it', async () => {
    const user = userEvent.setup();
    render(<Discard />);
    await user.click(screen.getByRole('button', { name: 'Open alert dialog' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(scrimOf(dialog));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('Escape cancels it without confirming and focus returns to the trigger', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Discard onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Open alert dialog' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open alert dialog' })).toHaveFocus());
  });

  it('the safe action closes it without confirming', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Discard onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Open alert dialog' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the confirm action calls onConfirm once and closes it; the confirm is a primary button with no hue', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Discard onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Open alert dialog' }));
    await screen.findByRole('alertdialog');
    const confirm = screen.getByRole('button', { name: 'Discard comparison' });
    expect(confirm.className).toContain('bg-control');
    expect(confirm.className).not.toMatch(/red|danger|hab-degraded/);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('DialogSurface', () => {
  it('renders the same title, body and actions layout with no overlay behaviour', () => {
    const { container } = render(
      <DialogSurface title="Reference label" actions={<Button variant="secondary">Cancel</Button>}>
        <p>Assigned by the dataset authors.</p>
      </DialogSurface>,
    );
    expect(screen.getByRole('heading', { name: 'Reference label' })).toBeInTheDocument();
    expect(screen.getByText('Assigned by the dataset authors.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('size-11');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('bg-ground');
    expect(panel.className).toContain('rule-top-heavy');
    expect(panel.className).not.toContain('bg-scrim');
  });

  it("variant 'alertdialog' drops the Close button", () => {
    render(
      <DialogSurface variant="alertdialog" title="Discard this comparison?">
        <p>Body</p>
      </DialogSurface>,
    );
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('shows the Loading and Error body states', () => {
    const { rerender } = render(
      <DialogSurface title="T" bodyState="loading" loadingLabel="Loading site details…">
        <p>Body</p>
      </DialogSurface>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading site details…');
    expect(screen.queryByText('Body')).toBeNull();
    rerender(
      <DialogSurface title="T" bodyState="error" errorTitle="Provenance could not be loaded." errorBody="Try again.">
        <p>Body</p>
      </DialogSurface>,
    );
    expect(screen.getByText('Provenance could not be loaded.')).toBeInTheDocument();
  });
});
