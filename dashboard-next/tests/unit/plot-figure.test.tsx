/**
 * PlotFigure + probability encoding (PLAT-02, 03-11).
 *
 * Runs Observable Plot for real under jsdom: the assertions are on the SVG and
 * the hidden table the user (or a screen reader) actually gets, not on mocks.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { PlotFigure } from '@/features/charts/PlotFigure';
import { probabilityBars } from '@/features/charts/encodings';

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
