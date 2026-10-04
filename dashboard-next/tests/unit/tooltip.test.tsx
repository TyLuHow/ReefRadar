/**
 * Tooltip and TooltipSurface (04-05, DS-04). The trigger is a React Aria Components element (our
 * Button); a tooltip only repeats information, so the tests cover how it opens and closes.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Tooltip, TooltipSurface } from '@/features/ui';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Tooltip: keyboard', () => {
  it('focusing the trigger with the keyboard shows the tooltip with no delay', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Play from the start">
        <Button variant="icon" aria-label="Play" />
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Play from the start');
  });

  it('Escape hides the tooltip and focus stays on the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Play from the start">
        <Button variant="icon" aria-label="Play" />
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
  });

  it('blurring the trigger hides the tooltip', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="Play from the start">
          <Button variant="icon" aria-label="Play" />
        </Tooltip>
        <button type="button">elsewhere</button>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('describes the trigger while it is open', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Play from the start">
        <Button variant="icon" aria-label="Play" />
      </Tooltip>,
    );
    await user.tab();
    const tooltip = screen.getByRole('tooltip');
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-describedby')).toBe(tooltip.id);
  });
});

/**
 * React Aria keeps module-level "warmed up" state: after any tooltip has opened, the next one opens
 * at once until a 500 ms cooldown that only starts when a tooltip closes. Open and close one, then
 * let the cooldown run out in real time, so the delay under test starts cold whatever ran before.
 */
async function startCold() {
  const user = userEvent.setup();
  const { unmount } = render(
    <Tooltip content="warm up">
      <Button variant="icon" aria-label="Warm up" />
    </Tooltip>,
  );
  await user.tab();
  await user.keyboard('{Escape}');
  unmount();
  await new Promise((resolve) => setTimeout(resolve, 650));
}

describe('Tooltip: hover delay', () => {
  it('opens after the 300 ms default delay', async () => {
    await startCold();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // Testing Library detects fake timers through a `jest` global and then advances them while it
    // drains the microtask queue; without it, its real-timer wait never fires under vitest.
    vi.stubGlobal('jest', { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    render(
      <Tooltip content="Play from the start">
        <Button variant="icon" aria-label="Play" />
      </Tooltip>,
    );
    // React Aria opens on hover only when the last interaction was the pointer. A real pointer has
    // already moved over the page by the time it reaches the trigger; move it first here too.
    await user.pointer({ target: document.body });
    await user.hover(screen.getByRole('button', { name: 'Play' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Play from the start');
  });
});

describe('Tooltip: box', () => {
  it('uses the control tokens, a 280 px cap, wrapping text and a rounded-control radius with no arrow', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="A longer explanation that has to wrap rather than run off the edge of a small screen">
        <Button variant="icon" aria-label="Info" />
      </Tooltip>,
    );
    await user.tab();
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('bg-control', 'text-on-control', 'text-small', 'font-body', 'px-3', 'py-2', 'max-w-[280px]', 'rounded-control');
    expect(tooltip.className).toMatch(/data-entering:opacity-0/);
    expect(tooltip.className).toMatch(/data-exiting:opacity-0/);
    expect(tooltip.className).toMatch(/duration-\(--duration-base\)/);
    expect(tooltip.querySelector('svg')).toBeNull();
  });

  it('can be controlled open', () => {
    render(
      <Tooltip content="Always open" isOpen>
        <Button variant="icon" aria-label="Info" />
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('Always open');
  });

  it('can start open', () => {
    render(
      <Tooltip content="Starts open" defaultOpen>
        <Button variant="icon" aria-label="Info" />
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('Starts open');
  });
});

describe('TooltipSurface', () => {
  it('renders the same visual box as a plain role="tooltip" element', () => {
    render(<TooltipSurface>Static open cell</TooltipSurface>);
    const surface = screen.getByRole('tooltip');
    expect(surface.tagName).toBe('DIV');
    expect(surface).toHaveTextContent('Static open cell');
    expect(surface).toHaveClass('bg-control', 'text-on-control', 'text-small', 'font-body', 'px-3', 'py-2', 'max-w-[280px]', 'rounded-control');
  });

  it('has no overlay behaviour: it is not portalled and carries no entering or exiting state', () => {
    const { container } = render(<TooltipSurface>Static open cell</TooltipSurface>);
    expect(container.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(screen.getByRole('tooltip')).not.toHaveAttribute('data-entering');
    expect(screen.getByRole('tooltip').className).not.toMatch(/data-entering|data-exiting/);
  });
});
