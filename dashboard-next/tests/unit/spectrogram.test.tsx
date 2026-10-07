/**
 * Spectrogram well, ColourBar and Waveform (04-13, DS-03). Real data only: the matrix is computed
 * from the committed ind_H1 excerpt. jsdom has no canvas, so getContext is stubbed with a per-canvas
 * 2D mock (null in the unsupported case) and ResizeObserver reports a fixed plot size. Canvas
 * painting happens on the next frame in a browser, so every assertion about drawn state waits for
 * data-ready first.
 */
import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ColourBar,
  SPECTROGRAM_SPEC,
  Spectrogram,
  Waveform,
  computeSpectrogram,
  dbAt,
  parseWavPcm16,
  waveformEnvelope,
  type SpectrogramHandle,
  type SpectrogramMatrix,
} from '@/features/instrument';
import { JS_TOKEN_KEYS } from '@/features/ui';
import { getExcerpt } from '@/lib/audio-manifest';
import { readClipBuffer } from './support/clips';

const EXCERPT = getExcerpt('ind_H1_20220830_120000');
const MINUS = '−';

let matrix: SpectrogramMatrix;
let samples: Float32Array;

beforeAll(() => {
  const wav = parseWavPcm16(readClipBuffer('ind_H1_20220830_120000'));
  samples = wav.samples;
  matrix = computeSpectrogram(wav.samples, wav.sampleRate);
});

// ---- canvas, ResizeObserver and devicePixelRatio stubs -------------------------------------

type Ctx2D = {
  drawImage: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  createImageData: (w: number, h: number) => { data: Uint8ClampedArray; width: number; height: number };
  putImageData: ReturnType<typeof vi.fn>;
  fillStyle: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
};

const contexts = new WeakMap<HTMLCanvasElement, Ctx2D>();
let contextAvailable = true;
let plotSize = { width: 600, height: 188 };
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalRO = globalThis.ResizeObserver;
const originalDpr = window.devicePixelRatio;

function ctxOf(canvas: HTMLCanvasElement): Ctx2D {
  const ctx = contexts.get(canvas);
  if (!ctx) throw new Error('canvas has no 2d context');
  return ctx;
}

class StubResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: plotSize.width, height: plotSize.height } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  contextAvailable = true;
  plotSize = { width: 600, height: 188 };
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
    if (!contextAvailable) return null;
    let ctx = contexts.get(this);
    if (!ctx) {
      ctx = {
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData: vi.fn(),
        fillStyle: '',
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'low',
      };
      contexts.set(this, ctx);
    }
    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  globalThis.ResizeObserver = originalRO;
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: originalDpr });
});

// jsdom has no PointerEvent: a MouseEvent subclass carries clientX and clientY.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {}
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventPolyfill });
}

/** A stand-in instrument surface that carries every JS token inline (jsdom does not process tokens.css). */
function Surface({ children, reduced = false }: { children: React.ReactNode; reduced?: boolean }) {
  const style: Record<string, string> = {};
  JS_TOKEN_KEYS.forEach((key, index) => {
    style[`--dir-${key}`] = `#${(index + 16).toString(16).padStart(2, '0').repeat(3)}`;
  });
  return (
    <div data-surface="instrument" data-reduced-motion={reduced ? 'true' : undefined} style={style}>
      {children}
    </div>
  );
}

const CAPTION = {
  siteId: 'ind_H1',
  dataset: 'MARRS',
  recordedAt: EXCERPT.recorded_at_recorder_clock,
  durationS: EXCERPT.duration_s,
  sampleRateHz: EXCERPT.sample_rate_hz,
  fftSize: SPECTROGRAM_SPEC.fftSize,
};
const DESCRIPTION = `30 s excerpt at 16 kHz, RMS level ${MINUS}60.93 dBFS (from the audio manifest).`;
const CAPTION_TEXT = `ind_H1, MARRS, recorded 2022-08-30 12:00 on the recorder clock (timezone unverified). 30 s, 0 to 8 kHz, 1024-point windows, level in dB re full scale, uncalibrated, shared range ${MINUS}120 to ${MINUS}50 dB.`;

function renderWell(props: Partial<React.ComponentProps<typeof Spectrogram>> = {}, reduced = false) {
  const view = render(
    <Surface reduced={reduced}>
      <Spectrogram source={matrix} variant="panel" description={DESCRIPTION} caption={CAPTION} {...props} />
    </Surface>,
  );
  const wrapper = () => view.container.querySelector('[data-spectrogram]') as HTMLElement;
  return { ...view, wrapper };
}

async function ready(wrapper: () => HTMLElement) {
  await waitFor(() => expect(wrapper()).toHaveAttribute('data-ready', 'true'));
}

const plotOf = (wrapper: HTMLElement) => wrapper.querySelector('[data-plot]') as HTMLElement;
const canvasOf = (wrapper: HTMLElement) => wrapper.querySelector('canvas') as HTMLCanvasElement;

describe('Spectrogram: name, caption and summary', () => {
  it('is an image named for the site, its frequency range and duration, described by the caption', async () => {
    const { wrapper } = renderWell();
    await ready(wrapper);
    const el = wrapper();
    expect(el).toHaveAttribute('role', 'img');
    expect(el).toHaveAttribute('aria-label', 'Spectrogram of ind_H1, 0 to 8 kHz, 30 seconds');
    const describedBy = (el.getAttribute('aria-describedby') ?? '').split(' ');
    const caption = document.getElementById(describedBy[0]) as HTMLElement;
    expect(caption.textContent).toBe(CAPTION_TEXT);
  });

  it('keeps the metadata-only description in a hidden summary the image is also described by', async () => {
    const { wrapper } = renderWell();
    await ready(wrapper);
    const ids = (wrapper().getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    const summary = document.getElementById(ids[1]) as HTMLElement;
    expect(summary.textContent).toBe(DESCRIPTION);
    expect(summary.className).toContain('sr-only');
  });

  it('adds the brighter-is-louder note to the hero caption only', async () => {
    const hero = renderWell({ variant: 'hero' });
    await ready(hero.wrapper);
    expect(hero.container.querySelector('[data-caption]')?.textContent).toBe(
      `${CAPTION_TEXT} Brighter is louder. Levels are relative, not calibrated sound pressure.`,
    );
    hero.unmount();
    const panel = renderWell({ variant: 'panel' });
    await ready(panel.wrapper);
    expect(panel.container.querySelector('[data-caption]')?.textContent).not.toContain('Brighter is louder');
  });

  it('prints the parameters actually used from the matrix and the spec, with U+2212 minus signs', async () => {
    const { wrapper } = renderWell();
    await ready(wrapper);
    const text = wrapper().querySelector('[data-caption]')?.textContent ?? '';
    expect(text).toContain(`${matrix.fftSize}-point windows`);
    expect(text).toContain(`${MINUS}${Math.abs(SPECTROGRAM_SPEC.dbMin)} to ${MINUS}${Math.abs(SPECTROGRAM_SPEC.dbMax)} dB`);
    // The recorded date legitimately has hyphens; the levels must not.
    expect(text.slice(text.indexOf('shared range'))).not.toContain('-');
    expect(text).toContain('uncalibrated');
  });

  it('never says anything about health, species or behaviour', async () => {
    const { wrapper } = renderWell({ variant: 'hero' });
    await ready(wrapper);
    expect((wrapper().textContent ?? '').toLowerCase()).not.toMatch(/health|species|behaviour|behavior|fish|coral|degrad|restor/);
  });
});

describe('Spectrogram: canvas', () => {
  it('draws once at devicePixelRatio times the plot size and then marks itself ready', async () => {
    const onReady = vi.fn();
    const { wrapper } = renderWell({ onReady });
    await ready(wrapper);
    const canvas = canvasOf(wrapper());
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(376);
    expect(ctxOf(canvas).drawImage).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('caps an enormous plot size in the backing store', async () => {
    plotSize = { width: 6000, height: 400 };
    const { wrapper } = renderWell({ variant: 'hero' });
    await ready(wrapper);
    const canvas = canvasOf(wrapper());
    expect(canvas.width).toBeLessThanOrEqual(8192);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(8192 * 2048);
  });

  it('paints the precomputed image: every frame and bin as the source, scaled once to the canvas', async () => {
    const { wrapper } = renderWell();
    await ready(wrapper);
    const calls = ctxOf(canvasOf(wrapper())).drawImage.mock.calls;
    // (image, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(calls[0].slice(1)).toEqual([0, 0, matrix.frames, matrix.bins, 0, 0, 1200, 376]);
  });

  it('draws a clip with more frames than the image cap from a decimated image, over the whole clip (B WR-08)', async () => {
    const frames = 20000;
    const long: SpectrogramMatrix = {
      ...matrix,
      frames,
      data: new Uint8Array(frames * matrix.bins),
      durationSeconds: frames * matrix.hopSeconds,
    };
    const { wrapper, container } = renderWell({ source: long });
    await ready(wrapper);
    const calls = ctxOf(canvasOf(wrapper())).drawImage.mock.calls;
    expect((calls[0][0] as HTMLCanvasElement).width).toBe(8192);
    expect(calls[0].slice(1)).toEqual([0, 0, 8192, long.bins, 0, 0, 1200, 376]);
    expect(container.querySelector('[data-spectrogram-state]')).toBeNull();
  });

  it('pans a long clip in scroll mode by image columns, not frames (B WR-08)', async () => {
    const frames = 20000;
    const long: SpectrogramMatrix = {
      ...matrix,
      frames,
      data: new Uint8Array(frames * matrix.bins),
      durationSeconds: frames * matrix.hopSeconds,
    };
    const handle = createRef<SpectrogramHandle>();
    const { wrapper } = renderWell({ source: long, ref: handle, playMode: 'scroll', visibleSeconds: long.durationSeconds / 4 });
    await ready(wrapper);
    const draw = ctxOf(canvasOf(wrapper())).drawImage;
    act(() => handle.current?.setPlayhead(long.durationSeconds / 2));
    const last = draw.mock.calls.at(-1) as unknown[];
    // A quarter of the clip is 5000 frames, which is 2048 of the 8192 image columns.
    expect(last[3]).toBeCloseTo(2048, 3);
    expect(last[1] as number).toBeGreaterThan(0);
    expect((last[1] as number) + (last[3] as number)).toBeLessThanOrEqual(8192 + 1e-6);
  });

  it('does not repaint when the playhead moves in sweep mode', async () => {
    const handle = createRef<SpectrogramHandle>();
    const { wrapper, rerender } = renderWell({ ref: handle, playheadSeconds: 3 });
    await ready(wrapper);
    const draw = ctxOf(canvasOf(wrapper())).drawImage;
    expect(draw).toHaveBeenCalledTimes(1);
    act(() => handle.current?.setPlayhead(10));
    act(() => handle.current?.setPlayhead(11));
    rerender(
      <Surface>
        <Spectrogram ref={handle} source={matrix} variant="panel" description={DESCRIPTION} caption={CAPTION} playheadSeconds={12} />
      </Surface>,
    );
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('shows the unsupported state when the 2d context is not available', async () => {
    contextAvailable = false;
    const { wrapper, container } = renderWell();
    await waitFor(() => expect(container.querySelector('[data-spectrogram-state="unsupported"]')).not.toBeNull());
    expect(screen.getByText('This browser cannot draw the spectrogram.')).toBeInTheDocument();
    expect(wrapper()).toBeNull();
  });
});

describe('Spectrogram: axes by variant', () => {
  const ticksOf = (wrapper: HTMLElement, axis: string) =>
    Array.from(wrapper.querySelectorAll(`[data-axis="${axis}"] [data-tick]`)).map((node) => node.textContent);

  it('panel: 0 to 8 kHz every 2 kHz, time every 5 s, and a colourbar with all five levels', async () => {
    const { wrapper } = renderWell();
    await ready(wrapper);
    expect(ticksOf(wrapper(), 'frequency')).toEqual(['0', '2', '4', '6', '8 kHz']);
    expect(ticksOf(wrapper(), 'time')).toEqual(['0:00', '0:05', '0:10', '0:15', '0:20', '0:25', '0:30']);
    const bars = wrapper().querySelectorAll('[data-colourbar]');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of Array.from(bars)) {
      const labels = Array.from(bar.querySelectorAll('[data-tick]')).map((node) => node.textContent);
      expect(labels).toEqual(['−120', '−100', '−80', '−60', '−50'].filter((_, i) => bar.getAttribute('data-labels') === 'all' || i === 0 || i === 4));
    }
  });

  it('hero: three chips (8 kHz, 4 kHz, 0), a time strip, and a horizontal colourbar with end labels only', async () => {
    const { wrapper } = renderWell({ variant: 'hero' });
    await ready(wrapper);
    const chips = Array.from(wrapper().querySelectorAll('[data-chip]')).map((node) => node.textContent);
    expect(chips).toEqual(['8 kHz', '4 kHz', '0']);
    expect(ticksOf(wrapper(), 'time').length).toBeGreaterThan(0);
    const bar = wrapper().querySelector('[data-colourbar]') as HTMLElement;
    expect(bar).toHaveAttribute('data-orientation', 'horizontal');
    expect(bar).toHaveAttribute('data-labels', 'ends');
    expect(Array.from(bar.querySelectorAll('[data-tick]')).map((node) => node.textContent)).toEqual(['−120', '−50']);
  });

  it('compare: chips at the top and bottom only', async () => {
    const { wrapper } = renderWell({ variant: 'compare' });
    await ready(wrapper);
    expect(Array.from(wrapper().querySelectorAll('[data-chip]')).map((node) => node.textContent)).toEqual(['8 kHz', '0']);
    expect(wrapper().querySelector('[data-colourbar]')).toBeNull();
  });

  it('thumb: no axes, no chips, no colourbar, and a hidden caption', async () => {
    const { wrapper } = renderWell({ variant: 'thumb' });
    await ready(wrapper);
    expect(wrapper().querySelector('[data-axis]')).toBeNull();
    expect(wrapper().querySelector('[data-chip]')).toBeNull();
    expect(wrapper().querySelector('[data-colourbar]')).toBeNull();
    expect(wrapper().querySelector('[data-caption]')?.className).toContain('sr-only');
  });

  it('gives each variant its height from the UI-SPEC with tablet and phone steps', async () => {
    const expected: Record<string, string[]> = {
      panel: ['h-[160px]', 'sm:h-[220px]'],
      hero: ['h-[240px]', 'sm:h-[360px]', 'lg:h-[440px]'],
      compare: ['h-[160px]', 'sm:h-[200px]', 'lg:h-[230px]'],
      thumb: ['h-[150px]'],
    };
    for (const [variant, classes] of Object.entries(expected)) {
      const view = renderWell({ variant: variant as 'panel' });
      await ready(view.wrapper);
      const well = view.wrapper().querySelector('[data-well]') as HTMLElement;
      for (const cls of classes) expect(well.className, `${variant} ${cls}`).toContain(cls);
      expect(well.className).toContain('bg-well');
      view.unmount();
    }
  });
});

describe('Spectrogram: playhead, window, bands and readout', () => {
  it('moves the playhead by transform to the elapsed fraction of the width in sweep mode', async () => {
    const { wrapper } = renderWell({ playheadSeconds: 12 });
    await ready(wrapper);
    const playhead = wrapper().querySelector('[data-playhead]') as HTMLElement;
    // 12 s of 30 s on a 600 px plot is 240 px; the 4 px playhead is centred on it.
    expect(playhead.style.transform).toBe('translateX(238px)');
    expect(playhead.className).toContain('bg-playhead');
  });

  it('follows setPlayhead from the imperative handle without a React render', async () => {
    const handle = createRef<SpectrogramHandle>();
    const { wrapper } = renderWell({ ref: handle, playheadSeconds: 0 });
    await ready(wrapper);
    act(() => handle.current?.setPlayhead(15));
    expect((wrapper().querySelector('[data-playhead]') as HTMLElement).style.transform).toBe('translateX(298px)');
  });

  it('scroll mode holds the playhead at 22 % and repaints the image once per playhead update', async () => {
    const handle = createRef<SpectrogramHandle>();
    const { wrapper } = renderWell({ ref: handle, playMode: 'scroll', visibleSeconds: 10, playheadSeconds: 12.4 });
    await ready(wrapper);
    const draw = ctxOf(canvasOf(wrapper())).drawImage;
    const playhead = wrapper().querySelector('[data-playhead]') as HTMLElement;
    expect(playhead.style.transform).toBe('translateX(130px)');
    const first = draw.mock.calls.length;
    expect(first).toBeGreaterThanOrEqual(1);
    const last = draw.mock.calls[first - 1];
    // Source x is 22 % of 625 frames before 12.4 s, in frames of 0.016 s.
    expect(last[1]).toBeCloseTo(12.4 / matrix.hopSeconds - 0.22 * (10 / matrix.hopSeconds), 3);
    expect(last[3]).toBeCloseTo(10 / matrix.hopSeconds, 3);

    act(() => handle.current?.setPlayhead(13.4));
    expect(draw.mock.calls.length).toBe(first + 1);
    expect(playhead.style.transform).toBe('translateX(130px)');
    expect(wrapper()).toHaveAttribute('data-play-mode', 'scroll');
  });

  it('under reduced motion there is no scroll mode: it is a sweep and the image is not repainted', async () => {
    const handle = createRef<SpectrogramHandle>();
    const { wrapper } = renderWell({ ref: handle, playMode: 'scroll', visibleSeconds: 10, playheadSeconds: 12 }, true);
    await ready(wrapper);
    expect(wrapper()).toHaveAttribute('data-play-mode', 'sweep');
    const draw = ctxOf(canvasOf(wrapper())).drawImage;
    const before = draw.mock.calls.length;
    act(() => handle.current?.setPlayhead(20));
    expect(draw.mock.calls.length).toBe(before);
    expect((wrapper().querySelector('[data-playhead]') as HTMLElement).style.transform).toBe('translateX(398px)');
  });

  it('spans the selected 5 s window across its full height', async () => {
    const { wrapper } = renderWell({ selectedWindow: 2, playheadSeconds: 12.4 });
    await ready(wrapper);
    const selected = wrapper().querySelector('[data-selected-window]') as HTMLElement;
    // Window 2 is 10 s to 15 s of 30 s on a 600 px plot: 200 px from the left, 100 px wide.
    expect(selected.style.left).toBe('200px');
    expect(selected.style.width).toBe('100px');
    expect(selected.className).toContain('border-well-ink');
  });

  it('draws one dashed hairline per interior band edge and labels every band', async () => {
    const third = matrix.sampleRate / 2 / 3;
    const bands = [
      { id: 'a', label: 'Band A', lowHz: 0, highHz: third },
      { id: 'b', label: 'Band B', lowHz: third, highHz: 2 * third },
      { id: 'c', label: 'Band C', lowHz: 2 * third, highHz: matrix.sampleRate / 2 },
    ];
    const { wrapper } = renderWell({ bands });
    await ready(wrapper);
    expect(wrapper().querySelectorAll('[data-band-edge]')).toHaveLength(2);
    for (const edge of Array.from(wrapper().querySelectorAll('[data-band-edge]'))) expect(edge.className).toContain('border-dashed');
    expect(Array.from(wrapper().querySelectorAll('[data-band-label]')).map((node) => node.textContent)).toEqual(['Band A', 'Band B', 'Band C']);
  });

  it('shows the pointer readout of the cell under a forced pointer, read from the matrix', async () => {
    const { wrapper } = renderWell({ forcePointer: { seconds: 12.4, hz: 3200 } });
    await ready(wrapper);
    const frame = Math.min(matrix.frames - 1, Math.floor(12.4 / matrix.hopSeconds));
    const bin = Math.round((3200 * matrix.fftSize) / matrix.sampleRate);
    const level = Math.round(dbAt(matrix, frame, bin));
    const readout = wrapper().querySelector('[data-readout]') as HTMLElement;
    expect(readout.textContent).toBe(`12.4 s · 3.2 kHz · ${level < 0 ? MINUS : ''}${Math.abs(level)} dB`);
  });

  it('reads the cell under the real pointer and scrubs on a press and drag', async () => {
    const onScrub = vi.fn();
    const { wrapper } = renderWell({ onScrub });
    await ready(wrapper);
    const plot = plotOf(wrapper());
    plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 188, right: 600, bottom: 188, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerMove(plot, { clientX: 300, clientY: 94 });
    expect(wrapper().querySelector('[data-readout]')?.textContent).toMatch(/^15\.0 s · 4\.0 kHz · /);
    fireEvent.pointerDown(plot, { clientX: 150, clientY: 10, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(7.5);
    fireEvent.pointerMove(plot, { clientX: 450, clientY: 10, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(22.5);
    fireEvent.pointerUp(plot, { clientX: 450, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(plot, { clientX: 60, clientY: 10, pointerId: 1 });
    expect(onScrub).toHaveBeenCalledTimes(2);
    fireEvent.pointerLeave(plot);
    expect(wrapper().querySelector('[data-readout]')).toBeNull();
  });

  it('is not a tab stop and holds no focusable control', async () => {
    const { wrapper } = renderWell({ playheadSeconds: 5 });
    await ready(wrapper);
    expect(wrapper()).not.toHaveAttribute('tabindex');
    expect(wrapper().querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
  });
});

describe('Spectrogram: states', () => {
  const stateCopy: Array<[React.ComponentProps<typeof Spectrogram>['state'], string[]]> = [
    ['loading', ['Drawing spectrogram…']],
    ['empty', ['No recording selected', 'Choose a site or a clip to see its spectrogram.']],
    ['error', ['The spectrogram could not be drawn.', 'The audio and any readings are unaffected. Reload the page to try again.']],
    ['unsupported', ['This browser cannot draw the spectrogram.']],
  ];

  it.each(stateCopy)('%s keeps the well height, says what happened and draws no canvas', (state, lines) => {
    const { container } = renderWell({ state, variant: 'panel' });
    const block = container.querySelector(`[data-spectrogram-state="${state}"]`) as HTMLElement;
    expect(block).not.toBeNull();
    expect(block.className).toContain('h-[160px]');
    expect(block.className).toContain('sm:h-[220px]');
    for (const line of lines) expect(within(block).getByText(line)).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.querySelector('[data-spectrogram]')).toBeNull();
  });

  it('keeps the hero height in a state block too', () => {
    const { container } = renderWell({ state: 'loading', variant: 'hero' });
    const block = container.querySelector('[data-spectrogram-state="loading"]') as HTMLElement;
    for (const cls of ['h-[240px]', 'sm:h-[360px]', 'lg:h-[440px]']) expect(block.className).toContain(cls);
  });

  it('an absent source with no state reads as empty', () => {
    const { container } = render(
      <Surface>
        <Spectrogram variant="compare" description={DESCRIPTION} />
      </Surface>,
    );
    expect(container.querySelector('[data-spectrogram-state="empty"]')).not.toBeNull();
  });

  it('a matrix with no frames reads as the error state, never a NaN readout (B WR-02)', () => {
    const empty: SpectrogramMatrix = { ...matrix, frames: 0, durationSeconds: 0, data: new Uint8Array(0) };
    const { container } = renderWell({ source: empty, variant: 'panel' });
    expect(container.querySelector('[data-spectrogram-state="error"]')).not.toBeNull();
    expect(container.querySelector('canvas')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/NaN/);
  });

  it('loading and error are announced as status regions', () => {
    const loading = renderWell({ state: 'loading' });
    expect(loading.container.querySelector('[data-spectrogram-state="loading"]')).toHaveAttribute('role', 'status');
    loading.unmount();
    const error = renderWell({ state: 'error' });
    expect(error.container.querySelector('[data-spectrogram-state="error"]')).toHaveAttribute('role', 'status');
  });
});

describe('ColourBar', () => {
  it('prints the five levels with U+2212 minus signs, bright end at the top when vertical', () => {
    const { container } = render(<ColourBar orientation="vertical" labels="all" />);
    const bar = container.querySelector('[data-colourbar]') as HTMLElement;
    expect(bar).toHaveAttribute('data-orientation', 'vertical');
    expect(Array.from(bar.querySelectorAll('[data-tick]')).map((node) => node.textContent)).toEqual(['−120', '−100', '−80', '−60', '−50']);
    const strip = bar.querySelector('[data-strip]') as HTMLElement;
    expect(strip.style.backgroundImage).toMatch(/^linear-gradient\(to top, rgb\(0, 0, 4\) 0%/);
    expect(strip.style.backgroundImage).toContain('rgb(252, 253, 191) 100%');
  });

  it('runs the bright end to the right when horizontal and can show the end labels only', () => {
    const { container } = render(<ColourBar orientation="horizontal" labels="ends" length={220} />);
    const bar = container.querySelector('[data-colourbar]') as HTMLElement;
    expect((bar.querySelector('[data-strip]') as HTMLElement).style.backgroundImage).toMatch(/^linear-gradient\(to right, /);
    expect(Array.from(bar.querySelectorAll('[data-tick]')).map((node) => node.textContent)).toEqual(['−120', '−50']);
    expect(bar.style.width).toBe('220px');
  });

  it('places each tick by its level on the fixed range', () => {
    const { container } = render(<ColourBar orientation="horizontal" labels="all" />);
    const lefts = Array.from(container.querySelectorAll<HTMLElement>('[data-tick]')).map((node) => Number.parseFloat(node.style.left));
    const range = SPECTROGRAM_SPEC.dbMax - SPECTROGRAM_SPEC.dbMin;
    expect(lefts).toEqual([-120, -100, -80, -60, -50].map((db) => ((db - SPECTROGRAM_SPEC.dbMin) / range) * 100));
  });

  it('says the level is relative to full scale and uncalibrated when given its caption', () => {
    render(<ColourBar orientation="horizontal" labels="all" caption="Level, dB re full scale (uncalibrated; hydrophone sensitivity not applied)." />);
    expect(screen.getByText('Level, dB re full scale (uncalibrated; hydrophone sensitivity not applied).')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(/−120 to −50 dB re full scale, uncalibrated/);
  });
});

describe('Waveform', () => {
  it('is an image naming the duration and rate, with a hidden description', async () => {
    const { container } = render(
      <Surface>
        <Waveform samples={samples} sampleRate={16000} description={DESCRIPTION} />
      </Surface>,
    );
    const wrapper = container.querySelector('[data-waveform]') as HTMLElement;
    await waitFor(() => expect(wrapper).toHaveAttribute('data-ready', 'true'));
    expect(wrapper).toHaveAttribute('role', 'img');
    expect(wrapper.getAttribute('aria-label')).toBe('Waveform, 30 seconds at 16 kHz');
    expect(container.querySelector('.sr-only')?.textContent).toContain(DESCRIPTION);
  });

  it('draws one column per device pixel in the well-ink token at the dpr-scaled size', async () => {
    plotSize = { width: 600, height: 120 };
    const { container } = render(
      <Surface>
        <Waveform samples={samples} sampleRate={16000} description={DESCRIPTION} height={120} />
      </Surface>,
    );
    const wrapper = container.querySelector('[data-waveform]') as HTMLElement;
    await waitFor(() => expect(wrapper).toHaveAttribute('data-ready', 'true'));
    const canvas = wrapper.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(240);
    const ctx = ctxOf(canvas);
    expect(ctx.fillRect.mock.calls.length).toBeGreaterThanOrEqual(1200);
    // The last fill is a waveform column in the well-ink token (index 12 in JS_TOKEN_KEYS: 12 + 16 = 0x1c).
    expect(ctx.fillStyle).toBe('#1c1c1c');
  });
});

describe('waveformEnvelope', () => {
  it('takes the minimum and maximum of each column of samples', () => {
    // A test-only signal: a known ramp, never shipped.
    const ramp = Float32Array.from({ length: 8 }, (_, i) => (i - 3) / 10);
    const { min, max } = waveformEnvelope(ramp, 4);
    expect(Array.from(min).map((v) => Number(v.toFixed(2)))).toEqual([-0.3, -0.1, 0.1, 0.3]);
    expect(Array.from(max).map((v) => Number(v.toFixed(2)))).toEqual([-0.2, 0, 0.2, 0.4]);
  });

  it('returns a column for every request even when there are fewer samples than columns', () => {
    const { min, max } = waveformEnvelope(Float32Array.from([0.5, -0.5]), 5);
    expect(min).toHaveLength(5);
    expect(max).toHaveLength(5);
    expect(Math.max(...max)).toBe(0.5);
    expect(Math.min(...min)).toBe(-0.5);
  });

  it('is flat zero for an empty clip', () => {
    const { min, max } = waveformEnvelope(new Float32Array(0), 3);
    expect(Array.from(min)).toEqual([0, 0, 0]);
    expect(Array.from(max)).toEqual([0, 0, 0]);
  });
});
