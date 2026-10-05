/**
 * WindowStrip (04-15, DS-05, T-04-15-01).
 *
 * The strip draws one cell per 5 s window. Per-window model output does not exist until Phase 5,
 * so the reading path (status colour at 0.2 + 0.8 x p, abstain) is exercised here with TEST INPUTS
 * only; the fixtures page shows unclassified and measured-energy cells and never a reading. These
 * tests prove the option names, the opacity rule, the legend wording that keeps the two honest,
 * the one-tab-stop keyboard contract, dense mode and every state's copy.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WINDOW_DENSE_PX,
  WindowStrip,
  energyOpacity,
  isDenseStrip,
  readingOpacity,
  windowOptionName,
  type WindowCellData,
} from '@/features/instrument';

const MINUS = '−';

function windows(count: number, patch: (index: number) => Partial<WindowCellData> = () => ({})): WindowCellData[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    startS: index * 5,
    endS: index * 5 + 5,
    reading: null,
    ...patch(index),
  }));
}

function mount(props: Partial<React.ComponentProps<typeof WindowStrip>> = {}) {
  const onSelectWindow = vi.fn();
  const view = render(<WindowStrip clipLabel="ind_H1" windows={windows(6)} onSelectWindow={onSelectWindow} {...props} />);
  return { onSelectWindow, ...view };
}

const option = (name: string | RegExp) => screen.getByRole('option', { name });

describe('opacity and option-name rules', () => {
  it('a reading cell is filled at 0.2 + 0.8 x p', () => {
    expect(readingOpacity(0.58)).toBeCloseTo(0.664, 10);
    expect(readingOpacity(0)).toBeCloseTo(0.2, 10);
    expect(readingOpacity(1)).toBeCloseTo(1, 10);
  });

  it('clamps a probability outside 0 to 1', () => {
    expect(readingOpacity(-1)).toBeCloseTo(0.2, 10);
    expect(readingOpacity(7)).toBeCloseTo(1, 10);
  });

  it('an energy cell maps the clip’s own range onto 0.15 to 0.85', () => {
    expect(energyOpacity(-80, -80, -60)).toBeCloseTo(0.15, 10);
    expect(energyOpacity(-60, -80, -60)).toBeCloseTo(0.85, 10);
    expect(energyOpacity(-70, -80, -60)).toBeCloseTo(0.5, 10);
  });

  it('an energy cell of a clip with one level is drawn at the middle', () => {
    expect(energyOpacity(-70, -70, -70)).toBeCloseTo(0.5, 10);
  });

  it('writes the option names from the spec', () => {
    const base = { index: 3, startS: 15, endS: 20 };
    expect(windowOptionName({ ...base, reading: { status: 'healthy', p: 0.58 } })).toBe('Window 4, 0:15 to 0:20, healthy, 58%');
    expect(windowOptionName({ ...base, reading: { abstain: true } })).toBe("Window 4, 0:15 to 0:20, can't tell");
    expect(windowOptionName({ ...base, reading: null })).toBe('Window 4, 0:15 to 0:20, no reading');
    expect(windowOptionName({ index: 1, startS: 5, endS: 10, reading: null, energyDb: -68.2 })).toBe(`Window 2, 0:05 to 0:10, no reading, ${MINUS}68.2 dB RMS`);
  });

  it('formats minutes in the times', () => {
    expect(windowOptionName({ index: 12, startS: 60, endS: 65, reading: null })).toBe('Window 13, 1:00 to 1:05, no reading');
  });
});

describe('dense mode rule', () => {
  it('is dense when a cell would be narrower than 16 px', () => {
    expect(WINDOW_DENSE_PX).toBe(16);
    expect(isDenseStrip(80, 6)).toBe(true);
    expect(isDenseStrip(600, 6)).toBe(false);
  });

  it('counts the 1 px gaps: exactly 16 px per cell is not dense', () => {
    expect(isDenseStrip(6 * 16 + 5, 6)).toBe(false);
    expect(isDenseStrip(6 * 16 + 4, 6)).toBe(true);
  });

  it('an unmeasured strip is not dense', () => {
    expect(isDenseStrip(0, 6)).toBe(false);
    expect(isDenseStrip(100, 0)).toBe(false);
  });
});

describe('WindowStrip: cells and names', () => {
  it('is a horizontal listbox named for the clip', () => {
    mount();
    const list = screen.getByRole('listbox', { name: 'Windows of ind_H1, 5 seconds each' });
    expect(list).toHaveAttribute('aria-orientation', 'horizontal');
    expect(within(list).getAllByRole('option')).toHaveLength(6);
  });

  it('a reading cell is filled at its probability and named with status and percentage (test input)', () => {
    mount({ windows: windows(6, (i) => (i === 3 ? { reading: { status: 'healthy', p: 0.58 } } : {})) });
    const cell = option('Window 4, 0:15 to 0:20, healthy, 58%');
    const fill = cell.querySelector('[data-cell-fill]') as HTMLElement;
    expect(Number(fill.style.opacity)).toBeCloseTo(0.664, 10);
    expect(cell).toHaveAttribute('data-cell-kind', 'reading');
    expect(cell.querySelector('svg')).not.toBeNull();
  });

  it('an abstain cell is hatched with a ring glyph', () => {
    mount({ windows: windows(6, (i) => (i === 3 ? { reading: { abstain: true } } : {})) });
    const cell = option("Window 4, 0:15 to 0:20, can't tell");
    expect(cell).toHaveAttribute('data-cell-kind', 'abstain');
    const fill = cell.querySelector('[data-cell-fill]') as HTMLElement;
    expect(fill.className).toContain('repeating-linear-gradient(45deg');
    expect(cell.querySelector('svg')).toHaveAttribute('data-status', 'unknown');
  });

  it('a null reading is a dashed empty cell with no glyph', () => {
    mount();
    const cell = option('Window 4, 0:15 to 0:20, no reading');
    expect(cell).toHaveAttribute('data-cell-kind', 'empty');
    expect(cell.className).toContain('border-dashed');
    expect(cell.querySelector('svg')).toBeNull();
  });

  it('an energy cell carries its level in its name and shades by the clip’s own range', () => {
    mount({ windows: windows(3, (i) => ({ energyDb: [-80, -68.2, -60][i] })) });
    const cell = option(`Window 2, 0:05 to 0:10, no reading, ${MINUS}68.2 dB RMS`);
    expect(cell).toHaveAttribute('data-cell-kind', 'energy');
    const fills = screen.getAllByRole('option').map((node) => Number((node.querySelector('[data-cell-fill]') as HTMLElement).style.opacity));
    expect(fills[0]).toBeCloseTo(0.15, 10);
    expect(fills[2]).toBeCloseTo(0.85, 10);
    expect(fills[1]).toBeGreaterThan(fills[0]);
    expect(fills[1]).toBeLessThan(fills[2]);
  });

  it('marks the selected window and draws the playing bar under the playing one', () => {
    mount({ selectedIndex: 1, playingIndex: 1 });
    expect(option('Window 2, 0:05 to 0:10, no reading')).toHaveAttribute('aria-selected', 'true');
    expect(option('Window 1, 0:00 to 0:05, no reading')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByRole('option').filter((node) => node.querySelector('[data-playing-bar]'))).toHaveLength(1);
    expect(option('Window 2, 0:05 to 0:10, no reading').querySelector('[data-playing-bar]')).not.toBeNull();
  });
});

describe('WindowStrip: keyboard', () => {
  it('is one tab stop: Tab enters on one cell and the next Tab leaves', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <WindowStrip clipLabel="ind_H1" windows={windows(6)} onSelectWindow={() => undefined} />
        <button type="button">after</button>
      </>,
    );
    await user.tab();
    await user.tab();
    expect(screen.getAllByRole('option').some((node) => node === document.activeElement)).toBe(true);
    await user.tab();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('ArrowRight moves focus to the next cell, ArrowLeft back, Home and End jump', async () => {
    const user = userEvent.setup();
    mount();
    const cells = screen.getAllByRole('option');
    await user.tab();
    expect(cells[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(cells[1]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(cells[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(cells[5]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(cells[0]).toHaveFocus();
  });

  it('Enter selects the focused window and reports its index', async () => {
    const user = userEvent.setup();
    const { onSelectWindow } = mount();
    await user.tab();
    await user.keyboard('{ArrowRight}{ArrowRight}{Enter}');
    expect(onSelectWindow).toHaveBeenLastCalledWith(2);
  });

  it('Space selects too', async () => {
    const user = userEvent.setup();
    const { onSelectWindow } = mount();
    await user.tab();
    await user.keyboard('{ArrowRight}{ }');
    expect(onSelectWindow).toHaveBeenLastCalledWith(1);
  });

  it('Enter on the window that is already selected still reports it, so the Transport can return to its start', async () => {
    const user = userEvent.setup();
    const { onSelectWindow } = mount({ selectedIndex: 0 });
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onSelectWindow).toHaveBeenLastCalledWith(0);
  });

  it('a click selects a window', async () => {
    const user = userEvent.setup();
    const { onSelectWindow } = mount();
    await user.click(option('Window 5, 0:20 to 0:25, no reading'));
    expect(onSelectWindow).toHaveBeenLastCalledWith(4);
  });
});

describe('WindowStrip: tooltips', () => {
  it('focusing a cell by keyboard shows its tooltip at once', async () => {
    const user = userEvent.setup();
    mount({ windows: windows(6, (i) => (i === 0 ? { reading: { status: 'healthy', p: 0.58 } } : {})) });
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Window 1 · 0:00 to 0:05 · Healthy · 58%');
  });

  it('an energy cell’s tooltip carries its level', async () => {
    const user = userEvent.setup();
    mount({ windows: windows(2, (i) => ({ energyDb: [-70, -60][i] })) });
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(`Window 1 · 0:00 to 0:05 · No reading · ${MINUS}70 dB RMS`);
  });
});

describe('WindowStrip: legend', () => {
  it('names the model reading and the probability when any cell has a reading (test input)', () => {
    mount({ windows: windows(2, (i) => (i === 0 ? { reading: { status: 'healthy', p: 0.5 } } : {})) });
    expect(screen.getByText("Colour is the model's reading for that window. Shade is the model's probability for that class, not a calibrated confidence.")).toBeInTheDocument();
  });

  it('for energy cells says the shade is measured and that no model readings exist', () => {
    mount({ windows: windows(2, (i) => ({ energyDb: [-70, -60][i] })) });
    expect(screen.getByText('Shade is the measured RMS level of each 5 s window, from the recording itself. No model readings exist for these windows yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Colour is the model's reading/)).toBeNull();
  });

  it('for unclassified windows says no model readings exist', () => {
    mount();
    expect(screen.getByText('No model readings exist for these windows yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Colour is the model's reading/)).toBeNull();
  });
});

describe('WindowStrip: summary', () => {
  it('computes "{k} of {n} windows read {Status}" from the cells', () => {
    mount({
      summary: 'healthy',
      windows: windows(4, (i) => (i < 3 ? { reading: i === 2 ? { status: 'degraded', p: 0.9 } : { status: 'healthy', p: 0.6 } } : {})),
    });
    expect(screen.getByText('2 of 4 windows read Healthy')).toBeInTheDocument();
  });

  it('is absent unless asked', () => {
    mount();
    expect(screen.queryByText(/windows read/)).toBeNull();
  });
});

describe('WindowStrip: dense mode', () => {
  let callback: ResizeObserverCallback | undefined;

  beforeEach(() => {
    callback = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          callback = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function resize(width: number) {
    callback?.([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver);
  }

  const withReading = windows(6, (i) => (i === 0 ? { reading: { status: 'healthy' as const, p: 0.6 } } : {}));

  it('drops the glyphs, keeps the 44 px height and keeps the names when the cells are narrower than 16 px', async () => {
    render(<WindowStrip clipLabel="ind_H1" windows={withReading} />);
    const list = screen.getByRole('listbox');
    await waitFor(() => expect(callback).toBeDefined());
    resize(600);
    await waitFor(() => expect(list).toHaveAttribute('data-dense', 'false'));
    expect(screen.getAllByRole('option')[0].querySelector('svg')).not.toBeNull();

    resize(80);
    await waitFor(() => expect(list).toHaveAttribute('data-dense', 'true'));
    for (const cell of screen.getAllByRole('option')) {
      expect(cell.querySelector('svg')).toBeNull();
      expect(cell.className).toContain('h-11');
    }
    expect(option('Window 1, 0:00 to 0:05, healthy, 60%')).toBeInTheDocument();
  });
});

describe('WindowStrip: states', () => {
  it('disabled is non-interactive, says why and dims the cells', () => {
    mount({ isDisabled: true });
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Readings are not available for this recording.')).toBeInTheDocument();
    expect(screen.getAllByRole('option')[0].className).toContain('opacity-60');
  });

  it('loading shows one skeleton per expected window and the label', () => {
    const { container } = mount({ state: 'loading', windows: [], expectedCount: 6 });
    expect(screen.getByRole('status')).toHaveTextContent('Loading windows…');
    expect(container.querySelectorAll('[aria-hidden="true"].h-11')).toHaveLength(6);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('empty is a dashed box with both lines', () => {
    mount({ windows: [] });
    expect(screen.getByText('No windows yet.')).toBeInTheDocument();
    expect(screen.getByText('Windows appear after the recording has been analysed.')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('error uses the Error primitive and says the recording is unaffected', () => {
    mount({ state: 'error' });
    expect(screen.getByText('Window readings could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('The recording and its spectrogram are unaffected.')).toBeInTheDocument();
  });
});

describe('WindowStrip: forced state', () => {
  it('draws hover and focus on one cell for review', () => {
    mount({ forced: { index: 2, state: 'hover' } });
    expect(option('Window 3, 0:10 to 0:15, no reading')).toHaveAttribute('data-force-hover');
    expect(option('Window 1, 0:00 to 0:05, no reading')).not.toHaveAttribute('data-force-hover');
  });
});
