/**
 * StripPlot (04-19, DS-05): the strip, paired and scatter variants on Observable Plot, rendered for
 * real under jsdom. The assertions are on the SVG and the table the user actually gets (marks carry
 * var(--dir-*) paints, the caption is computed from the data, the table is the keyboard path), not
 * on mocks of Plot.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StripPlot, pairedSpec, projectionCaveat, scatterSpec, stripSpec, type ScatterSite, type StripPoint } from '@/features/charts';
import type { HabitatStatus } from '@/features/ui';
import { readContractJson } from './support/contract-fetch';

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

const BANDS = ['0 to 1 kHz', '1 to 4 kHz', '4 to 8 kHz'];
const PAIRED = {
  a: { siteId: 'ind_H1', status: 'healthy' as HabitatStatus, levels: [-50.12, -60.2, -70.3] },
  b: { siteId: 'ind_D1', status: 'degraded' as HabitatStatus, levels: [-55.4, -58, -72] },
  bands: BANDS,
  durationS: 30,
};

describe('pairedSpec', () => {
  it('has one table row per band with both levels, and the footnote limits the claim to two clips', () => {
    const spec = pairedSpec(PAIRED);
    expect(spec.table.headers).toEqual(['Band', 'A · ind_H1 (dB)', 'B · ind_D1 (dB)']);
    expect(spec.table.rows).toEqual([
      ['0 to 1 kHz', '−50.1', '−55.4'],
      ['1 to 4 kHz', '−60.2', '−58.0'],
      ['4 to 8 kHz', '−70.3', '−72.0'],
    ]);
    expect(spec.notes).toEqual([
      'Mean level in each band over these two 30-second excerpts, in dB re full scale of each file (uncalibrated). One excerpt per site; this describes two clips, not a finding about the sites.',
    ]);
    expect(spec.caption).toBe('A · ind_H1 and B · ind_D1: mean level in each of 3 frequency bands.');
  });

  it('ticks the x axis every 5 dB over a domain that covers both clips', () => {
    const x = pairedSpec(PAIRED).build(700).x as { domain: [number, number]; ticks: number[] };
    expect(x.domain).toEqual([-75, -50]);
    expect(x.ticks).toEqual([-75, -70, -65, -60, -55, -50]);
  });

  it('refuses a side whose levels do not match the bands, rather than plotting a guess', () => {
    expect(() => pairedSpec({ ...PAIRED, a: { ...PAIRED.a, levels: [-50] } })).toThrow(RangeError);
  });

  it('renders 24 px status marks, a 5 px ink bar over a 1 px rule baseline, and the right column with U+2212', () => {
    const { container } = render(<StripPlot spec={pairedSpec(PAIRED)} />);
    // A is healthy (circle, radius 7/16 of 24 = 10.5); B is degraded (down triangle, half-width 7/16 * 24).
    const circles = Array.from(container.querySelectorAll('svg path[fill="var(--dir-hab-healthy)"]'));
    expect(circles).toHaveLength(3);
    expect(Number(/^M(-?[\d.]+)/.exec(circles[0].getAttribute('d') ?? '')?.[1])).toBeCloseTo(10.5, 1);
    expect(container.querySelectorAll('svg path[fill="var(--dir-hab-degraded)"]')).toHaveLength(3);

    expect(container.querySelector('svg g[stroke="var(--dir-ink)"][stroke-width="5"]')).not.toBeNull();
    expect(container.querySelector('svg g[stroke="var(--dir-rule)"][stroke-width="1"]')).not.toBeNull();

    const texts = Array.from(container.querySelectorAll('svg text')).map((node) => node.textContent);
    expect(texts).toEqual(expect.arrayContaining(['−50.1 / −55.4 dB', '−60.2 / −58.0 dB', '−70.3 / −72.0 dB']));
    expect(texts).toEqual(expect.arrayContaining(['0 to 1 kHz', '1 to 4 kHz', '4 to 8 kHz', '−75', '−50']));
    expect(container.querySelector('svg [fill="var(--dir-accent)"]')).toBeNull();
  });

  it('prints the footnote and the A and B legend lines beside the figure', () => {
    render(<StripPlot spec={pairedSpec(PAIRED)} />);
    expect(screen.getByText(/this describes two clips, not a finding about the sites\.$/)).toBeInTheDocument();
    expect(screen.getByText(/A · ind_H1 and B · ind_D1/)).toBeInTheDocument();
  });
});

interface ContractSiteRow {
  site_id: string;
  country: string;
  status: HabitatStatus;
  projection: { x: number; y: number } | null;
}
const SITES_FILE = readContractJson('contracts/bucket/v1/sites.json') as { sites: ContractSiteRow[] };
const PROJECTION = readContractJson('contracts/bucket/v1/projection.json') as {
  explained_variance_ratio: number[];
  cumulative_explained_variance_ratio: number;
  coordinates: unknown[];
};
const SCATTER_SITES: ScatterSite[] = SITES_FILE.sites
  .filter((site) => site.projection !== null)
  .map((site) => ({ id: site.site_id, status: site.status, country: site.country, x: site.projection!.x, y: site.projection!.y }));
const SCATTER = {
  sites: SCATTER_SITES,
  explained: [PROJECTION.explained_variance_ratio[0], PROJECTION.explained_variance_ratio[1]] as [number, number],
  cumulative: PROJECTION.cumulative_explained_variance_ratio,
};

describe('scatterSpec (real contract data)', () => {
  it('plots only the sites that have projection coordinates and says how many', () => {
    expect(SCATTER_SITES).toHaveLength(PROJECTION.coordinates.length);
    const spec = scatterSpec(SCATTER);
    expect(spec.caption).toBe(`${SCATTER_SITES.length} reference sites with projection coordinates, one mark per site.`);
    expect(spec.table.rows).toHaveLength(SCATTER_SITES.length);
    expect(spec.table.headers).toEqual(['Site', 'Country', 'Status', 'Component 1', 'Component 2']);
  });

  it('computes the caveat and the axis labels from the projection, never from typed numbers', () => {
    expect(projectionCaveat(0.32993314)).toBe('The plane shows 33% of the variation, so near here does not mean similar in sound.');
    const spec = scatterSpec(SCATTER);
    expect(spec.notes).toEqual(['The plane shows 33% of the variation, so near here does not mean similar in sound.']);
    const options = spec.build(640);
    expect((options.x as { label: string }).label).toBe('COMPONENT 1 · 18% OF VARIANCE');
    expect((options.y as { label: string }).label).toBe('COMPONENT 2 · 15%');
    expect(options.aspectRatio).toBe(1);
    // A different projection gives different words.
    const other = scatterSpec({ ...SCATTER, explained: [0.5, 0.25], cumulative: 0.75 });
    expect(other.notes?.[0]).toContain('75%');
    expect((other.build(640).x as { label: string }).label).toBe('COMPONENT 1 · 50% OF VARIANCE');
  });

  it('draws 20 px status marks with an ink outline, one titled mark per site, and never fills with the accent', () => {
    const { container } = render(<StripPlot spec={scatterSpec(SCATTER)} />);
    expect(container.querySelectorAll('svg title')).toHaveLength(SCATTER_SITES.length);
    const healthy = container.querySelectorAll('svg path[fill="var(--dir-hab-healthy)"]');
    expect(healthy.length).toBeGreaterThan(0);
    // Healthy radius is 7/16 of the 20 px side.
    expect(Number(/^M(-?[\d.]+)/.exec(healthy[0].getAttribute('d') ?? '')?.[1])).toBeCloseTo(8.75, 1);
    expect(container.querySelector('svg [stroke="var(--dir-mark-outline)"]')).not.toBeNull();
    expect(container.querySelector('svg [fill="var(--dir-accent)"]')).toBeNull();
    // The accent appears nowhere with nothing selected.
    expect(container.querySelector('svg [stroke="var(--dir-accent)"]')).toBeNull();
  });

  it('prints the axis labels, the zero lines and the country names at 24 px with a 6 px panel halo', () => {
    const { container } = render(<StripPlot spec={scatterSpec(SCATTER)} />);
    const texts = Array.from(container.querySelectorAll('svg text')).map((node) => node.textContent);
    expect(texts).toEqual(expect.arrayContaining(['COMPONENT 1 · 18% OF VARIANCE', 'COMPONENT 2 · 15%', 'Indonesia', 'Kenya', 'Australia']));
    expect(container.querySelectorAll('svg g[stroke="var(--dir-rule)"]').length).toBeGreaterThanOrEqual(2);
    const halo = container.querySelector('svg g[paint-order="stroke"][stroke="var(--dir-panel)"][stroke-width="6"]');
    expect(halo).not.toBeNull();
    expect(halo!.getAttribute('font-size')).toBe('24');
    expect(halo!.getAttribute('font-family')).toBe('var(--dir-font-display)');
    expect(halo!.getAttribute('font-style')).toBe('var(--display-style)');
  });

  it('rings the selected site in the accent (3 px, 44 px across), enlarges it to 24 px and sets its id at 24 px', () => {
    const { container } = render(<StripPlot spec={scatterSpec({ ...SCATTER, selectedId: 'ind_H1' })} />);
    const rings = container.querySelectorAll('svg circle[stroke="var(--dir-accent)"]');
    expect(rings).toHaveLength(1);
    expect(rings[0].getAttribute('r')).toBe('22');
    expect(rings[0].closest('[stroke-width]')?.getAttribute('stroke-width')).toBe('3');
    expect(rings[0].closest('[fill]')?.getAttribute('fill')).toBe('none');

    const idLabel = Array.from(container.querySelectorAll('svg text')).find((node) => node.textContent === 'ind_H1');
    expect(idLabel?.closest('[font-size]')?.getAttribute('font-size')).toBe('24');
    expect(idLabel?.closest('[font-family]')?.getAttribute('font-family')).toBe('var(--dir-font-data)');

    const selected = Array.from(container.querySelectorAll('svg path')).find((node) => node.querySelector('title')?.textContent?.startsWith('ind_H1 '));
    expect(Number(/^M(-?[\d.]+)/.exec(selected?.getAttribute('d') ?? '')?.[1])).toBeCloseTo(10.5, 1);
    // Still no accent fill: the ring is an outline.
    expect(container.querySelector('svg [fill="var(--dir-accent)"]')).toBeNull();
  });

  it('labels extra sites only when asked, and prints the caveat beside the figure', () => {
    const plain = render(<StripPlot spec={scatterSpec(SCATTER)} />);
    const before = plain.container.querySelectorAll('svg text').length;
    plain.unmount();
    const { container } = render(<StripPlot spec={scatterSpec({ ...SCATTER, labelIds: ['aus_D1'] })} />);
    expect(container.querySelectorAll('svg text').length).toBe(before + 1);
    expect(screen.getByText('The plane shows 33% of the variation, so near here does not mean similar in sound.')).toBeInTheDocument();
  });

  it('no sites: the empty state, no svg', () => {
    const spec = scatterSpec({ ...SCATTER, sites: [] });
    expect(spec.caption).toBe('No reference sites with projection coordinates.');
    const { container } = render(<StripPlot spec={spec} />);
    expect(screen.getByText('No values to plot.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
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
