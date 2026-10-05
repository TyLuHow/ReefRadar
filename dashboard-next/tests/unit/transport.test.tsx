/**
 * Transport (04-15, DS-05, DS-06).
 *
 * The component is controlled: it renders a status, a position and a duration and reports presses
 * and keys through callbacks. These tests prove the label cycle, the keyboard contract (Space, the
 * arrow keys as 5 s steps, Home and End), the readout format, every state's copy, the scrub slider's
 * words and the size classes. Real audio and the clock are covered by useTransport's own tests
 * (playhead-clock.test.ts) and by the fixtures page.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Transport, formatClock, formatScrubText, transportKeyAction } from '@/features/instrument';

function setup(props: Partial<React.ComponentProps<typeof Transport>> = {}) {
  const handlers = { onPlayPause: vi.fn(), onStep: vi.fn(), onSeek: vi.fn(), onRetry: vi.fn() };
  const view = render(<Transport size="compact" status="idle" position={0} duration={30} {...handlers} {...props} />);
  return { ...handlers, ...view };
}

describe('formatClock and formatScrubText', () => {
  it('formats mm:ss.t with the tenth floored, not rounded', () => {
    expect(formatClock(12.4)).toBe('00:12.4');
    expect(formatClock(30)).toBe('00:30.0');
    expect(formatClock(0)).toBe('00:00.0');
    expect(formatClock(59.99)).toBe('00:59.9');
    expect(formatClock(75.25)).toBe('01:15.2');
  });

  it('clamps nonsense to zero', () => {
    expect(formatClock(-3)).toBe('00:00.0');
    expect(formatClock(Number.NaN)).toBe('00:00.0');
  });

  it('writes the scrub value text in whole seconds', () => {
    expect(formatScrubText(12.4, 30)).toBe('0:12 of 0:30');
    expect(formatScrubText(0, 30)).toBe('0:00 of 0:30');
    expect(formatScrubText(65, 600)).toBe('1:05 of 10:00');
  });
});

describe('Transport: label cycle', () => {
  it('idle is Play, playing is Pause, ended is Replay', () => {
    const { rerender, onPlayPause, onStep, onSeek } = setup();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    rerender(<Transport size="compact" status="playing" position={3} duration={30} onPlayPause={onPlayPause} onStep={onStep} onSeek={onSeek} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    rerender(<Transport size="compact" status="ended" position={30} duration={30} onPlayPause={onPlayPause} onStep={onStep} onSeek={onSeek} />);
    expect(screen.getByRole('button', { name: 'Replay' })).toBeInTheDocument();
  });

  it('takes a longer play and pause name but keeps Replay', () => {
    const { rerender, onPlayPause, onStep, onSeek } = setup({ playLabel: 'Play ind_H1', pauseLabel: 'Pause ind_H1' });
    expect(screen.getByRole('button', { name: 'Play ind_H1' })).toBeInTheDocument();
    rerender(<Transport size="compact" status="playing" position={3} duration={30} onPlayPause={onPlayPause} onStep={onStep} onSeek={onSeek} playLabel="Play ind_H1" pauseLabel="Pause ind_H1" />);
    expect(screen.getByRole('button', { name: 'Pause ind_H1' })).toBeInTheDocument();
  });

  it('pressing the play button calls onPlayPause once and never starts anything itself', async () => {
    const user = userEvent.setup();
    const { onPlayPause } = setup();
    expect(onPlayPause).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('the previous and next buttons step one window back and forward', async () => {
    const user = userEvent.setup();
    const { onStep } = setup();
    await user.click(screen.getByRole('button', { name: 'Previous window' }));
    await user.click(screen.getByRole('button', { name: 'Next window' }));
    expect(onStep.mock.calls).toEqual([[-1], [1]]);
  });
});

describe('Transport: keyboard', () => {
  it('Space inside the Transport calls onPlayPause', async () => {
    const user = userEvent.setup();
    const { onPlayPause } = setup({ showScrub: true });
    const group = screen.getByRole('group', { name: 'Playback' });
    // Focus on a non-button part of the group (the scrub thumb) so the native button press is not involved.
    const thumb = within(group).getByRole('slider');
    thumb.focus();
    await user.keyboard(' ');
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('Space on the focused play button presses it once, not twice', async () => {
    const user = userEvent.setup();
    const { onPlayPause } = setup();
    screen.getByRole('button', { name: 'Play' }).focus();
    await user.keyboard(' ');
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('ArrowRight and ArrowLeft step one window; Home and End seek to the ends', async () => {
    const user = userEvent.setup();
    const { onStep, onSeek } = setup();
    screen.getByRole('button', { name: 'Play' }).focus();
    await user.keyboard('{ArrowRight}{ArrowLeft}{Home}{End}');
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
    expect(onSeek.mock.calls).toEqual([[0], [30]]);
  });

  it('the arrow keys and Home and End belong to the scrub slider while it has focus', async () => {
    const user = userEvent.setup();
    const { onStep } = setup({ showScrub: true });
    screen.getByRole('slider').focus();
    await user.keyboard('{ArrowRight}');
    expect(onStep).not.toHaveBeenCalled();
  });

  it('transportKeyAction maps keys and ignores everything else', () => {
    expect(transportKeyAction(' ')).toBe('playPause');
    expect(transportKeyAction('ArrowRight')).toBe('next');
    expect(transportKeyAction('ArrowLeft')).toBe('previous');
    expect(transportKeyAction('Home')).toBe('start');
    expect(transportKeyAction('End')).toBe('end');
    expect(transportKeyAction('a')).toBeNull();
    expect(transportKeyAction('Enter')).toBeNull();
  });
});

describe('Transport: readout', () => {
  it('reads "00:12.4 / 00:30.0" with the denominator in the muted colour', () => {
    setup({ status: 'playing', position: 12.4, duration: 30 });
    const readout = screen.getByTestId('transport-readout');
    expect(readout).toHaveTextContent('00:12.4 / 00:30.0');
    const duration = within(readout).getByText('/ 00:30.0');
    expect(duration.className).toContain('text-muted');
    expect(within(readout).getByText('00:12.4').className).not.toContain('text-muted');
  });

  it('uses the band muted colour on a band and the well muted colour in a well', () => {
    const { rerender, onPlayPause, onStep, onSeek } = setup({ tone: 'band', position: 12.4 });
    expect(within(screen.getByTestId('transport-readout')).getByText('/ 00:30.0').className).toContain('text-on-band-muted');
    rerender(<Transport size="compact" tone="well" status="idle" position={12.4} duration={30} onPlayPause={onPlayPause} onStep={onStep} onSeek={onSeek} />);
    expect(within(screen.getByTestId('transport-readout')).getByText('/ 00:30.0').className).toContain('text-well-muted');
  });
});

describe('Transport: states', () => {
  it('disabled: buttons disabled, dashes and the one-line reason', () => {
    setup({ status: 'disabled' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous window' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next window' })).toBeDisabled();
    expect(screen.getByTestId('transport-readout')).toHaveTextContent('--:-- / --:--');
    expect(screen.getByText('Select a recording to listen.')).toBeInTheDocument();
  });

  it('loading: buttons disabled and "Loading audio…" replaces the readout', () => {
    setup({ status: 'loading' });
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Loading audio…');
    expect(screen.queryByTestId('transport-readout')).toBeNull();
  });

  it('empty: dashes with both lines of copy and disabled buttons', () => {
    setup({ status: 'empty' });
    expect(screen.getByTestId('transport-readout')).toHaveTextContent('--:-- / --:--');
    expect(screen.getByText('No recording selected.')).toBeInTheDocument();
    expect(screen.getByText('Choose a site or a clip to listen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('error: the Error primitive replaces the readout and Retry calls onRetry', async () => {
    const user = userEvent.setup();
    const { onRetry } = setup({ status: 'error' });
    expect(screen.getByText('Audio could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('Check your connection, then try again.')).toBeInTheDocument();
    expect(screen.queryByTestId('transport-readout')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error without onRetry shows no Retry button', () => {
    setup({ status: 'error', onRetry: undefined });
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('unsupported: no buttons, the notice stays and says the rest keeps working', () => {
    setup({ status: 'unsupported' });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('This browser cannot play audio.')).toBeInTheDocument();
    expect(screen.getByText('The spectrogram and readings still work.')).toBeInTheDocument();
  });
});

describe('Transport: scrub slider and hint', () => {
  it('is labelled "Playback position" with the value text "0:12 of 0:30"', () => {
    setup({ showScrub: true, position: 12.4 });
    const slider = screen.getByRole('slider', { name: 'Playback position' });
    expect(slider).toHaveAttribute('aria-valuetext', '0:12 of 0:30');
  });

  it('shows no slider unless asked', () => {
    setup();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('is not offered when there is nothing to scrub', () => {
    setup({ showScrub: true, status: 'empty' });
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('the hint line names the shortcuts and is hidden on coarse pointers', () => {
    setup({ showHint: true });
    const hint = screen.getByText('Space play or pause · Left and right arrows move one 5 s window');
    expect(hint.className).toContain('pointer-coarse:hidden');
  });

  it('no hint unless asked', () => {
    setup();
    expect(screen.queryByText(/Space play or pause/)).toBeNull();
  });
});

describe('Transport: sizes', () => {
  const playClass = () => screen.getByRole('button', { name: 'Play' }).className;
  const readoutClass = () => screen.getByTestId('transport-readout').className;

  it('compact: 44 button, 16 readout', () => {
    setup({ size: 'compact' });
    expect(playClass()).toContain('size-11!');
    expect(readoutClass()).toContain('text-body');
  });

  it('medium: 56 for cards, 64 for compare, 28 readout', () => {
    const { unmount } = setup({ size: 'medium' });
    expect(playClass()).toContain('size-14!');
    expect(readoutClass()).toContain('text-title');
    unmount();
    setup({ size: 'medium', medium: 'compare' });
    expect(playClass()).toContain('size-16!');
  });

  it('large: 72 on phones, 80 on tablets, 96 on desktops; readout 28 on phones and 40 above', () => {
    setup({ size: 'large' });
    const name = playClass();
    expect(name).toContain('size-18!');
    expect(name).toContain('sm:size-20!');
    expect(name).toContain('lg:size-24!');
    expect(readoutClass()).toContain('text-title');
    expect(readoutClass()).toContain('sm:text-h2');
  });

  it('the band and well tones fill the play button with the on-band colour', () => {
    setup({ tone: 'band' });
    expect(playClass()).toContain('bg-on-band!');
    expect(playClass()).toContain('text-band!');
  });

  it('the light tone uses the control fill', () => {
    setup({ tone: 'light' });
    expect(playClass()).toContain('bg-control!');
    expect(playClass()).toContain('text-on-control!');
  });
});

describe('Transport: forced state', () => {
  it('draws hover on the play button for review', () => {
    setup({ forcedState: 'hover' });
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('data-force-hover');
  });
});

/**
 * Chrome drops focus to the body, without a blur event, when the focused control becomes disabled;
 * jsdom keeps it. This blurs the active element with its blur and focusout events swallowed, so the
 * component sees what it sees in a browser: focus gone and no event to say so.
 */
function silentFocusLoss() {
  const swallow = (event: Event) => event.stopImmediatePropagation();
  document.addEventListener('focusout', swallow, true);
  document.addEventListener('blur', swallow, true);
  (document.activeElement as HTMLElement).blur();
  document.removeEventListener('focusout', swallow, true);
  document.removeEventListener('blur', swallow, true);
}

describe('Transport: focus survives a pending press', () => {
  function Props(status: React.ComponentProps<typeof Transport>['status'], extra: Partial<React.ComponentProps<typeof Transport>> = {}) {
    return <Transport size="compact" status={status} position={0} duration={30} onPlayPause={() => undefined} onStep={() => undefined} onSeek={() => undefined} {...extra} />;
  }

  it('puts focus back on the play button after the loading moment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(Props('idle'));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
    silentFocusLoss();
    rerender(Props('loading'));
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    rerender(Props('playing'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus());
  });

  it('keeps the scrub slider mounted (disabled) while loading and returns focus to it', async () => {
    const { rerender } = render(Props('idle', { showScrub: true }));
    screen.getByRole('slider', { name: 'Playback position' }).focus();
    silentFocusLoss();
    rerender(Props('loading', { showScrub: true }));
    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeDisabled();
    rerender(Props('playing', { showScrub: true }));
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Playback position' })).toHaveFocus());
  });

  it('does not steal focus the person moved elsewhere during the loading moment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        {Props('idle')}
        <button type="button">elsewhere</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Play' }));
    rerender(
      <>
        {Props('loading')}
        <button type="button">elsewhere</button>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    rerender(
      <>
        {Props('playing')}
        <button type="button">elsewhere</button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
  });

  it('does not take focus when the person never had it in the Transport', () => {
    const { rerender } = render(Props('loading'));
    rerender(Props('idle'));
    expect(screen.getByRole('button', { name: 'Play' })).not.toHaveFocus();
  });
});
