/**
 * CompareRow and CompareDeck (04-16, DS-05, DS-06). Real data only: both matrices are computed from
 * the committed ind_H1 and ind_D1 excerpts and every label, level and time is read from the audio
 * manifest. jsdom has no canvas, so getContext is stubbed; the AudioContext is a recording stub (the
 * stub proves the gains the engine was given, not what is audible). Drawn state is waited for with
 * waitFor: the Slider, the clock and the canvas update on the next frame.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CompareDeck,
  CompareRow,
  SPECTROGRAM_SPEC,
  computeSpectrogram,
  levelLine,
  parseWavPcm16,
  recordedLine,
  type CompareRowData,
  type SpectrogramMatrix,
  type SpectrogramSpec,
  type TransportClip,
} from '@/features/instrument';
import { excerptIdentity } from '@/features/fixtures/parts/excerptIdentity';
import { getExcerpt } from '@/lib/audio-manifest';
import { readClipBuffer } from './support/clips';

const H1 = getExcerpt('ind_H1_20220830_120000');
const D1 = getExcerpt('ind_D1_20220830_120000');
const MINUS = '−';

let samplesH1: Float32Array;
let samplesD1: Float32Array;
let matrixH1: SpectrogramMatrix;
let matrixD1: SpectrogramMatrix;
let clips: TransportClip[];

beforeAll(() => {
  const bufferH1 = readClipBuffer(H1.excerpt_id);
  const bufferD1 = readClipBuffer(D1.excerpt_id);
  const wavH1 = parseWavPcm16(bufferH1);
  const wavD1 = parseWavPcm16(bufferD1);
  samplesH1 = wavH1.samples;
  samplesD1 = wavD1.samples;
  matrixH1 = computeSpectrogram(wavH1.samples, wavH1.sampleRate);
  matrixD1 = computeSpectrogram(wavD1.samples, wavD1.sampleRate);
  clips = [
    { id: H1.site_id, buffer: bufferH1, durationS: wavH1.samples.length / wavH1.sampleRate },
    { id: D1.site_id, buffer: bufferD1, durationS: wavD1.samples.length / wavD1.sampleRate },
  ];
});

// ---- stubs: canvas, ResizeObserver, AudioContext, matchMedia ---------------------------------

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalRO = globalThis.ResizeObserver;

class StubResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 600, height: 188 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

interface FakeGain {
  gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

let gainsCreated: FakeGain[] = [];
let sourcesStarted = 0;

function stubAudio() {
  gainsCreated = [];
  sourcesStarted = 0;
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    decodeAudioData: vi.fn(async () => ({ duration: 30 })),
    createBufferSource: () => ({
      buffer: null,
      onended: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(() => {
        sourcesStarted++;
      }),
      stop: vi.fn(),
    }),
    createGain: () => {
      const gain: FakeGain = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
      gainsCreated.push(gain);
      return gain;
    },
  };
  vi.stubGlobal('AudioContext', function AudioContextStub() {
    return ctx;
  });
}

function stubReduced(reduced: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

beforeEach(() => {
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'low',
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  stubAudio();
  stubReduced(false);
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  globalThis.ResizeObserver = originalRO;
  vi.unstubAllGlobals();
});

// ---- builders ---------------------------------------------------------------------------------

function rows(matrixB: SpectrogramMatrix = matrixD1): CompareRowData[] {
  return [
    { slot: 'A', identity: excerptIdentity(H1), matrix: matrixH1 },
    { slot: 'B', identity: excerptIdentity(D1), matrix: matrixB },
  ];
}

function deck(props: Partial<React.ComponentProps<typeof CompareDeck>> = {}) {
  return render(<CompareDeck rows={rows()} clips={clips} {...props} />);
}

const rowOf = (container: HTMLElement, slot: string) => container.querySelector(`[data-compare-row][data-slot="${slot}"]`) as HTMLElement;
const wellOpacityOf = (container: HTMLElement, slot: string) => (rowOf(container, slot).querySelector('canvas') as HTMLElement).style.opacity;
const mixSlider = () => screen.getByRole('slider', { name: 'Mix between A and B' });

describe('CompareDeck: one scale, one strip', () => {
  it('renders two compare wells, one horizontal 140 px colour bar and the shared caption', () => {
    const { container } = deck();
    expect(container.querySelectorAll('[data-spectrogram][data-variant="compare"]')).toHaveLength(2);
    const bars = container.querySelectorAll('[data-colourbar]');
    expect(bars).toHaveLength(1);
    expect(bars[0].getAttribute('data-orientation')).toBe('horizontal');
    expect((bars[0] as HTMLElement).style.width).toBe('140px');
    expect(screen.getByText(`One colour scale for both wells: ${MINUS}120 to ${MINUS}50 dB re full scale, uncalibrated.`)).toBeInTheDocument();
    expect(container.querySelector('[data-compare-deck]')?.getAttribute('data-scale')).toBe('shared');
  });

  it('puts the shared strip between row A and row B', () => {
    const { container } = deck();
    const order = Array.from(container.querySelectorAll('[data-compare-row], [data-compare-strip]')).map((el) => el.getAttribute('data-slot') ?? 'strip');
    expect(order).toEqual(['A', 'strip', 'B']);
  });

  it('shows the different-scales state, and no wells, when the analysis settings differ', () => {
    const coarse = computeSpectrogram(samplesD1, D1.sample_rate_hz, { ...SPECTROGRAM_SPEC, hop: 512 } as unknown as SpectrogramSpec);
    const { container } = deck({ rows: rows(coarse) });
    expect(screen.getByText('These recordings use different analysis settings, so they cannot share one colour scale.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-spectrogram]')).toHaveLength(0);
    expect(container.querySelector('[data-compare-deck]')?.getAttribute('data-scale')).toBe('different');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play both' })).toBeNull();
  });

  it('disables the audio and says why when the recordings are different lengths, and rescales nothing', () => {
    const shorter = computeSpectrogram(samplesD1.slice(0, 16000 * 20), D1.sample_rate_hz);
    const { container } = deck({ rows: rows(shorter) });
    expect(container.querySelectorAll('[data-spectrogram]')).toHaveLength(2);
    expect(screen.getByText(/different lengths, so they cannot be played together/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play both' })).toBeDisabled();
    expect(mixSlider()).toBeDisabled();
  });
});

describe('CompareDeck: rows', () => {
  it('shows the slot, site id, mark and label, definition, assigner, recorder-clock time and level line per row', () => {
    const { container } = deck();
    const a = within(rowOf(container, 'A'));
    expect(a.getByText('A')).toBeInTheDocument();
    expect(rowOf(container, 'A').querySelector('p.font-data')?.textContent).toBe('ind_H1');
    expect(a.getByText('Healthy (H)')).toBeInTheDocument();
    expect(rowOf(container, 'A').querySelector('svg[data-status="healthy"]')).not.toBeNull();
    expect(a.getByText(`“${H1.label?.label_definition}”`)).toBeInTheDocument();
    expect(a.getByText(`Assigned by ${H1.label?.label_assigned_by}`)).toBeInTheDocument();
    expect(a.getByText('2022-08-30 12:00 on the recorder clock, timezone unverified')).toBeInTheDocument();
    expect(a.getByText(`Level matched: ${MINUS}60.9 dB RMS, gain 0.0 dB`)).toBeInTheDocument();

    const b = within(rowOf(container, 'B'));
    expect(rowOf(container, 'B').querySelector('p.font-data')?.textContent).toBe('ind_D1');
    expect(b.getByText('Degraded (D)')).toBeInTheDocument();
    expect(rowOf(container, 'B').querySelector('svg[data-status="degraded"]')).not.toBeNull();
    expect(b.getByText(`Level matched: ${MINUS}55.8 dB RMS, gain ${MINUS}5.2 dB`)).toBeInTheDocument();
  });

  it('puts the reference label, its definition and its assigner inside a solid R-LABEL rule', () => {
    const { container } = deck();
    const rlabel = rowOf(container, 'A').querySelector('.border-s') as HTMLElement;
    expect(rlabel.className).toContain('border-solid');
    expect(within(rlabel).getByText('REFERENCE LABEL')).toBeInTheDocument();
    expect(within(rlabel).getByText('Healthy (H)')).toBeInTheDocument();
    expect(within(rlabel).getByText(/^Assigned by /)).toBeInTheDocument();
    expect(within(rlabel).getByText(/^“/)).toBeInTheDocument();
    expect(within(rlabel).queryByText('MODEL READING')).toBeNull();
  });

  it('breaks a long site id after each underscore without changing its text', () => {
    const { container } = deck();
    const id = rowOf(container, 'A').querySelector('p.font-data') as HTMLElement;
    expect(id.querySelectorAll('wbr')).toHaveLength(1);
    expect(id.textContent).toBe('ind_H1');
  });

  it('discloses that playback levels are matched and original levels differ', () => {
    deck();
    expect(
      screen.getByText(
        'Playback levels are matched to the same RMS level so clips can be compared at similar volume. Original recording levels differ and are not shown by loudness.',
      ),
    ).toBeInTheDocument();
  });

  it('says so, and does not claim a match, when a clip has no RMS in the manifest', () => {
    const noRms = rows();
    noRms[1] = { ...noRms[1], identity: { ...excerptIdentity(D1), rmsDbfs: undefined } };
    const { container } = deck({ rows: noRms });
    expect(within(rowOf(container, 'B')).getByText('Level not matched: no RMS level is recorded for this clip.')).toBeInTheDocument();
    expect(screen.getByText(/^Playback levels are not matched, because a recording has no RMS level/)).toBeInTheDocument();
    expect(screen.queryByText(/^Playback levels are matched to the same RMS level/)).toBeNull();
    expect(within(rowOf(container, 'A')).queryByText(/^Level matched/)).toBeNull();
  });

  it('describes each well from metadata only and names the dataset when a caption is given', () => {
    const withCaption: CompareRowData[] = rows().map((row) => ({
      ...row,
      caption: {
        siteId: row.identity?.siteId ?? '',
        dataset: 'MARRS',
        recordedAt: row.identity?.recordedAt ?? '',
        durationS: 30,
        sampleRateHz: 16000,
        fftSize: SPECTROGRAM_SPEC.fftSize,
      },
    }));
    const { container } = deck({ rows: withCaption });
    expect(screen.getByRole('img', { name: 'Spectrogram of ind_H1, 0 to 8 kHz, 30 seconds' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-caption]')).toHaveLength(2);
    expect(rowOf(container, 'A').querySelector('[data-caption]')?.textContent).toContain('MARRS');
    expect(rowOf(container, 'A').textContent).toContain('30 s excerpt at 16 kHz, RMS level');
  });
});

describe('CompareDeck: audio', () => {
  it('Play both becomes Pause both while playing, and both sources start together', async () => {
    const user = userEvent.setup();
    deck();
    await user.click(screen.getByRole('button', { name: 'Play both' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause both' })).toBeInTheDocument());
    expect(sourcesStarted).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Pause both' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play both' })).toBeInTheDocument());
  });

  it('plays at equal power at the middle and attenuates only the louder clip by its matched gain', async () => {
    const user = userEvent.setup();
    deck();
    await user.click(screen.getByRole('button', { name: 'Play both' }));
    await waitFor(() => expect(sourcesStarted).toBe(2));
    // Gains are created in clip order: A (ind_H1, the quieter) then B (ind_D1, 5.2 dB louder).
    const [gainA, gainB] = gainsCreated.map((entry) => entry.gain.value);
    expect(gainA).toBeCloseTo(Math.cos(Math.PI / 4), 4);
    expect(gainB / gainA).toBeCloseTo(10 ** (-5.2 / 20), 3);
    for (const value of [gainA, gainB]) expect(value).toBeLessThanOrEqual(1);
  });

  it('moving the crossfader changes the live gains with a smoothed ramp, and never above the original level', async () => {
    const user = userEvent.setup();
    deck();
    await user.click(screen.getByRole('button', { name: 'Play both' }));
    await waitFor(() => expect(sourcesStarted).toBe(2));
    mixSlider().focus();
    await user.keyboard('{End}');
    await waitFor(() => expect(gainsCreated[0].gain.setTargetAtTime).toHaveBeenCalled());
    const last = (gain: FakeGain) => gain.gain.setTargetAtTime.mock.calls.at(-1)?.[0] as number;
    await waitFor(() => expect(last(gainsCreated[0])).toBeCloseTo(0, 6));
    // All B: the matched B gain, which is at most 1 and attenuated by 5.2 dB.
    expect(last(gainsCreated[1])).toBeCloseTo(10 ** (-5.2 / 20), 3);
  });
});

describe('CompareDeck: crossfader and dim', () => {
  it('defaults to 50% A, 50% B with both wells at full opacity', async () => {
    const { container } = deck();
    await waitFor(() => expect(mixSlider()).toHaveAttribute('aria-valuetext', '50% A, 50% B'));
    expect(wellOpacityOf(container, 'A')).toBe('1');
    expect(wellOpacityOf(container, 'B')).toBe('1');
  });

  it('dims the well the mix moves away from, continuously', async () => {
    const user = userEvent.setup();
    const { container } = deck();
    mixSlider().focus();
    await user.keyboard('{End}');
    await waitFor(() => expect(mixSlider()).toHaveAttribute('aria-valuetext', '0% A, 100% B'));
    await waitFor(() => expect(wellOpacityOf(container, 'A')).toBe('0.45'));
    expect(wellOpacityOf(container, 'B')).toBe('1');
    await user.keyboard('{PageDown}');
    await waitFor(() => expect(mixSlider()).toHaveAttribute('aria-valuetext', '20% A, 80% B'));
    await waitFor(() => {
      const opacity = Number(wellOpacityOf(container, 'A'));
      expect(opacity).toBeGreaterThan(0.45);
      expect(opacity).toBeLessThan(1);
    });
  });

  it('fades the picture only: the well, its axes and its chips stay at full strength', async () => {
    const user = userEvent.setup();
    const { container } = deck();
    mixSlider().focus();
    await user.keyboard('{End}');
    await waitFor(() => expect(wellOpacityOf(container, 'A')).toBe('0.45'));
    const well = rowOf(container, 'A').querySelector('[data-well]') as HTMLElement;
    expect(well.style.opacity).toBe('');
    for (const chip of Array.from(rowOf(container, 'A').querySelectorAll('[data-chip]'))) expect((chip as HTMLElement).style.opacity).toBe('');
  });

  it('under reduced motion the dim switches at the 50% point, with no ramp', async () => {
    stubReduced(true);
    const user = userEvent.setup();
    const { container } = deck();
    mixSlider().focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await waitFor(() => expect(mixSlider()).toHaveAttribute('aria-valuetext', '70% A, 30% B'));
    await waitFor(() => expect(wellOpacityOf(container, 'B')).toBe('0.45'));
    expect(wellOpacityOf(container, 'A')).toBe('1');
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(mixSlider()).toHaveAttribute('aria-valuetext', '65% A, 35% B'));
    expect(wellOpacityOf(container, 'B')).toBe('0.45');
  });
});

describe('CompareDeck: listening focus', () => {
  it('"Listen to B" marks B, moves the mix to B alone and announces it politely', async () => {
    const user = userEvent.setup();
    const { container } = deck();
    const live = container.querySelector('[data-live-region="listening"]') as HTMLElement;
    expect(live).toHaveTextContent('');
    const button = within(rowOf(container, 'B')).getByRole('button', { name: 'Listen to B' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    await waitFor(() => expect(live).toHaveTextContent('Listening to B'));
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(rowOf(container, 'B').querySelector('[data-listening-bar]')).not.toBeNull();
    expect(rowOf(container, 'A').querySelector('[data-listening-bar]')).toBeNull();
    await waitFor(() => expect(mixSlider()).toHaveAttribute('aria-valuetext', '0% A, 100% B'));
  });

  it('moving the crossfader afterwards clears the mark', async () => {
    const user = userEvent.setup();
    const { container } = deck({ defaultListening: 'A', defaultMix: 0 });
    expect(rowOf(container, 'A').querySelector('[data-listening-bar]')).not.toBeNull();
    mixSlider().focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(rowOf(container, 'A').querySelector('[data-listening-bar]')).toBeNull());
    expect(container.querySelector('[data-live-region="listening"]')).toHaveTextContent('');
  });
});

describe('CompareDeck: a third row and row states', () => {
  it('shows a third row on the same scale, says the crossfader mixes A and B, and the caption says "all wells"', () => {
    const three: CompareRowData[] = [...rows(), { slot: 'C', state: 'empty' }];
    deck({ rows: three });
    expect(screen.getByText(/^One colour scale for all wells/)).toBeInTheDocument();
    expect(screen.getByText(/The crossfader mixes A and B/)).toBeInTheDocument();
  });

  it('an empty slot offers "Add a recording" and reports which slot', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const three: CompareRowData[] = [...rows(), { slot: 'C', state: 'empty' }];
    deck({ rows: three, onAdd });
    expect(screen.getByText('Add a recording')).toBeInTheDocument();
    expect(screen.getByText('Pick a site or a clip to compare.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose a recording' }));
    expect(onAdd).toHaveBeenCalledWith('C');
  });

  it('a disabled row keeps its identity and shows "Recording unavailable" in place of the well', () => {
    const list = rows();
    list[1] = { slot: 'B', identity: excerptIdentity(D1), state: 'disabled' };
    const { container } = deck({ rows: list });
    const b = within(rowOf(container, 'B'));
    expect(b.getByText('Recording unavailable')).toBeInTheDocument();
    expect(b.getByText('Degraded (D)')).toBeInTheDocument();
    expect(rowOf(container, 'B').querySelector('[data-spectrogram]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play both' })).toBeDisabled();
  });

  it('a loading row shows skeletons and "Loading recording…"', () => {
    const list: CompareRowData[] = [rows()[0], { slot: 'B', state: 'loading' }];
    const { container } = deck({ rows: list });
    expect(within(rowOf(container, 'B')).getByText('Loading recording…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play both' })).toBeDisabled();
  });

  it('an error row shows the error with Retry and Remove', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onRemove = vi.fn();
    const list = rows();
    list[1] = { slot: 'B', identity: excerptIdentity(D1), state: 'error' };
    const { container } = deck({ rows: list, onRetry, onRemove });
    const b = within(rowOf(container, 'B'));
    expect(b.getByText('This recording could not be loaded.')).toBeInTheDocument();
    expect(b.getByText('Retry, or remove it from the comparison.')).toBeInTheDocument();
    await user.click(b.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('B');
    await user.click(b.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('B');
  });

  it('a forced-playing deck shows Pause both at the given position and does nothing when pressed', async () => {
    const user = userEvent.setup();
    deck({ forcedPlaying: { positionS: 12.4 } });
    expect(screen.getByRole('button', { name: 'Pause both' })).toBeInTheDocument();
    expect(screen.getByTestId('transport-readout')).toHaveTextContent('00:12.4 / 00:30.0');
    await user.click(screen.getByRole('button', { name: 'Pause both' }));
    expect(sourcesStarted).toBe(0);
  });
});

describe('CompareRow helpers', () => {
  it('writes the recorded line and the level line', () => {
    expect(recordedLine('2022-08-30T12:00:00')).toBe('2022-08-30 12:00 on the recorder clock, timezone unverified');
    expect(levelLine(-60.93, 0)).toBe(`Level matched: ${MINUS}60.9 dB RMS, gain 0.0 dB`);
    expect(levelLine(-55.77, -5.2)).toBe(`Level matched: ${MINUS}55.8 dB RMS, gain ${MINUS}5.2 dB`);
    expect(levelLine(undefined, undefined)).toBe('Level not matched: no RMS level is recorded for this clip.');
    expect(levelLine(-60, undefined)).toBeNull();
  });

  it('a lone CompareRow without onFocusRow has a decorative slot letter and no button', () => {
    render(<CompareRow slot="A" identity={excerptIdentity(H1)} matrix={matrixH1} />);
    expect(screen.queryByRole('button', { name: /Listen to/ })).toBeNull();
  });

  it('forced hover and focus are drawn through data attributes', () => {
    const { container, rerender } = render(<CompareRow slot="A" identity={excerptIdentity(H1)} matrix={matrixH1} forcedState="hover" />);
    expect(container.querySelector('[data-identity][data-force-hover]')).not.toBeNull();
    rerender(<CompareRow slot="A" identity={excerptIdentity(H1)} matrix={matrixH1} forcedState="focus" onFocusRow={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Listen to A' })).toHaveAttribute('data-force-focus');
  });
});
