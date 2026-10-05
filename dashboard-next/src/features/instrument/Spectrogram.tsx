'use client';

import clsx from 'clsx';
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { useReducedMotion } from '@/features/ui';
import { ColourBar, formatDb } from './ColourBar';
import { SPECTROGRAM_SPEC, dbAt, matrixToImageData, type SpectrogramMatrix } from './dsp';
import {
  backingStoreSize,
  frequencyTicks,
  scrollSourceRect,
  timeTicks,
  type PlayMode,
  type SourceRect,
} from './playhead';

/**
 * Spectrogram well (DS-03, 04-13): a real recording drawn in a dark well with the magma scale on one
 * fixed range (-120 to -50 dB re full scale, uncalibrated, shared by every clip), a labelled
 * frequency axis ending at the data's Nyquist, time labels and a dB colourbar.
 *
 * Rendering follows the CONTEXT decisions: Canvas 2D, the image is built once per matrix (the
 * lookup-table pixels, putImageData on an offscreen canvas, cached per matrix so wells that share a
 * clip share one image) and drawn onto the visible canvas once per resize. The canvas backing store
 * is devicePixelRatio times the CSS size, capped (`backingStoreSize`). The playhead is a DOM element
 * moved by transform from a ref, never a canvas repaint and never per-frame React state: the plan
 * 04-14 clock calls `setPlayhead(seconds)` on the imperative handle. In scroll mode the image pans
 * under a playhead held at 22 % of the width, which costs one drawImage per playhead update; under
 * reduced motion there is no scroll mode (the mode is forced to sweep) and nothing interpolates.
 *
 * Wells stay dark in every direction: every colour is a `well` token class. The spectrogram colours
 * come from the lookup table (identical in all directions) and are never read from tokens.
 *
 * Manual review items (axe cannot read canvas pixels): the magma ramp is perceptually uniform and
 * legible in greyscale; contrast of anything drawn over the image is guaranteed only by the chips'
 * own opaque backgrounds. See the ColourBar module header for the scale table.
 *
 * Accessibility: the wrapper is `role="img"` named "Spectrogram of {site}, 0 to {nyquist} kHz,
 * {duration} seconds" and described by the caption and a hidden summary. The summary holds metadata
 * only (duration, sample rate, RMS level from the manifest) and never says anything about health,
 * species or behaviour; text summaries of the content are Phase 16. The wrapper is not a tab stop
 * (Transport owns the keyboard) and holds no focusable control.
 */

export type SpectrogramVariant = 'panel' | 'hero' | 'compare' | 'thumb';
export type SpectrogramState = 'loading' | 'empty' | 'error' | 'unsupported';

export interface SpectrogramBand {
  id: string;
  label: string;
  lowHz: number;
  highHz: number;
}

export interface SpectrogramCaption {
  siteId: string;
  dataset: string;
  /** Recorder-clock time as `YYYY-MM-DDTHH:MM:SS` (timezone unverified). */
  recordedAt: string;
  durationS: number;
  sampleRateHz: number;
  fftSize: number;
}

export interface SpectrogramHandle {
  /** Moves the playhead (and, in scroll mode, the image) to `seconds` without a React render. */
  setPlayhead: (seconds: number) => void;
}

export interface SpectrogramProps {
  /** The fixed-range dB matrix of a real clip. Absent with no `state` reads as empty. */
  source?: SpectrogramMatrix;
  variant: SpectrogramVariant;
  /** Playhead position in seconds; absent hides the playhead until `setPlayhead` is called. */
  playheadSeconds?: number;
  /** `sweep` (default): the playhead moves over a static whole-clip image. `scroll`: the image pans under a playhead at 22 %. */
  playMode?: PlayMode;
  /** Scroll mode only: how many seconds are visible. Default is the whole clip. */
  visibleSeconds?: number;
  /** Index of a 5 s window to outline. */
  selectedWindow?: number;
  /** Frequency bands to draw as dashed hairlines with labels. */
  bands?: SpectrogramBand[];
  /** Plain-text description of measured content: metadata only. */
  description: string;
  caption?: SpectrogramCaption;
  state?: SpectrogramState;
  /** Shows the pointer readout for this cell as if hovering (static review cell). */
  forcePointer?: { seconds: number; hz: number };
  /**
   * Opacity of the picture, 0 to 1 (the well the crossfade moves away from, 04-16). Only the drawn
   * spectrogram fades into the dark well: the axes, chips and readout keep full strength, so their
   * text never falls below its contrast ratio while the picture is dimmed.
   */
  dimmed?: number;
  onReady?: () => void;
  /** Called with the pointed time on a press and while dragging. */
  onScrub?: (seconds: number) => void;
  className?: string;
  ref?: Ref<SpectrogramHandle>;
}

const WINDOW_SECONDS = 5;
const PLAYHEAD_WIDTH = 4;

/** Well heights from the UI-SPEC: desktop, tablet and phone steps. */
const WELL_HEIGHT: Record<SpectrogramVariant, string> = {
  panel: 'h-[160px] sm:h-[220px]',
  hero: 'h-[240px] sm:h-[360px] lg:h-[440px] w-full',
  compare: 'h-[160px] sm:h-[200px] lg:h-[230px]',
  thumb: 'h-[150px]',
};

const STATE_COPY: Record<SpectrogramState, { title: string; body?: string }> = {
  loading: { title: 'Drawing spectrogram…' },
  empty: { title: 'No recording selected', body: 'Choose a site or a clip to see its spectrogram.' },
  error: {
    title: 'The spectrogram could not be drawn.',
    body: 'The audio and any readings are unaffected. Reload the page to try again.',
  },
  unsupported: {
    title: 'This browser cannot draw the spectrogram.',
    body: 'Use a current version of Chrome, Edge, Firefox or Safari.',
  },
};

type OffscreenLike = HTMLCanvasElement | OffscreenCanvas;
type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const IMAGES = new WeakMap<SpectrogramMatrix, OffscreenLike>();

/** The precomputed magma image of a matrix (frames wide, bins high), built once and shared. */
function imageFor(matrix: SpectrogramMatrix): OffscreenLike | null {
  const cached = IMAGES.get(matrix);
  if (cached) return cached;
  const { width, height, data } = matrixToImageData(matrix);
  let canvas: OffscreenLike;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d') as Context2D | null;
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  IMAGES.set(matrix, canvas);
  return canvas;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

function formatKhz(hz: number): string {
  return String(Number((hz / 1000).toFixed(2)));
}

function formatDuration(seconds: number): string {
  return String(Number(seconds.toFixed(1)));
}

function formatClock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The caption: the parameters actually used (taken from the matrix when there is one). */
export function spectrogramCaption(caption: SpectrogramCaption, variant: SpectrogramVariant, matrix?: SpectrogramMatrix): string {
  const [date, time = ''] = caption.recordedAt.split('T');
  const duration = matrix ? matrix.durationSeconds : caption.durationS;
  const sampleRate = matrix ? matrix.sampleRate : caption.sampleRateHz;
  const fftSize = matrix ? matrix.fftSize : caption.fftSize;
  const range = `${formatDb(SPECTROGRAM_SPEC.dbMin)} to ${formatDb(SPECTROGRAM_SPEC.dbMax)} dB`;
  const text =
    `${caption.siteId}, ${caption.dataset}, recorded ${date} ${time.slice(0, 5)} on the recorder clock (timezone unverified). ` +
    `${formatDuration(duration)} s, 0 to ${formatKhz(sampleRate / 2)} kHz, ${fftSize}-point windows, ` +
    `level in dB re full scale, uncalibrated, shared range ${range}.`;
  return variant === 'hero' ? `${text} Brighter is louder. Levels are relative, not calibrated sound pressure.` : text;
}

/** "{t} s · {f} kHz · {dB} dB" for the cell at a time and frequency, read from the matrix. */
function readoutText(matrix: SpectrogramMatrix, seconds: number, hz: number): string {
  const frame = clamp(Math.floor(seconds / matrix.hopSeconds), 0, matrix.frames - 1);
  const bin = clamp(Math.round((hz * matrix.fftSize) / matrix.sampleRate), 0, matrix.bins - 1);
  const level = Math.round(dbAt(matrix, frame, bin));
  return `${seconds.toFixed(1)} s · ${(hz / 1000).toFixed(1)} kHz · ${formatDb(level)} dB`;
}

function StateBlock({ variant, state, className }: { variant: SpectrogramVariant; state: SpectrogramState; className?: string }) {
  const copy = STATE_COPY[state];
  const loading = state === 'loading';
  return (
    <div
      data-spectrogram-state={state}
      role={state === 'empty' ? undefined : 'status'}
      className={clsx(
        'flex flex-col justify-center gap-1 p-4',
        loading ? 'items-center bg-well-raised text-center' : 'bg-well text-start',
        variant === 'hero' ? '' : 'rounded-surface',
        WELL_HEIGHT[variant],
        className,
      )}
    >
      <p className="text-small text-well-ink">{copy.title}</p>
      {copy.body ? <p className="text-small text-well-muted">{copy.body}</p> : null}
    </div>
  );
}

interface AxisProps {
  duration: number;
  tone: string;
  /** Keeps the first and last label off the very edge of a full-bleed image. */
  inset?: boolean;
}

/**
 * Time labels along the image. Every second label (index 1, 3, ...) is hidden below 640 px so five
 * second labels never collide on a phone; they stay in the DOM. The track is moved by transform in
 * scroll mode, so the labels pan with the image.
 */
function TimeAxis({ duration, tone, inset = false, trackRef, className }: AxisProps & { trackRef: Ref<HTMLDivElement>; className: string }) {
  const ticks = timeTicks(duration);
  return (
    <div data-axis="time" className={clsx('relative overflow-hidden', className)}>
      <div ref={trackRef} className="relative h-full" style={{ width: '100%' }}>
        {ticks.map((seconds, index) => (
          <span
            key={seconds}
            data-tick=""
            className={clsx('absolute top-0 whitespace-nowrap font-data text-eyebrow leading-5', index % 2 === 1 && 'max-sm:hidden', tone)}
            style={{
              left: `${(seconds / duration) * 100}%`,
              transform: `translateX(${
                index === 0 ? (inset ? '4px' : '0%') : index === ticks.length - 1 && seconds === duration ? (inset ? 'calc(-100% - 4px)' : '-100%') : '-50%'
              })`,
            }}
          >
            {formatClock(seconds)}
          </span>
        ))}
      </div>
    </div>
  );
}

function FrequencyAxis({ nyquist }: { nyquist: number }) {
  const ticks = frequencyTicks(nyquist);
  return (
    <div data-axis="frequency" className="relative w-12 text-end">
      {ticks.map((hz, index) => {
        const last = index === ticks.length - 1;
        const edge = hz === 0 ? '0%' : last ? '100%' : '50%';
        return (
          <span
            key={hz}
            data-tick=""
            className="absolute end-0 whitespace-nowrap font-data text-eyebrow leading-none text-well-muted"
            style={{ bottom: `${(hz / nyquist) * 100}%`, transform: `translateY(${edge})` }}
          >
            {last ? `${formatKhz(hz)} kHz` : formatKhz(hz)}
          </span>
        );
      })}
    </div>
  );
}

function Chip({ children, style }: { children: ReactNode; style: CSSProperties }) {
  return (
    <span
      data-chip=""
      className="pointer-events-none absolute start-2 whitespace-nowrap rounded-control bg-well-raised px-1.5 font-data text-eyebrow leading-5 text-well-ink"
      style={style}
    >
      {children}
    </span>
  );
}

export function Spectrogram({
  source,
  variant,
  playheadSeconds,
  playMode = 'sweep',
  visibleSeconds,
  selectedWindow,
  bands,
  description,
  caption,
  state,
  forcePointer,
  dimmed,
  onReady,
  onScrub,
  className,
  ref,
}: SpectrogramProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const timeTrackRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<{ matrix: SpectrogramMatrix; image: OffscreenLike } | null>(null);
  const sizeRef = useRef<{ width: number; height: number } | null>(null);
  const secondsRef = useRef<number>(playheadSeconds ?? 0);
  const rectRef = useRef<SourceRect | null>(null);
  const draggingRef = useRef(false);
  const readyForRef = useRef<SpectrogramMatrix | null>(null);
  const onReadyRef = useRef(onReady);
  const onScrubRef = useRef(onScrub);

  const [unsupported, setUnsupported] = useState(false);
  const [readyFor, setReadyFor] = useState<SpectrogramMatrix | null>(null);
  const [pointer, setPointer] = useState<{ seconds: number; hz: number } | null>(null);

  const reduced = useReducedMotion(wrapperRef);
  const mode: PlayMode = reduced ? 'sweep' : playMode;
  const duration = source?.durationSeconds ?? 0;
  const visible = mode === 'scroll' ? Math.min(visibleSeconds ?? duration, duration) : duration;
  const nyquist = source ? source.sampleRate / 2 : 0;

  const summaryId = useId();
  const captionId = useId();

  useEffect(() => {
    onReadyRef.current = onReady;
    onScrubRef.current = onScrub;
  });

  /** Draws the visible part of the precomputed image onto the canvas, scaled to the backing store. */
  const paint = useCallback(
    (rect: SourceRect) => {
      const canvas = canvasRef.current;
      if (!canvas || !source) return;
      let entry = imageRef.current;
      if (!entry || entry.matrix !== source) {
        const built = imageFor(source);
        if (!built) {
          setUnsupported(true);
          return;
        }
        entry = { matrix: source, image: built };
        imageRef.current = entry;
      }
      const image = entry.image;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, rect.x, 0, rect.width, source.bins, 0, 0, canvas.width, canvas.height);
      if (readyForRef.current !== source) {
        readyForRef.current = source;
        setReadyFor(source);
        onReadyRef.current?.();
      }
    },
    [source],
  );

  /**
   * Places everything that depends on the time: the playhead, the selected window, the time labels
   * and, in scroll mode (or when `repaint` is set), the image. Called from the handle, the playhead
   * prop and the resize path; it never renders React.
   */
  const apply = useCallback(
    (seconds: number | undefined, repaint: boolean) => {
      const at = seconds ?? secondsRef.current;
      secondsRef.current = at;
      const size = sizeRef.current;
      if (!source || !size) return;

      const scrolling = mode === 'scroll' && visible < duration;
      const rect: SourceRect = scrolling
        ? scrollSourceRect(source.frames, source.hopSeconds, at, visible)
        : { x: 0, width: source.frames, playheadFraction: duration > 0 ? clamp(at / duration, 0, 1) : 0 };
      rectRef.current = rect;
      if (repaint || scrolling) paint(rect);

      const playhead = playheadRef.current;
      if (playhead && Number.isFinite(at)) {
        playhead.style.transform = `translateX(${round2(rect.playheadFraction * size.width - PLAYHEAD_WIDTH / 2)}px)`;
        playhead.style.visibility = 'visible';
      }

      const viewStart = rect.x * source.hopSeconds;
      const viewSpan = scrolling ? rect.width * source.hopSeconds : duration;
      const windowEl = windowRef.current;
      if (windowEl && selectedWindow !== undefined && viewSpan > 0) {
        const start = selectedWindow * WINDOW_SECONDS;
        const end = Math.min(start + WINDOW_SECONDS, duration);
        const from = scrolling ? viewStart : 0;
        windowEl.style.left = `${round2(((start - from) / viewSpan) * size.width)}px`;
        windowEl.style.width = `${round2(((end - start) / viewSpan) * size.width)}px`;
      }

      const track = timeTrackRef.current;
      if (track && duration > 0) {
        track.style.width = scrolling ? `${(duration / viewSpan) * 100}%` : '100%';
        track.style.transform = scrolling ? `translateX(-${(viewStart / duration) * 100}%)` : 'none';
      }
    },
    [source, mode, visible, duration, selectedWindow, paint],
  );

  useImperativeHandle(ref, () => ({ setPlayhead: (seconds: number) => apply(seconds, false) }), [apply]);

  // Follow the plot size: size the backing store once per resize and redraw from the precomputed
  // image (built on the first paint of a matrix). A new matrix, mode or variant re-observes, which repaints.
  useEffect(() => {
    const plot = plotRef.current;
    const canvas = canvasRef.current;
    if (!plot || !canvas || !source || state) return;

    const measure = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const store = backingStoreSize(width, height, window.devicePixelRatio);
      if (canvas.width !== store.width) canvas.width = store.width;
      if (canvas.height !== store.height) canvas.height = store.height;
      if (!canvas.getContext('2d')) {
        setUnsupported(true);
        return;
      }
      sizeRef.current = { width, height };
      apply(undefined, true);
    };

    if (typeof ResizeObserver === 'undefined') {
      const rect = plot.getBoundingClientRect();
      measure(rect.width, rect.height);
      const onResize = () => {
        const next = plot.getBoundingClientRect();
        measure(next.width, next.height);
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) measure(rect.width, rect.height);
    });
    observer.observe(plot);
    // A browser zoom or a move to another display changes devicePixelRatio without resizing the box.
    const onWindowResize = () => {
      const rect = plot.getBoundingClientRect();
      measure(rect.width, rect.height);
    };
    window.addEventListener('resize', onWindowResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, [source, state, variant, apply]);

  // The playhead prop: a position change (sweep) or a pan (scroll); a sweep never repaints.
  useEffect(() => {
    if (playheadSeconds !== undefined) apply(playheadSeconds, false);
  }, [playheadSeconds, apply]);

  const pointerCell = (event: ReactPointerEvent<HTMLDivElement>): { seconds: number; hz: number } | null => {
    const plot = plotRef.current;
    const rect = plot?.getBoundingClientRect();
    if (!source || !rect || rect.width <= 0 || rect.height <= 0) return null;
    const fx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const fy = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const view = rectRef.current;
    const scrolling = mode === 'scroll' && visible < duration && view !== null;
    const seconds = scrolling ? (view.x + fx * view.width) * source.hopSeconds : fx * duration;
    return { seconds, hz: (1 - fy) * nyquist };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const cell = pointerCell(event);
    if (!cell) return;
    setPointer(cell);
    if (draggingRef.current) onScrubRef.current?.(cell.seconds);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onScrubRef.current || event.button !== 0) return;
    const cell = pointerCell(event);
    if (!cell) return;
    draggingRef.current = true;
    if (typeof event.currentTarget.setPointerCapture === 'function' && event.pointerId !== undefined) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    onScrubRef.current(cell.seconds);
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (typeof event.currentTarget.releasePointerCapture === 'function' && event.pointerId !== undefined) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* the capture was already released */
      }
    }
  };

  const shownState: SpectrogramState | null = state ?? (unsupported ? 'unsupported' : source ? null : 'empty');
  if (shownState || !source) {
    return <StateBlock variant={variant} state={shownState ?? 'empty'} className={className} />;
  }

  const ready = readyFor === source;
  const hero = variant === 'hero';
  const nyquistLabel = formatKhz(nyquist);
  const captionText = caption ? spectrogramCaption(caption, variant, source) : null;
  const label = `Spectrogram${caption ? ` of ${caption.siteId}` : ''}, 0 to ${nyquistLabel} kHz, ${formatDuration(source.durationSeconds)} seconds`;
  const readout = pointer ?? forcePointer ?? null;
  const captionTone = hero ? 'text-on-band-muted' : 'text-muted';
  const edges = bands
    ? [...new Set(bands.flatMap((band) => [band.lowHz, band.highHz]))].filter((hz) => hz > 0 && hz < nyquist)
    : [];

  const plot = (
    <div
      ref={plotRef}
      data-plot=""
      className={clsx(
        'min-h-0 min-w-0 overflow-hidden',
        variant === 'panel' ? 'relative' : 'absolute inset-0',
        variant === 'compare' || variant === 'thumb' ? 'rounded-surface' : '',
        onScrub ? 'cursor-crosshair touch-pan-y' : 'cursor-crosshair',
      )}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!draggingRef.current) setPointer(null);
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute inset-0 block h-full w-full"
        style={dimmed === undefined ? undefined : { opacity: dimmed }}
      />
      {edges.map((hz) => (
        <div
          key={hz}
          data-band-edge=""
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-well-rule"
          style={{ bottom: `${(hz / nyquist) * 100}%` }}
        />
      ))}
      {bands?.map((band) => (
        <span
          key={band.id}
          data-band-label=""
          className="pointer-events-none absolute end-2 whitespace-nowrap rounded-control bg-well-raised px-1.5 font-data text-eyebrow leading-5 text-well-ink"
          style={{ bottom: `${(((band.lowHz + band.highHz) / 2) / nyquist) * 100}%`, transform: 'translateY(50%)' }}
        >
          {band.label}
        </span>
      ))}
      {selectedWindow !== undefined ? (
        <div
          ref={windowRef}
          data-selected-window=""
          className="pointer-events-none absolute inset-y-0 border border-well-ink bg-playhead/12"
          style={{ left: 0, width: 0 }}
        />
      ) : null}
      <div
        ref={playheadRef}
        data-playhead=""
        className="pointer-events-none absolute inset-y-0 start-0 w-[4px] border-x border-well bg-playhead"
        style={{ visibility: playheadSeconds === undefined ? 'hidden' : 'visible', transform: 'translateX(-2px)' }}
      />
      {hero || variant === 'compare' ? (
        <>
          <Chip style={{ top: 8 }}>{`${nyquistLabel} kHz`}</Chip>
          {hero ? <Chip style={{ top: '50%', transform: 'translateY(-50%)' }}>{`${formatKhz(nyquist / 2)} kHz`}</Chip> : null}
          <Chip style={{ bottom: 8 }}>0</Chip>
        </>
      ) : null}
      {readout ? (
        <span
          data-readout=""
          className={clsx(
            'pointer-events-none absolute top-2 rounded-control bg-well-raised px-1.5 font-data text-eyebrow leading-5 text-well-ink',
            hero || variant === 'compare' ? 'start-20' : 'start-2',
          )}
        >
          {readoutText(source, readout.seconds, readout.hz)}
        </span>
      ) : null}
    </div>
  );

  const phoneBar = <ColourBar orientation="horizontal" labels="all" tone="surface" length="fill" className="mt-2 sm:hidden" />;

  return (
    <div
      ref={wrapperRef}
      data-spectrogram=""
      data-variant={variant}
      data-ready={ready ? 'true' : 'false'}
      data-play-mode={mode}
      role="img"
      aria-label={label}
      aria-describedby={captionText ? `${captionId} ${summaryId}` : summaryId}
      className={clsx('w-full min-w-0', className)}
    >
      {variant === 'panel' ? (
        <div
          data-well=""
          className={clsx(
            'grid gap-x-2 gap-y-1 rounded-surface bg-well p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-4',
            'grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]',
            WELL_HEIGHT.panel,
          )}
        >
          <FrequencyAxis nyquist={nyquist} />
          {plot}
          <div className="hidden self-stretch sm:flex">
            <ColourBar orientation="vertical" labels="all" tone="well" />
          </div>
          <div aria-hidden="true" />
          <TimeAxis duration={duration} tone="text-well-muted" trackRef={timeTrackRef} className="h-5" />
        </div>
      ) : (
        <div
          data-well=""
          className={clsx('relative bg-well', variant === 'hero' ? '' : 'rounded-surface', WELL_HEIGHT[variant])}
        >
          {plot}
        </div>
      )}

      {hero ? (
        <>
          <TimeAxis duration={duration} tone="text-on-band-muted" inset trackRef={timeTrackRef} className="mt-1 h-6" />
          <div className="px-(--gutter)">
            <ColourBar orientation="horizontal" labels="ends" tone="band" className="mt-2" />
          </div>
        </>
      ) : null}
      {variant === 'panel' ? phoneBar : null}

      {captionText ? (
        <p
          id={captionId}
          data-caption=""
          className={clsx(variant === 'thumb' ? 'sr-only' : clsx('mt-2 text-small', captionTone, hero && 'px-(--gutter)'))}
        >
          {captionText}
        </p>
      ) : null}
      <p id={summaryId} className="sr-only">
        {description}
      </p>
    </div>
  );
}
