'use client';

import clsx from 'clsx';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useLayoutEffect, useRef, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Button, ErrorState, Slider, type ButtonTone, type SliderTone } from '@/features/ui';
import type { TransportStatus } from './useTransport';

/**
 * Transport (DS-05, DS-06, UI-SPEC "Transport"): [previous window] [play or pause] [next window]
 * [time readout] and an optional scrub slider, in three sizes of one component.
 *
 * The component is controlled and does no audio: `useTransport` (04-14) owns the engine and the
 * clock and hands this component a status, a position and a duration. Playback never starts by
 * itself; the only thing here that can start it is a press or a key the person made.
 *
 * Keyboard (inside the Transport): Space play or pause, ArrowLeft and ArrowRight the previous and
 * next 5 s window, Home the start, End the end. Two native behaviours are left alone so nothing
 * fires twice or fights the slider: a focused button handles its own Space (so Space is not also
 * a second play press), and the scrub slider keeps the arrows, Home and End for itself.
 *
 * The play button is the kit `Button` (icon variant) made larger and recoloured. Its size and
 * colours use the important modifier, because the icon variant already sets its own `size-11`,
 * background and text colour and the cascade order of two utilities for one property is not
 * something to rely on. Classes are joined with `clsx`, not `cn` (see Button.tsx).
 *
 * Focus survives a pending press. While the engine decodes after a press its status is `loading`,
 * and the controls are disabled for that moment (UI-SPEC "Loading"); a disabled control cannot
 * hold focus, so a keyboard user would land on the page body. The Transport remembers where focus
 * was inside it and puts it back once the controls are usable again, unless the person has moved
 * focus elsewhere in the meantime.
 *
 * `status` adds three display-only values to the engine's: `disabled` (no recording to act on yet),
 * `empty` (nothing selected) and the engine's own `loading`, `error` and `unsupported`. In
 * `unsupported` the buttons are gone and the notice says the spectrogram and readings still work.
 */

export type TransportSize = 'compact' | 'medium' | 'large';
export type TransportTone = 'light' | 'band' | 'well';
export type TransportDisplayStatus = TransportStatus | 'disabled' | 'empty';
export type TransportKeyAction = 'playPause' | 'next' | 'previous' | 'start' | 'end';

export interface TransportProps {
  size: TransportSize;
  /** Medium only: 56 px (`card`, the default) or 64 px (`compare`). */
  medium?: 'card' | 'compare';
  status: TransportDisplayStatus;
  /** Seconds. */
  position: number;
  /** Seconds. */
  duration: number;
  onPlayPause: () => void;
  /** Jump one 5 s window forward (1) or back (-1). */
  onStep: (direction: 1 | -1) => void;
  onSeek: (seconds: number) => void;
  onRetry?: () => void;
  /** `light` on the page ground, `band` on a band, `well` inside a well. */
  tone?: TransportTone;
  /** The play button's name when idle; "Replay" is fixed. Defaults to "Play". */
  playLabel?: string;
  /** The play button's name while playing. Defaults to "Pause". */
  pauseLabel?: string;
  showScrub?: boolean;
  showHint?: boolean;
  /** Draws hover, focus or pressed on the play button (fixtures page only). */
  forcedState?: 'hover' | 'focus' | 'pressed';
  className?: string;
}

const HINT = 'Space play or pause · Left and right arrows move one 5 s window';
const DASHES = '--:-- / --:--';

/** "mm:ss.t": minutes and seconds, then the tenth of a second (floored, so the readout never runs ahead). */
export function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const tenths = Math.floor(safe * 10 + 1e-9);
  const whole = Math.floor(tenths / 10);
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}.${tenths % 10}`;
}

function minSec(seconds: number): string {
  const whole = Math.floor(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The scrub slider's value text: "0:12 of 0:30". */
export function formatScrubText(position: number, duration: number): string {
  return `${minSec(position)} of ${minSec(duration)}`;
}

/** What a key means to a Transport, or null when it means nothing to it. */
export function transportKeyAction(key: string): TransportKeyAction | null {
  switch (key) {
    case ' ':
    case 'Spacebar':
      return 'playPause';
    case 'ArrowRight':
      return 'next';
    case 'ArrowLeft':
      return 'previous';
    case 'Home':
      return 'start';
    case 'End':
      return 'end';
    default:
      return null;
  }
}

interface ToneClasses {
  text: string;
  muted: string;
  focus: ButtonTone;
  slider: SliderTone;
  play: string;
  side: string;
  errorBox: string | undefined;
}

// Written out in full: Tailwind finds classes by scanning source text, so they cannot be interpolated.
const TONES: Record<TransportTone, ToneClasses> = {
  light: {
    text: 'text-ink',
    muted: 'text-muted',
    focus: 'light',
    slider: 'light',
    play: clsx(
      'bg-control! text-on-control! hover-state:bg-control-hover! pressed-state:bg-control-pressed!',
      'data-disabled:bg-track! data-disabled:text-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]!',
    ),
    side: '',
    errorBox: undefined,
  },
  band: {
    text: 'text-on-band',
    muted: 'text-on-band-muted',
    focus: 'well',
    slider: 'well',
    play: clsx(
      'bg-on-band! text-band! hover-state:bg-band-control-hover! pressed-state:bg-band-control-pressed!',
      'data-disabled:bg-on-band/25! data-disabled:text-on-band-muted!',
    ),
    side: 'text-on-band! hover-state:bg-on-band/15! pressed-state:bg-on-band/25! data-disabled:text-on-band-muted!',
    errorBox: 'bg-ground p-3 text-ink',
  },
  well: {
    text: 'text-well-ink',
    muted: 'text-well-muted',
    focus: 'well',
    slider: 'well',
    play: clsx(
      'bg-on-band! text-band! hover-state:bg-band-control-hover! pressed-state:bg-band-control-pressed!',
      'data-disabled:bg-well-rule! data-disabled:text-well-muted!',
    ),
    side: 'text-well-ink! hover-state:bg-well-raised! pressed-state:bg-well-raised! data-disabled:text-well-muted!',
    errorBox: 'bg-ground p-3 text-ink',
  },
};

// Button side, icon size (34% of the button) and readout type for each size.
const PLAY_SIZE = {
  compact: 'size-11!',
  mediumCard: 'size-14!',
  mediumCompare: 'size-16!',
  large: 'size-18! sm:size-20! lg:size-24!',
} as const;

const READOUT_SIZE: Record<TransportSize, string> = {
  compact: 'text-body',
  medium: 'text-title',
  large: 'text-title sm:text-h2',
};

const FORCED_ATTRIBUTE = { hover: 'data-force-hover', focus: 'data-force-focus', pressed: 'data-force-pressed' } as const;

function playButtonLabel(status: TransportDisplayStatus, playLabel: string, pauseLabel: string): string {
  if (status === 'playing') return pauseLabel;
  if (status === 'ended') return 'Replay';
  return playLabel;
}

export function Transport({
  size,
  medium = 'card',
  status,
  position,
  duration,
  onPlayPause,
  onStep,
  onSeek,
  onRetry,
  tone = 'light',
  playLabel = 'Play',
  pauseLabel = 'Pause',
  showScrub = false,
  showHint = false,
  forcedState,
  className,
}: TransportProps) {
  const t = TONES[tone];
  const rootRef = useRef<HTMLDivElement>(null);
  const focusInside = useRef(false);
  const lastFocused = useRef<HTMLElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const active = status === 'idle' || status === 'playing' || status === 'ended';
  const unsupported = status === 'unsupported';
  const buttonsDisabled = !active;

  const playSize = size === 'compact' ? PLAY_SIZE.compact : size === 'large' ? PLAY_SIZE.large : medium === 'compare' ? PLAY_SIZE.mediumCompare : PLAY_SIZE.mediumCard;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (!active || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const action = transportKeyAction(event.key);
    if (action === null) return;
    const target = event.target as HTMLElement;
    // A focused button presses itself on Space; the slider keeps the arrows, Home and End.
    if (action === 'playPause' ? target.closest('button') !== null : target instanceof HTMLInputElement && target.type === 'range') return;
    event.preventDefault();
    if (action === 'playPause') onPlayPause();
    else if (action === 'next') onStep(1);
    else if (action === 'previous') onStep(-1);
    else if (action === 'start') onSeek(0);
    else onSeek(duration);
  }

  // Keep focus through a disabled moment (see the header): note it on the way out, restore it on the way back.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const at = document.activeElement as HTMLElement | null;
    const usable = at !== null && root.contains(at) && !(at as HTMLButtonElement).disabled;
    if (!active) {
      if (focusInside.current && !usable) restoreTo.current = lastFocused.current;
      return;
    }
    const node = restoreTo.current;
    restoreTo.current = null;
    if (node && node.isConnected && (at === null || at === document.body || at === node)) node.focus();
  }, [active]);

  function handleFocus(event: ReactFocusEvent<HTMLElement>) {
    focusInside.current = true;
    lastFocused.current = event.target as HTMLElement;
  }

  function handleBlur(event: ReactFocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focusInside.current = false;
  }

  const forced = forcedState ? { [FORCED_ATTRIBUTE[forcedState]]: '' } : {};

  const showDashes = status === 'disabled' || status === 'empty';
  let readout: ReactNode = null;
  if (active) {
    readout = (
      <span data-testid="transport-readout" className={clsx('font-data tabular whitespace-nowrap', READOUT_SIZE[size], t.text)}>
        <span>{formatClock(position)}</span> <span className={t.muted}>{`/ ${formatClock(duration)}`}</span>
      </span>
    );
  } else if (showDashes) {
    readout = (
      <span data-testid="transport-readout" className={clsx('font-data tabular whitespace-nowrap', READOUT_SIZE[size], t.muted)}>
        {DASHES}
      </span>
    );
  } else if (status === 'loading') {
    readout = (
      <p role="status" aria-busy="true" className={clsx('text-small', t.muted)}>
        Loading audio…
      </p>
    );
  } else if (status === 'error') {
    readout = (
      <div className={t.errorBox}>
        <ErrorState
          announce="status"
          headingLevel={3}
          title="Audio could not be loaded."
          body="Check your connection, then try again."
          onRetry={onRetry}
        />
      </div>
    );
  }

  let notice: ReactNode = null;
  if (status === 'disabled') {
    notice = <p className={clsx('text-small', t.muted)}>Select a recording to listen.</p>;
  } else if (status === 'empty') {
    notice = (
      <div className={clsx('text-small', t.muted)}>
        <p className={clsx('font-semibold', t.text)}>No recording selected.</p>
        <p>Choose a site or a clip to listen.</p>
      </div>
    );
  } else if (unsupported) {
    notice = (
      <div role="status" className={clsx('text-small', t.muted)}>
        <p className={clsx('font-semibold', t.text)}>This browser cannot play audio.</p>
        <p>The spectrogram and readings still work.</p>
      </div>
    );
  }

  const iconSize = 'size-[34%] shrink-0';
  const sideTone = tone === 'light' ? undefined : t.side;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Playback"
      data-transport=""
      data-transport-size={size}
      data-transport-status={status}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={clsx('flex flex-col gap-3', t.text, className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        {unsupported ? null : (
          <>
            <Button
              variant="icon"
              tone={t.focus}
              aria-label="Previous window"
              isDisabled={buttonsDisabled}
              onPress={() => onStep(-1)}
              className={sideTone}
            >
              <SkipBack aria-hidden="true" size={20} />
            </Button>
            <Button
              variant="icon"
              tone={t.focus}
              aria-label={playButtonLabel(status, playLabel, pauseLabel)}
              isDisabled={buttonsDisabled}
              onPress={onPlayPause}
              className={clsx(playSize, t.play)}
              {...forced}
            >
              {status === 'playing' ? (
                <Pause aria-hidden="true" className={iconSize} fill="currentColor" strokeWidth={0} />
              ) : status === 'ended' ? (
                <RotateCcw aria-hidden="true" className={iconSize} strokeWidth={2.5} />
              ) : (
                <Play aria-hidden="true" className={iconSize} fill="currentColor" strokeWidth={0} />
              )}
            </Button>
            <Button
              variant="icon"
              tone={t.focus}
              aria-label="Next window"
              isDisabled={buttonsDisabled}
              onPress={() => onStep(1)}
              className={sideTone}
            >
              <SkipForward aria-hidden="true" size={20} />
            </Button>
          </>
        )}
        {readout}
      </div>
      {notice}
      {showScrub && (active || status === 'loading') ? (
        <Slider
          label="Playback position"
          isDisabled={!active}
          tone={t.slider}
          minValue={0}
          maxValue={duration > 0 ? duration : 1}
          step={1}
          value={Math.min(Math.max(position, 0), duration > 0 ? duration : 1)}
          onChange={onSeek}
          formatValueText={(value) => formatScrubText(value, duration)}
          formatEndLabel={(value) => minSec(value)}
        />
      ) : null}
      {showHint && !unsupported ? (
        <p className={clsx('font-data text-eyebrow pointer-coarse:hidden', t.muted)}>{HINT}</p>
      ) : null}
    </div>
  );
}
