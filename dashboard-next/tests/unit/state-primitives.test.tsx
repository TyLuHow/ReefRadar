/**
 * State primitives (04-08, DS-05): Skeleton, EmptyState, ErrorState, LoadingState.
 * UI-SPEC "Empty, Error, Loading (state primitives)": no icon, no red, no spinner; the copy pattern
 * is "{what is missing or failed}. {what to do next}."
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '@/features/ui';

describe('Skeleton', () => {
  it('is aria-hidden and static, with no animation class', () => {
    const { container } = render(<Skeleton className="h-6" />);
    const node = container.firstElementChild as HTMLElement;
    expect(node).toHaveAttribute('aria-hidden', 'true');
    expect(node.className).toContain('rounded-surface');
    expect(node.className).not.toMatch(/animate-|pulse|spin/);
  });

  it.each([
    ['ground', 'bg-track'],
    ['panel', 'bg-panel-hover'],
    ['well', 'bg-well-raised'],
  ] as const)('on %s uses %s', (on, fill) => {
    const { container } = render(<Skeleton on={on} />);
    expect((container.firstElementChild as HTMLElement).className).toContain(fill);
  });

  it('defaults to the ground fill', () => {
    const { container } = render(<Skeleton />);
    expect((container.firstElementChild as HTMLElement).className).toContain('bg-track');
  });
});

describe('EmptyState', () => {
  it('block renders a dashed strong rule box with title and body', () => {
    render(<EmptyState title="No recordings yet." body="Add a recording to see it here." />);
    const box = screen.getByText('No recordings yet.').parentElement as HTMLElement;
    expect(box.className).toContain('border-dashed');
    expect(box.className).toContain('border-rule-strong');
    expect(box.className).toContain('p-6');
    expect(screen.getByText('Add a recording to see it here.')).toBeInTheDocument();
  });

  it('inline renders a top rule and no box', () => {
    render(<EmptyState variant="inline" title="No sites to show." body="Clear a filter." />);
    const box = screen.getByText('No sites to show.').parentElement as HTMLElement;
    expect(box.className).toContain('border-t');
    expect(box.className).toContain('border-rule');
    expect(box.className).not.toContain('border-dashed');
    expect(box.className).not.toMatch(/(^|\s)border(\s|$)/);
  });

  it('renders no icon', () => {
    const { container } = render(<EmptyState title="Nothing here." body="Try again later." />);
    expect(container.querySelector('svg, img')).toBeNull();
  });

  it('an action renders a secondary button that calls its handler', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<EmptyState title="Nothing here." body="Clear the filter." action={{ label: 'Clear filter', onPress }} />);
    const button = screen.getByRole('button', { name: 'Clear filter' });
    expect(button.className).toContain('border-ink');
    await user.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders no button without an action', () => {
    render(<EmptyState title="Nothing here." body="Try again later." />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the ERROR eyebrow, the heading and the body, with no icon and no red', () => {
    const { container } = render(<ErrorState title="The recording could not be loaded." body="Try again in a moment." />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The recording could not be loaded.' })).toBeInTheDocument();
    expect(screen.getByText('Try again in a moment.')).toBeInTheDocument();
    expect(container.querySelector('svg, img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/\bred\b|-red-|danger/i);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('border-s-[3px]');
    expect(root.className).toContain('border-ink');
  });

  it("announce 'status' (the default) gives role=status", () => {
    render(<ErrorState title="Sites could not be loaded." body="Try again." />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("announce 'alert' gives role=alert", () => {
    render(<ErrorState title="The upload failed." body="Try again." announce="alert" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('the heading is focusable but not tabbable, and focusOnMount moves focus to it', () => {
    render(<ErrorState title="The upload failed." body="Try again." focusOnMount />);
    const heading = screen.getByRole('heading', { name: 'The upload failed.' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
  });

  it('does not take focus unless asked', () => {
    render(<ErrorState title="The upload failed." body="Try again." />);
    expect(screen.getByRole('heading', { name: 'The upload failed.' })).not.toHaveFocus();
  });

  it('shows no request id and no Copy button without a requestId', () => {
    render(<ErrorState title="Failed." body="Try again." />);
    expect(screen.queryByText(/Request id/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy request id' })).toBeNull();
  });

  it('with a requestId shows it, and Copy writes it to the clipboard then announces Copied politely', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ErrorState title="Failed." body="Try again." requestId="req-123" />);
    expect(screen.getByText('Request id: req-123')).toBeInTheDocument();

    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).not.toBeNull();
    expect(live.textContent).toBe('');

    await user.click(screen.getByRole('button', { name: 'Copy request id' }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('req-123');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(live).toHaveTextContent('Copied');
  });

  it('says so when the clipboard refuses, rather than claiming it copied', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ErrorState title="Failed." body="Try again." requestId="req-9" />);
    await user.click(screen.getByRole('button', { name: 'Copy request id' }));
    expect(await screen.findByText(/could not be copied/i)).toBeInTheDocument();
    expect(screen.queryByText('Copied')).toBeNull();
  });

  it('renders a secondary Retry button that calls onRetry, with a custom label', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState title="Failed." body="Try again." onRetry={onRetry} />);
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry.className).toContain('border-ink');
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<ErrorState title="Failed." body="Try again." onRetry={onRetry} retryLabel="Try again" />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders an optional link', () => {
    render(<ErrorState title="Failed." body="Go back." link={{ label: 'Back to sites', href: '/sites/' }} />);
    expect(screen.getByRole('link', { name: 'Back to sites' })).toHaveAttribute('href', '/sites/');
  });

  it('renders nothing but the words it was given: no error message or stack', () => {
    const { container } = render(<ErrorState title="Failed." body="Try again." requestId="abc" />);
    expect(container.textContent).not.toMatch(/at \w+ \(|stack|TypeError/);
  });
});

describe('LoadingState', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a status region that is not aria-busy (so it is announced), its label visible and its skeleton children inside', () => {
    render(
      <LoadingState label="Loading recording…">
        <Skeleton className="h-10" />
      </LoadingState>,
    );
    const region = screen.getByRole('status');
    expect(region).not.toHaveAttribute('aria-busy');
    expect(region).toHaveTextContent('Loading recording…');
    expect(region.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('renders no spinner', () => {
    const { container } = render(<LoadingState label="Loading…" />);
    expect(container.innerHTML).not.toMatch(/animate-spin|spinner|<svg/);
  });

  it("changes the label to 'This is taking longer than usual.' after 8000 ms", () => {
    vi.useFakeTimers();
    render(<LoadingState label="Loading recording…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading recording…');
    act(() => {
      vi.advanceTimersByTime(7999);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Loading recording…');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('This is taking longer than usual.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Loading recording…');
  });

  it('elapsedMs of 8000 or more shows the long-wait label at once', () => {
    render(<LoadingState label="Loading recording…" elapsedMs={8000} />);
    expect(screen.getByRole('status')).toHaveTextContent('This is taking longer than usual.');
  });

  it('elapsedMs below 8000 keeps the original label', () => {
    render(<LoadingState label="Loading recording…" elapsedMs={3000} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading recording…');
  });

  it('clears its timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = render(<LoadingState label="Loading…" />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
