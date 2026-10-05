/**
 * ClipCard (04-16, DS-05). The matrix is computed from the real committed ind_H1 excerpt and the
 * facts come from the audio manifest. jsdom has no canvas, so getContext is stubbed.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipCard, clipCardPlaceLine, computeSpectrogram, parseWavPcm16, type ClipCardProps, type SpectrogramMatrix } from '@/features/instrument';
import { excerptStatus } from '@/features/fixtures/parts/excerptIdentity';
import { STATUS_LABELS } from '@/features/ui';
import { allExcerpts, getExcerpt } from '@/lib/audio-manifest';
import { readClipBuffer } from './support/clips';

const H1 = getExcerpt('ind_H1_20220830_120000');

let matrix: SpectrogramMatrix;
beforeAll(() => {
  const wav = parseWavPcm16(readClipBuffer(H1.excerpt_id));
  matrix = computeSpectrogram(wav.samples, wav.sampleRate);
});

const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalRO = globalThis.ResizeObserver;

class StubResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 300, height: 150 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
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
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  globalThis.ResizeObserver = originalRO;
});

function props(overrides: Partial<ClipCardProps> = {}): ClipCardProps {
  return {
    siteId: H1.site_id,
    status: excerptStatus(H1),
    statusLabel: STATUS_LABELS[excerptStatus(H1)],
    assignedBy: H1.label?.label_assigned_by,
    place: 'South Sulawesi, Indonesia',
    recordedDate: H1.recorded_at_recorder_clock.split('T')[0],
    matrix,
    onPlay: vi.fn(),
    ...overrides,
  };
}

describe('ClipCard', () => {
  it('has a play button named "Play {site_id}" that reports a press and starts nothing itself', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    render(<ClipCard {...props({ onPlay })} />);
    expect(onPlay).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Play ind_H1' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('the label flips to "Pause {site_id}" while playing', () => {
    render(<ClipCard {...props({ isPlaying: true })} />);
    expect(screen.getByRole('button', { name: 'Pause ind_H1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play ind_H1' })).toBeNull();
  });

  it('shows the site id, a 16 px status mark with its label and "{place} · {recorded date}"', () => {
    const { container } = render(<ClipCard {...props()} />);
    expect(screen.getByText('ind_H1')).toBeInTheDocument();
    const mark = container.querySelector('svg[data-status="healthy"]') as SVGElement;
    expect(mark.getAttribute('width')).toBe('16');
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('South Sulawesi, Indonesia · 2022-08-30')).toBeInTheDocument();
    expect(clipCardPlaceLine('A', '2020-01-02')).toBe('A · 2020-01-02');
  });

  it('draws the thumb spectrogram, 150 px high, with a metadata-only description', () => {
    const { container } = render(<ClipCard {...props()} />);
    const thumb = container.querySelector('[data-spectrogram][data-variant="thumb"]');
    expect(thumb).not.toBeNull();
    expect(screen.getByRole('img', { name: /^Spectrogram, 0 to 8 kHz, 30 seconds$/ })).toBeInTheDocument();
    expect(container.querySelector('[data-variant="thumb"] [data-well]')?.className).toContain('h-[150px]');
  });

  it('wraps the label in a solid reference-label rule that names who assigned it', () => {
    const { container } = render(<ClipCard {...props()} />);
    const rule = container.querySelector('.border-s') as HTMLElement;
    expect(rule.className).toContain('border-solid');
    expect(within(rule).getByText('REFERENCE LABEL')).toBeInTheDocument();
    expect(within(rule).getByText('Healthy')).toBeInTheDocument();
    expect(within(rule).getByText(`Assigned by ${H1.label?.label_assigned_by}`)).toBeInTheDocument();
  });

  it('a model reading is drawn with the dashed rule and the MODEL READING eyebrow', () => {
    const { container } = render(<ClipCard {...props({ labelKind: 'model', assignedBy: undefined })} />);
    const rule = container.querySelector('.border-s') as HTMLElement;
    expect(rule.className).toContain('border-dashed');
    expect(within(rule).getByText('MODEL READING')).toBeInTheDocument();
    expect(screen.queryByText(/^Assigned by/)).toBeNull();
  });

  it('makes the site id a link only when href is given, and never makes the card a link', () => {
    const { rerender, container } = render(<ClipCard {...props()} />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<ClipCard {...props({ href: '/sites/ind_H1/' })} />);
    const link = screen.getByRole('link', { name: 'ind_H1' });
    expect(link).toHaveAttribute('href', '/sites/ind_H1/');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('article')?.closest('a')).toBeNull();
  });

  it('is an article named by the site id', () => {
    render(<ClipCard {...props()} />);
    expect(screen.getByRole('article', { name: 'ind_H1' })).toBeInTheDocument();
  });

  it('error shows "This recording could not be loaded." with Retry and no play button', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ClipCard {...props({ state: 'error', onRetry })} />);
    expect(screen.getByText('This recording could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText('ind_H1')).toBeInTheDocument();
  });

  it('loading shows skeletons and "Loading recording…" in a busy status region', () => {
    const { container } = render(<ClipCard {...props({ state: 'loading' })} />);
    expect(screen.getByText('Loading recording…')).toBeInTheDocument();
    const region = container.querySelector('[aria-busy="true"]');
    expect(region).not.toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[data-spectrogram]')).toBeNull();
  });

  it('forced hover and focus are drawn through data attributes', () => {
    const { container, rerender } = render(<ClipCard {...props({ forcedState: 'hover' })} />);
    expect(container.querySelector('[data-clip-card-text][data-force-hover]')).not.toBeNull();
    rerender(<ClipCard {...props({ forcedState: 'focus' })} />);
    expect(screen.getByRole('button', { name: 'Play ind_H1' })).toHaveAttribute('data-force-focus');
  });

  it('names every one of the nine manifest recordings with its own label status', () => {
    for (const excerpt of allExcerpts()) {
      const status = excerptStatus(excerpt);
      expect(STATUS_LABELS[status]).toBeTruthy();
      expect(status).not.toBe('unknown');
    }
    expect(allExcerpts()).toHaveLength(9);
  });
});
