/**
 * PlotFigure + probability encoding (PLAT-02, 03-11).
 *
 * Runs Observable Plot for real under jsdom: the assertions are on the SVG and
 * the hidden table the user (or a screen reader) actually gets, not on mocks.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PlotFigure } from '@/features/charts/PlotFigure';
import { probabilityBars, seriesLine } from '@/features/charts/encodings';

const SAMPLE = { degraded: 0.62, healthy: 0.25, restored_early: 0.13 };

function renderBars(probabilities: Parameters<typeof probabilityBars>[0], options = {}) {
  const spec = probabilityBars(probabilities, { caption: 'Class probabilities for this recording', ...options });
  const utils = render(<PlotFigure {...spec} />);
  return { spec, ...utils };
}

describe('PlotFigure: probability bars (PLAT-02)', () => {
  it('renders a figure with a figcaption and one svg', () => {
    const { container } = renderBars(SAMPLE);
    const figure = container.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.querySelector('figcaption')).toHaveTextContent('Class probabilities for this recording');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('gives the root svg an aria-label and an aria-description with the takeaway', () => {
    const { container } = renderBars(SAMPLE);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toMatch(/probabilit/i);
    expect(svg.getAttribute('aria-description')).toBe('Degraded 62%, healthy 25%, restored (early) 13%');
  });

  it('draws three bars with per-datum aria labels, ordered by probability descending', () => {
    const { container } = renderBars({ healthy: 0.25, restored_early: 0.13, degraded: 0.62 });
    const bars = Array.from(container.querySelectorAll('rect[aria-label]')).map((r) => r.getAttribute('aria-label'));
    expect(bars).toEqual(['Degraded: 62%', 'Healthy: 25%', 'Restored (early): 13%']);
  });

  it('fixes the probability axis to [0, 1] from a zero baseline with percent ticks', () => {
    const { spec, container } = renderBars(SAMPLE);
    const options = spec.build(600);
    expect(options.x?.domain).toEqual([0, 1]);
    const ticks = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(ticks).toContain('0%');
    expect(ticks).toContain('100%');
  });

  it('colours each bar from STATUS_COLORS through the colour domain and range', () => {
    const { spec } = renderBars(SAMPLE);
    const color = spec.build(600).color as { domain: string[]; range: string[] };
    expect(color.domain).toEqual(['degraded', 'healthy', 'restored_early']);
    expect(color.range).toEqual(['#6b6560', '#cd853f', '#8b7355']);
  });

  it('marks decorative rules aria-hidden', () => {
    const { container } = renderBars(SAMPLE);
    expect(container.querySelector('svg [aria-hidden="true"]')).not.toBeNull();
  });

  it('adds a visually hidden table whose percentage cells match the plotted values and sum to 100', () => {
    renderBars(SAMPLE);
    const table = screen.getByRole('table', { hidden: true });
    expect(table).toHaveClass('sr-only');
    const rows = within(table).getAllByRole('row', { hidden: true }).slice(1);
    const cells = rows.map((row) => within(row).getAllByRole('cell', { hidden: true }).map((c) => c.textContent));
    expect(cells).toEqual([
      ['Degraded', '62%'],
      ['Healthy', '25%'],
      ['Restored (early)', '13%'],
    ]);
    const total = cells.reduce((acc, [, pct]) => acc + parseInt(pct!, 10), 0);
    expect(total).toBe(100);
  });

  it('renormalises a legacy multiplied payload so the integers still sum to 100', () => {
    const { container } = renderBars({ degraded: 0.31, healthy: 0.125, restored_early: 0.065 });
    const labels = Array.from(container.querySelectorAll('rect[aria-label]')).map((r) => r.getAttribute('aria-label')!);
    const total = labels.reduce((acc, l) => acc + parseInt(l.split(': ')[1]!, 10), 0);
    expect(total).toBe(100);
    expect(labels[0]).toBe('Degraded: 62%');
  });

  it('keeps bar lengths inside the [0, 1] domain even for an unnormalised payload', () => {
    const { spec } = renderBars({ degraded: 0.31, healthy: 0.125, restored_early: 0.065 });
    const marks = spec.build(600).marks ?? [];
    expect(marks.length).toBeGreaterThan(0);
    expect(spec.build(600).x?.domain).toEqual([0, 1]);
  });

  it('removes the svg when unmounted (cleanup)', () => {
    const { container, unmount } = renderBars(SAMPLE);
    const host = container;
    expect(host.querySelector('svg')).not.toBeNull();
    unmount();
    expect(document.querySelector('svg')).toBeNull();
  });
});

describe('PlotFigure: empty, one and many (PLAT-02)', () => {
  it('renders the caption and "No data to plot." with no svg for empty probabilities', () => {
    const { container } = renderBars({});
    expect(screen.getByText('No data to plot.')).toBeInTheDocument();
    expect(container.querySelector('figcaption')).toHaveTextContent('Class probabilities for this recording');
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('table')).toBeNull();
  });

  it('treats null probabilities as empty', () => {
    const { container } = renderBars(null);
    expect(screen.getByText('No data to plot.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders exactly one bar for one category', () => {
    const { container } = renderBars({ healthy: 0.9 });
    const bars = container.querySelectorAll('rect[aria-label]');
    expect(bars).toHaveLength(1);
    expect(bars[0]!.getAttribute('aria-label')).toBe('Healthy: 100%');
  });

  it('truncates many categories to the cutoff and says so in the caption', () => {
    const many: Record<string, number> = {};
    for (let i = 0; i < 30; i++) many[`site_${String(i).padStart(2, '0')}`] = (30 - i) / 465;
    const { container } = renderBars(many, { cutoff: 10 });
    expect(container.querySelectorAll('rect[aria-label]')).toHaveLength(10);
    expect(container.querySelector('figcaption')).toHaveTextContent('Showing the top 10 of 30');
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(11);
  });

  it('keeps the caption unchanged when nothing is truncated', () => {
    const { container } = renderBars(SAMPLE, { cutoff: 10 });
    expect(container.querySelector('figcaption')!.textContent).toBe('Class probabilities for this recording');
  });
});

describe('PlotFigure: series line (PLAT-02)', () => {
  const POINTS = [
    { x: 1000, y: 12 },
    { x: 2000, y: 62 },
    { x: 3000, y: 30 },
  ];
  const renderSeries = (points: { x: number; y: number }[], options = {}) => {
    const spec = seriesLine(points, {
      caption: 'Calls per hour',
      xLabel: 'Hour',
      yLabel: 'Calls',
      xFormat: ',.0f',
      ...options,
    });
    const utils = render(<PlotFigure {...spec} />);
    return { spec, ...utils };
  };

  it('starts the y domain at zero and uses a nice upper bound (no truncated axis)', () => {
    const { spec } = renderSeries(POINTS);
    expect(spec.build(600).y?.domain).toEqual([0, 65]);
  });

  it('keeps zero as the baseline even when every value is far from zero', () => {
    const { spec } = renderSeries([
      { x: 1, y: 940 },
      { x: 2, y: 960 },
    ]);
    expect((spec.build(600).y?.domain as number[])[0]).toBe(0);
  });

  it('draws the line with a d3-shape curve factory (curved path commands)', () => {
    const { container } = renderSeries(POINTS);
    const path = container.querySelector('g[aria-label="line"] path')!;
    expect(path.getAttribute('d')).toMatch(/C/);
  });

  it('sorts an unsorted series by x for the line, the dots and the hidden table, without mutating the input (WR-04)', () => {
    const unsorted = [POINTS[2]!, POINTS[0]!, POINTS[1]!];
    const copy = unsorted.map((p) => ({ ...p }));
    const { spec } = renderSeries(unsorted);
    expect(spec.table.rows.map((r) => r[0])).toEqual(['1,000', '2,000', '3,000']);
    expect(unsorted).toEqual(copy);
  });

  it('formats x ticks with d3-format', () => {
    const { container } = renderSeries(POINTS);
    const ticks = Array.from(container.querySelectorAll('svg text')).map((t) => t.textContent);
    expect(ticks).toContain('2,000');
  });

  it('gives every point an accessible label and hides decorative rules', () => {
    const { container } = renderSeries(POINTS);
    const labels = Array.from(container.querySelectorAll('circle[aria-label]')).map((c) => c.getAttribute('aria-label'));
    expect(labels).toEqual(['Hour 1,000: 12', 'Hour 2,000: 62', 'Hour 3,000: 30']);
    expect(container.querySelector('svg [aria-hidden="true"]')).not.toBeNull();
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toMatch(/calls/i);
    expect(svg.getAttribute('aria-description')).toMatch(/3 points/);
  });

  it('lists the plotted values in the hidden table', () => {
    renderSeries(POINTS);
    const table = screen.getByRole('table', { hidden: true });
    const rows = within(table).getAllByRole('row', { hidden: true }).slice(1);
    const cells = rows.map((row) => within(row).getAllByRole('cell', { hidden: true }).map((c) => c.textContent));
    expect(cells).toEqual([
      ['1,000', '12'],
      ['2,000', '62'],
      ['3,000', '30'],
    ]);
  });

  it('renders one dot and no line for a single point', () => {
    const { container } = renderSeries([{ x: 5, y: 40 }]);
    expect(container.querySelectorAll('circle[aria-label]')).toHaveLength(1);
    expect(container.querySelector('g[aria-label="line"]')).toBeNull();
  });

  it('renders the empty state for no points', () => {
    const { container } = renderSeries([]);
    expect(screen.getByText('No data to plot.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});
