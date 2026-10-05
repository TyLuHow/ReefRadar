/**
 * The Web Audio playback engine (DS-05, 04-14). One AudioContext is the clock for every playhead.
 *
 * Rules the engine enforces:
 *  - No AudioContext exists until the first `play` call, and that call must be inside a user gesture
 *    (a press): the context is created and resumed synchronously, before any await, so the browser's
 *    autoplay policy sees the gesture (T-04-14 trust boundary; Safari needs this too).
 *  - Several clips start together from one `start(when, offset)`, each into its own GainNode, so
 *    they stay sample-aligned by construction.
 *  - Clips of unequal length are rejected with UnequalLengthError, never stretched or padded.
 *  - Only the bytes of real recordings handed to `load` are ever played. The engine synthesises no
 *    audio of its own.
 *
 * `load` keeps a private copy of the bytes (decodeAudioData detaches the buffer it is given, and the
 * caller's copy belongs to useClipSpectrogram). Decoding happens at the first `play`, once the
 * context exists, and is cached per id.
 */

/** Two decoded clips may differ by this many seconds before they count as unequal (resampling rounding). */
const LENGTH_TOLERANCE_S = 0.01;
/** Gain smoothing time constant: about 50 ms to settle. This is audio de-zippering, not motion. */
const GAIN_TIME_CONSTANT_S = 0.015;

export class UnequalLengthError extends Error {
  readonly durations: Record<string, number>;
  constructor(durations: Record<string, number>) {
    super('The recordings are not the same length, so they cannot be played in sync.');
    this.name = 'UnequalLengthError';
    this.durations = durations;
  }
}

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** True when this browser has Web Audio (AudioContext or the older webkitAudioContext). */
export function isAudioSupported(): boolean {
  return audioContextConstructor() !== null;
}

/**
 * Equal-power crossfade gains for slider position x in [0, 1]: a = cos(x pi/2), b = sin(x pi/2),
 * so a^2 + b^2 = 1 and the loudness stays level through the middle. The ends are exact.
 */
export function equalPowerGains(x: number): { a: number; b: number } {
  if (!Number.isFinite(x) || x <= 0) return { a: 1, b: 0 };
  if (x >= 1) return { a: 0, b: 1 };
  return { a: Math.cos((x * Math.PI) / 2), b: Math.sin((x * Math.PI) / 2) };
}

export interface PlayOptions {
  /** Which loaded clips to play together. */
  ids: string[];
  /** Start position in seconds; absent resumes from the paused position (or 0 after the end). */
  offset?: number;
  /** Linear gain per id; absent ids play at 1. */
  gains?: Record<string, number>;
}

export interface AudioEngine {
  /** Keeps a private copy of a real recording's bytes. Decoded at the first play. */
  load: (id: string, arrayBuffer: ArrayBuffer) => void;
  /**
   * Starts the clips together. Call inside a user gesture. Resolves true once audio is running and
   * false if a pause, seek-to-end or dispose cancelled it while decoding. Rejects with
   * UnequalLengthError (nothing started) or an Error for an unknown id or a decode failure.
   */
  play: (options: PlayOptions) => Promise<boolean>;
  pause: () => void;
  /** Moves to `seconds` (clamped to the clip); restarts the sources in place while playing. */
  seek: (seconds: number) => void;
  /** Seconds into the clip: context time based while playing, the held offset while paused. */
  position: () => number;
  /** Clip length in seconds once decoded; 0 before the first play. */
  duration: () => number;
  isPlaying: () => boolean;
  /** Smoothly moves each id's gain. Remembered, so it also applies to the next play. */
  setGains: (gains: Record<string, number>) => void;
  /** Called once when playback reaches the end. Returns an unsubscribe function. */
  onEnded: (callback: () => void) => () => void;
  /** Stops audio, closes the context and forgets every clip. The engine can be loaded again afterwards. */
  dispose: () => void;
}

export interface AudioEngineOptions {
  /** Test seam: builds the context. Defaults to AudioContext / webkitAudioContext. */
  contextFactory?: () => AudioContext;
}

interface ActiveSource {
  id: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  let ctx: AudioContext | null = null;
  const raw = new Map<string, ArrayBuffer>();
  const decoded = new Map<string, AudioBuffer>();
  const gainValues: Record<string, number> = {};
  const endedListeners = new Set<() => void>();

  let active: ActiveSource[] = [];
  let activeIds: string[] = [];
  let playing = false;
  let startedAt = 0;
  let offset = 0;
  let clipDuration = 0;
  /** Bumped by pause, dispose and every new play, so a play still decoding can tell it was cancelled. */
  let token = 0;

  function createContext(): AudioContext {
    if (options.contextFactory) return options.contextFactory();
    const Constructor = audioContextConstructor();
    if (!Constructor) throw new Error('This browser cannot play audio.');
    return new Constructor();
  }

  function gainFor(id: string): number {
    return gainValues[id] ?? 1;
  }

  function position(): number {
    if (!playing || !ctx) return offset;
    const elapsed = ctx.currentTime - startedAt + offset;
    return Math.min(Math.max(elapsed, 0), clipDuration || elapsed);
  }

  function stopSources(): void {
    for (const { source, gain } of active) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
      gain.disconnect();
    }
    active = [];
  }

  function finish(): void {
    stopSources();
    playing = false;
    offset = clipDuration;
    for (const callback of [...endedListeners]) callback();
  }

  function startSources(from: number): void {
    const context = ctx;
    if (!context) return;
    const when = context.currentTime;
    const next: ActiveSource[] = [];
    for (const id of activeIds) {
      const buffer = decoded.get(id);
      if (!buffer) continue;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = gainFor(id);
      source.connect(gain);
      gain.connect(context.destination);
      next.push({ id, source, gain });
    }
    // One start time for all of them: they begin on the same sample frame.
    next.forEach(({ source }, index) => {
      if (index === 0) {
        source.onended = () => {
          if (playing) finish();
        };
      }
      source.start(when, from);
    });
    active = next;
    startedAt = when;
    offset = from;
    playing = true;
  }

  async function play({ ids, offset: requested, gains }: PlayOptions): Promise<boolean> {
    if (ids.length === 0) throw new Error('Nothing to play.');
    for (const id of ids) {
      if (!raw.has(id) && !decoded.has(id)) throw new Error(`No recording is loaded for "${id}".`);
    }
    if (playing) return true;

    // Synchronous, before any await: the user gesture must still be live here.
    const context = ctx ?? (ctx = createContext());
    const resume = context.state === 'suspended' ? context.resume() : Promise.resolve();
    const myToken = ++token;
    if (gains) Object.assign(gainValues, gains);

    const decodeJobs = ids.map(async (id) => {
      const cached = decoded.get(id);
      if (cached) return cached;
      const bytes = raw.get(id) as ArrayBuffer;
      const buffer = await context.decodeAudioData(bytes.slice(0));
      decoded.set(id, buffer);
      return buffer;
    });
    const buffers = await Promise.all([...decodeJobs, resume]).then((results) => results.slice(0, ids.length) as AudioBuffer[]);
    if (myToken !== token || ctx !== context) return false;

    const durations: Record<string, number> = {};
    ids.forEach((id, index) => {
      durations[id] = buffers[index].duration;
    });
    const lengths = Object.values(durations);
    if (Math.max(...lengths) - Math.min(...lengths) > LENGTH_TOLERANCE_S) throw new UnequalLengthError(durations);

    clipDuration = Math.min(...lengths);
    activeIds = ids;
    let from = requested ?? offset;
    if (!Number.isFinite(from) || from < 0 || from >= clipDuration) from = 0;
    startSources(from);
    return true;
  }

  function pause(): void {
    token++;
    if (!playing) return;
    const held = position();
    stopSources();
    playing = false;
    offset = held;
  }

  function seek(seconds: number): void {
    const limit = clipDuration || Math.max(seconds, 0);
    const target = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), limit);
    if (!playing) {
      offset = target;
      return;
    }
    if (target >= clipDuration) {
      finish();
      return;
    }
    stopSources();
    startSources(target);
  }

  function setGains(gains: Record<string, number>): void {
    Object.assign(gainValues, gains);
    if (!ctx) return;
    for (const { id, gain } of active) {
      const value = gains[id];
      if (value !== undefined) gain.gain.setTargetAtTime(value, ctx.currentTime, GAIN_TIME_CONSTANT_S);
    }
  }

  function onEnded(callback: () => void): () => void {
    endedListeners.add(callback);
    return () => {
      endedListeners.delete(callback);
    };
  }

  function dispose(): void {
    token++;
    stopSources();
    playing = false;
    offset = 0;
    clipDuration = 0;
    activeIds = [];
    raw.clear();
    decoded.clear();
    for (const key of Object.keys(gainValues)) delete gainValues[key];
    endedListeners.clear();
    const closing = ctx;
    ctx = null;
    if (closing && typeof closing.close === 'function' && closing.state !== 'closed') void closing.close().catch(() => undefined);
  }

  return {
    load: (id, arrayBuffer) => {
      raw.set(id, arrayBuffer.slice(0));
      decoded.delete(id);
    },
    play,
    pause,
    seek,
    position,
    duration: () => clipDuration,
    isPlaying: () => playing,
    setGains,
    onEnded,
    dispose,
  };
}
