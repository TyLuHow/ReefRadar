/**
 * The playhead clock (DS-06, 04-14). It does not keep time itself: `getPosition` reads the audio
 * engine (AudioContext time), and the clock only decides how often to look.
 *
 *  - Motion allowed: a requestAnimationFrame loop that runs only while started AND the document is
 *    visible. It stops on `visibilitychange` to hidden and resumes (with an immediate tick) on
 *    visible. Nothing runs while paused: there is no idle loop (UI-SPEC "Motion").
 *  - Reduced motion: a 1 Hz setInterval. The playhead steps once per second; there is no frame
 *    loop and no scroll mode. The owner calls `tickNow` on seek and pause so those land at once.
 *
 * T-04-14-01: both modes are bounded by start/stop and by document visibility.
 */

export interface PlayheadClockOptions {
  /** True under reduced motion: step once per second instead of per frame. */
  reduced: boolean;
  /** Current position in seconds (the audio engine's clock). */
  getPosition: () => number;
  onTick: (seconds: number) => void;
}

export interface PlayheadClock {
  start: () => void;
  stop: () => void;
  /** Ticks immediately: used on seek and pause so the playhead and readout do not wait for the next step. */
  tickNow: () => void;
}

const REDUCED_INTERVAL_MS = 1000;

function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export function createPlayheadClock({ reduced, getPosition, onTick }: PlayheadClockOptions): PlayheadClock {
  let running = false;
  let frameId: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const tickNow = () => onTick(getPosition());

  function frame() {
    frameId = null;
    onTick(getPosition());
    if (running && !documentHidden()) frameId = requestAnimationFrame(frame);
  }

  function beginLoop() {
    if (reduced) {
      if (intervalId === null) intervalId = setInterval(tickNow, REDUCED_INTERVAL_MS);
    } else if (frameId === null) {
      frameId = requestAnimationFrame(frame);
    }
  }

  function endLoop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  function onVisibilityChange() {
    if (!running) return;
    if (documentHidden()) {
      endLoop();
    } else {
      tickNow();
      beginLoop();
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      document.addEventListener('visibilitychange', onVisibilityChange);
      if (!documentHidden()) beginLoop();
    },
    stop() {
      if (!running) return;
      running = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      endLoop();
    },
    tickNow,
  };
}
