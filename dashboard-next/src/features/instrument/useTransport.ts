'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { useReducedMotion } from '@/features/ui';
import { createAudioEngine, equalPowerGains, isAudioSupported, type AudioEngine } from './audio-engine';
import { dbToLinear } from './compare-math';
import { createPlayheadClock } from './playhead-clock';
import type { SpectrogramHandle } from './Spectrogram';

/**
 * Glue between the audio engine, the playhead clock and the spectrogram wells (DS-05, DS-06, 04-14).
 *
 * The clock reads AudioContext time through the engine. Each tick writes the position to every well
 * through its imperative handle (`setPlayhead`), never through React state, so a frame does not
 * re-render anything. The only React state is `positionS` for the time readout, and it changes at
 * most once per whole second, or at once on seek, pause, end and when the clock resumes.
 *
 * Under reduced motion the clock steps once per second (no frame loop). The clock runs only while
 * playing, while the document is visible and, when `observe` is given, while that element is on
 * screen. Going off-screen pauses the clock, not the audio.
 */

export interface TransportClip {
  id: string;
  /** The recording's bytes (useClipSpectrogram's `buffer`). The engine keeps its own copy. */
  buffer: ArrayBuffer;
  durationS: number;
}

export type TransportStatus = 'idle' | 'playing' | 'ended' | 'loading' | 'unsupported' | 'error';

export interface UseTransportOptions {
  /** One clip, or several of equal length played in sync. Memoise or keep stable where you can. */
  clips: TransportClip[];
  /** Wells whose playhead follows the clock. */
  wells: RefObject<SpectrogramHandle | null>[];
  /** Optional element (the wells' container). While it is off-screen the clock is paused. */
  observe?: RefObject<Element | null>;
  /**
   * 04-16: a level-matching gain in dB for each clip, in the same order as `clips`. Multiplied into
   * the clip's playback gain (with the crossfade gain when there are two clips). Only attenuation is
   * expected (0 or negative), so matching never plays a clip louder than its original. Absent means 0 dB.
   */
  levelGainsDb?: number[];
}

/** What `useTransport` returns. (Named apart from the `Transport` component.) */
export interface TransportController {
  status: TransportStatus;
  /** Seconds, for the readout. Changes at most once a second while playing. */
  positionS: number;
  durationS: number;
  error: Error | null;
  /** Call from a press handler: the first call creates the AudioContext. */
  playPause: () => void;
  /** Jumps one 5 s window forward (1) or back (-1). */
  step: (direction: 1 | -1) => void;
  seek: (seconds: number) => void;
  toStart: () => void;
  toEnd: () => void;
  /** Crossfader position in [0, 1]: equal-power gains, clip 0 at 0 and clip 1 at 1. No effect with one clip. */
  setMix: (x: number) => void;
}

export const STEP_SECONDS = 5;

interface View {
  engine: AudioEngine;
  status: Exclude<TransportStatus, 'unsupported'>;
  positionS: number;
  error: Error | null;
}

function fresh(engine: AudioEngine): View {
  return { engine, status: 'idle', positionS: 0, error: null };
}

function sameClips(a: TransportClip[], b: TransportClip[]): boolean {
  return a.length === b.length && a.every((clip, index) => clip.id === b[index].id && clip.buffer === b[index].buffer && clip.durationS === b[index].durationS);
}

/** Linear gain for a clip's level-matching dB (04-16); 1 when none is given or it is not a number. */
function levelFactor(levelGainsDb: number[] | undefined, index: number): number {
  const db = levelGainsDb?.[index];
  return db === undefined || !Number.isFinite(db) ? 1 : dbToLinear(db);
}

function mixGains(clips: TransportClip[], x: number, levelGainsDb?: number[]): Record<string, number> | undefined {
  if (clips.length < 2) return undefined;
  const { a, b } = equalPowerGains(x);
  return { [clips[0].id]: a * levelFactor(levelGainsDb, 0), [clips[1].id]: b * levelFactor(levelGainsDb, 1) };
}

const noopSubscribe = () => () => undefined;

export function useTransport({ clips, wells, observe, levelGainsDb }: UseTransportOptions): TransportController {
  const reduced = useReducedMotion(observe);
  const supported = useSyncExternalStore(noopSubscribe, isAudioSupported, () => true);

  // Keep the previous clips array while the content is the same, so an inline array does not rebuild the engine.
  const [stableClips, setStableClips] = useState(clips);
  if (!sameClips(stableClips, clips)) setStableClips(clips);

  const engine = useMemo(() => createAudioEngine(), [stableClips]);
  const [view, setView] = useState<View>(() => fresh(engine));
  const current = view.engine === engine ? view : fresh(engine);

  const patch = useCallback(
    (next: Partial<Omit<View, 'engine'>>) => {
      setView((previous) => ({ ...(previous.engine === engine ? previous : fresh(engine)), ...next, engine }));
    },
    [engine],
  );

  const [inView, setInView] = useState(true);

  const wellsRef = useRef(wells);
  useEffect(() => {
    wellsRef.current = wells;
  });
  const levelsRef = useRef(levelGainsDb);
  useEffect(() => {
    levelsRef.current = levelGainsDb;
  });
  const gainsRef = useRef<Record<string, number> | undefined>(undefined);
  const lastReadout = useRef(-1);

  const durationS = stableClips[0]?.durationS ?? 0;
  const ids = useMemo(() => stableClips.map((clip) => clip.id), [stableClips]);

  /** Writes the position to every well (no React render) and, when due, to the readout state. */
  const apply = useCallback(
    (seconds: number, force: boolean) => {
      for (const well of wellsRef.current) well.current?.setPlayhead(seconds);
      const whole = Math.floor(seconds);
      if (force || whole !== lastReadout.current) {
        lastReadout.current = whole;
        patch({ positionS: seconds });
      }
    },
    [patch],
  );

  // Load the clips into this engine; dispose it when the clips change or the component goes away.
  useEffect(() => {
    if (!supported) return;
    for (const clip of stableClips) engine.load(clip.id, clip.buffer);
    gainsRef.current = mixGains(stableClips, 0, levelsRef.current);
    lastReadout.current = -1;
    for (const well of wellsRef.current) well.current?.setPlayhead(0);
    const unsubscribe = engine.onEnded(() => {
      patch({ status: 'ended' });
      apply(engine.position(), true);
    });
    return () => {
      unsubscribe();
      engine.dispose();
    };
  }, [engine, stableClips, supported, patch, apply]);

  // Off-screen pauses the clock, never the audio.
  useEffect(() => {
    const element = observe?.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setInView(last.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [observe]);

  // The clock: alive only while playing and on screen. It restarts when the reduced-motion switch flips.
  const playing = current.status === 'playing';
  useEffect(() => {
    if (!playing || !inView) return;
    const clock = createPlayheadClock({
      reduced,
      getPosition: () => engine.position(),
      onTick: (seconds) => apply(seconds, false),
    });
    clock.start();
    clock.tickNow();
    return () => clock.stop();
  }, [playing, inView, reduced, engine, apply]);

  const playPause = useCallback(() => {
    if (!supported) return;
    if (current.status === 'playing' || current.status === 'loading') {
      engine.pause();
      patch({ status: 'idle' });
      apply(engine.position(), true);
      return;
    }
    patch({ status: 'loading', error: null });
    // engine.play creates and resumes the AudioContext synchronously, inside this press.
    engine.play({ ids, gains: gainsRef.current }).then(
      (started) => {
        if (started) patch({ status: 'playing' });
      },
      (error: unknown) => {
        patch({ status: 'error', error: error instanceof Error ? error : new Error('The recording could not be played.') });
      },
    );
  }, [supported, current.status, engine, ids, patch, apply]);

  const seek = useCallback(
    (seconds: number) => {
      const target = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), durationS);
      const wasPlaying = engine.isPlaying();
      engine.seek(target);
      if (!wasPlaying) patch({ status: target >= durationS && durationS > 0 ? 'ended' : current.status === 'ended' ? 'idle' : current.status });
      apply(engine.position(), true);
    },
    [engine, durationS, patch, apply, current.status],
  );

  const step = useCallback((direction: 1 | -1) => seek(engine.position() + direction * STEP_SECONDS), [seek, engine]);
  const toStart = useCallback(() => seek(0), [seek]);
  const toEnd = useCallback(() => seek(durationS), [seek, durationS]);

  const setMix = useCallback(
    (x: number) => {
      const gains = mixGains(stableClips, x, levelsRef.current);
      if (!gains) return;
      gainsRef.current = gains;
      engine.setGains(gains);
    },
    [engine, stableClips],
  );

  return {
    status: supported ? current.status : 'unsupported',
    positionS: current.positionS,
    durationS,
    error: current.error,
    playPause,
    step,
    seek,
    toStart,
    toEnd,
    setMix,
  };
}
