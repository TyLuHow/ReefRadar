/**
 * StripPlot (04-19, DS-05): the strip, paired and scatter variants on Observable Plot, rendered for
 * real under jsdom. The assertions are on the SVG and the table the user actually gets (marks carry
 * var(--dir-*) paints, the caption is computed from the data, the table is the keyboard path), not
 * on mocks of Plot.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StripPlot, stripSpec, type StripPoint } from '@/features/charts';

const POINTS: StripPoint[] = [
  { id: 'aus_D1', status: 'degraded', value: -0.5 },
  { id: 'aus_D2', status: 'degraded', value: -0.4 },
  { id: 'ind_H1', status: 'healthy', value: 0.8 },
  { id: 'ind_H2', status: 'healthy', value: 0.7 },
  { id: 'ken_R1', status: 'restored_early', value: 0.1 },
];

const MEASURE = 'Position on component 1 of the reference projection';

/** The radius of a healthy (circle) mark's path: M r,0 A ... . Healthy radius is 7/16 of the mark side. */
function circleRadius(path: Element): number {
  const match = /^M(-?[\d.]+)/.exec(path.getAttribute('d') ?? '');
  return Number(match?.[1]);
}

describe('stripSpec', () => {
  it('returns one table row per site and a caption computed from the data', () => {
    const spec = stripSpec(POINTS, { measureLabel: MEASURE });
    expect(spec.table.headers).toEqual(['Site', 'Status', 'Value']);
    expect(spec.table.rows).toHaveLength(5);
    expect(spec.table.rows[0]).toEqual(['aus_D1', 'Degraded', '−0.500']);
    expect(spec.caption).toContain(`${MEASURE} for 5 reference sites, one mark per site.`);
    expect(spec.ariaLabel).toMatch(/strip plot/i);
    expect(spec.ariaDescription).toBe('Degraded 2, Restored (early) 1, Healthy 2');
  });

  it('puts one row per present status in ordinal order and labels it with its computed count', () => {
    const options = stripSpec(POINTS, { measureLabel: MEASURE }).build(600);
    expect(options.fy?.domain).toEqual(['degraded', 'restored_early', 'healthy']);
    const tickFormat = options.fy?.tickFormat as (status: string) => string;
    expect(tickFormat('degraded')).toBe('Degraded 2');
    expect(tickFormat('restored_early')).toBe('Restored (early) 1');
    expect(tickFormat('healthy')).toBe('Healthy 2');
  });

  it('uses identity colour and radius scales so var() paints and pixel sizes pass through', () => {
    const options = stripSpec(POINTS, { measureLabel: MEASURE }).build(600);
    expect(options.color?.type).toBe('identity');
    expect(options.r?.type).toBe('identity');
  });

  it('says where the axis starts when it does not include zero, and not otherwise', () => {
    const positive = stripSpec(
      [
        { id: 'a', status: 'degraded', value: 2.05 },
        { id: 'b', status: 'healthy', value: 3.95 },
      ],
      { measureLabel: 'Level' },
    );
    expect(positive.caption).toMatch(/Axis starts at 2, not zero\.$/);
    expect(stripSpec(POINTS, { measureLabel: MEASURE }).caption).not.toMatch(/Axis starts/);
  });

  it('one row of data yields "One value: {site} {measure} {value}."', () => {
    const spec = stripSpec([{ id: 'ind_H1', status: 'healthy', value: 0.823 }], { measureLabel: 'Position on component 1' });
    expect(spec.caption).toBe('One value: ind_H1 position on component 1 0.823.');
    expect(spec.table.rows).toEqual([['ind_H1', 'Healthy', '0.823']]);
  });

  it('is deterministic: the same data builds the same table and caption', () => {
    const a = stripSpec(POINTS, { measureLabel: MEASURE, selectedId: 'ind_H1' });
    const b = stripSpec(POINTS, { measureLabel: MEASURE, selectedId: 'ind_H1' });
    expect(a.table).toEqual(b.table);
    expect(a.caption).toBe(b.caption);
  });
});

describe('StripPlot: strip', () => {
  it('renders a figure with a caption, one svg, and marks painted from the status tokens', () => {
    const spec = stripSpec(POINTS, { measureLabel: MEASURE });
    const { container } = render(<StripPlot spec={spec} />);
    const figure = container.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.querySelector('figcaption')).toHaveTextContent(spec.caption);
    expect(container.querySelectorAll('svg')).toHaveLength(1);

    const fills = new Set(Array.from(container.querySelectorAll('svg [fill]')).map((node) => node.getAttribute('fill')));
    expect(fills.has('var(--dir-hab-degraded)')).toBe(true);
    expect(fills.has('var(--dir-hab-restored-early)')).toBe(true);
    expect(fills.has('var(--dir-hab-healthy)')).toBe(true);
    // The marks carry the ink outline token; no mark is filled with the accent.
    expect(container.querySelector('svg [stroke="var(--dir-mark-outline)"]')).not.toBeNull();
    expect(container.querySelector('svg [fill="var(--dir-accent)"]')).toBeNull();
  });

  it('draws one mark per site, and the row labels carry the counts', () => {
    const spec = stripSpec(POINTS, { measureLabel: MEASURE });
    const { container } = render(<StripPlot spec={spec} />);
    expect(container.querySelectorAll('svg path[fill^="var(--dir-hab-"]')).toHaveLength(5);
    const text = Array.from(container.querySelectorAll('svg text')).map((node) => node.textContent);
    expect(text).toEqual(expect.arrayContaining(['Degraded 2', 'Restored (early) 1', 'Healthy 2']));
  });

  it('draws the selected mark at size 24 with a 2 px ink ring, and the others smaller with none', () => {
    const spec = stripSpec(POINTS, { measureLabel: MEASURE, selectedId: 'ind_H1' });
    const { container } = render(<StripPlot spec={spec} />);
    const circles = Array.from(container.querySelectorAll('svg path[fill="var(--dir-hab-healthy)"]'));
    expect(circles).toHaveLength(2);
    const radii = circles.map(circleRadius).sort((a, b) => a - b);
    // Healthy radius is 7/16 of the side: 16 px marks -> 7, the 24 px selected mark -> 10.5.
    expect(radii[0]).toBeCloseTo(7, 1);
    expect(radii[1]).toBeCloseTo(10.5, 1);

    const rings = container.querySelectorAll('svg [stroke="var(--dir-ink)"]');
    expect(rings).toHaveLength(1);
    expect(rings[0].closest('[stroke-width]')?.getAttribute('stroke-width')).toBe('2');
  });

  it('gives every mark a native tooltip "{site} · {Status} · {value}"', () => {
    const spec = stripSpec(POINTS, { measureLabel: MEASURE });
    const { container } = render(<StripPlot spec={spec} />);
    const titles = Array.from(container.querySelectorAll('svg title')).map((node) => node.textContent);
    expect(titles).toContain('ind_H1 · Healthy · 0.800');
  });

  it('forces a hover label for one site without changing any mark position', () => {
    const base = stripSpec(POINTS, { measureLabel: MEASURE });
    const hovered = stripSpec(POINTS, { measureLabel: MEASURE, hoverId: 'ind_H1' });
    const a = render(<StripPlot spec={base} />);
    const marksBefore = Array.from(a.container.querySelectorAll('svg path[fill^="var(--dir-hab-"]')).map((node) => node.getAttribute('transform'));
    a.unmount();
    const b = render(<StripPlot spec={hovered} />);
    const marksAfter = Array.from(b.container.querySelectorAll('svg path[fill^="var(--dir-hab-"]')).map((node) => node.getAttribute('transform'));
    expect(marksAfter).toEqual(marksBefore);
    const labels = Array.from(b.container.querySelectorAll('svg text')).map((node) => node.textContent);
    expect(labels).toContain('ind_H1 · Healthy · 0.800');
  });
});

describe('StripPlot: table and keyboard path', () => {
  it('has a visible "Show as table" disclosure that reveals the values, and marks are not focusable', async () => {
    const user = userEvent.setup();
    const spec = stripSpec(POINTS, { measureLabel: MEASURE });
    const { container } = render(<StripPlot spec={spec} />);

    const button = screen.getByRole('button', { name: 'Show as table' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).toBeNull();

    await user.click(button);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hide table' })).toHaveAttribute('aria-expanded', 'true'));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    expect(within(table).getByText('ind_H1')).toBeInTheDocument();

    for (const node of Array.from(container.querySelectorAll('svg *'))) {
      expect(node.getAttribute('tabindex')).toBeNull();
    }
  });

  it('with onSelect, each table row has a button that selects that site', async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    render(<StripPlot spec={stripSpec(POINTS, { measureLabel: MEASURE })} onSelect={(id) => picked.push(id)} />);
    await user.click(screen.getByRole('button', { name: 'Show as table' }));
    await user.click(await screen.findByRole('button', { name: 'Select ind_H1' }));
    expect(picked).toEqual(['ind_H1']);
  });

  it('without onSelect the table has no selection buttons', async () => {
    const user = userEvent.setup();
    render(<StripPlot spec={stripSpec(POINTS, { measureLabel: MEASURE })} />);
    await user.click(screen.getByRole('button', { name: 'Show as table' }));
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /^Select / })).toBeNull();
  });
});

describe('StripPlot: states', () => {
  it('loading says "Loading plot…" and draws no svg', () => {
    const { container } = render(<StripPlot state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading plot…');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('empty says there is nothing to plot, with no svg and no table', () => {
    const { container } = render(<StripPlot spec={stripSpec([], { measureLabel: MEASURE })} />);
    expect(screen.getByText('No values to plot.')).toBeInTheDocument();
    expect(screen.getByText('Adjust the selection to include at least one site.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show as table' })).toBeNull();
  });

  it('a draw that throws becomes the error state with the table, instead of breaking the page', async () => {
    const real = stripSpec(POINTS, { measureLabel: MEASURE });
    const broken = {
      ...real,
      build: () => {
        throw new Error('boom');
      },
    };
    const { container } = render(<StripPlot spec={broken} />);
    expect(await screen.findByText('The plot could not be drawn.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(6);
  });

  it('error says the plot could not be drawn and still shows the table with the same values', () => {
    const { container } = render(<StripPlot spec={stripSpec(POINTS, { measureLabel: MEASURE })} state="error" />);
    expect(screen.getByText('The plot could not be drawn.')).toBeInTheDocument();
    expect(screen.getByText('The table has the same values.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(6);
  });
});
