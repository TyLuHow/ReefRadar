import * as Plot from '@observablehq/plot';
import { extent, range } from 'd3-array';
import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';
import { HABITAT_STATUSES, STATUS_LABELS, plotSymbol, statusColorVar, type HabitatStatus } from '@/features/ui/status-shapes';
import type { PlotTable } from './PlotFigure';
import {
  ACCENT,
  DISPLAY_STYLE,
  FONT_DATA,
  FONT_DISPLAY,
  INK,
  MARK_FILL_UNKNOWN,
  MARK_OUTLINE,
  PANEL,
  PLOT_TOKEN_STYLE,
  RULE,
} from './plot-theme';

/**
 * Pure spec builders for the three StripPlot variants (04-19, DS-05): `strip` (one row per status,
 * one mark per site), `paired` (a dumbbell for two recordings) and `scatter` (sites on the
 * projection plane). Each returns everything StripPlot needs: the Plot options builder, the table
 * of plotted values, the caption and the assistive text. Nothing here touches the DOM.
 *
 * Every mark is a status shape (the one geometry module, `plotSymbol`) painted with a
 * var(--dir-hab-*) token and outlined in ink. The accent never fills a mark: its only use is the
 * scatter's selected-site ring. Numbers shown come from the data passed in; the captions are
 * computed from it, never typed.
 *
 * The colour and radius scales are `identity`: a `var(--dir-*)` string passes through to the SVG
 * untouched (so a token change restyles a drawn plot with no rebuild) and a radius is a pixel size.
 * A mark of side S px is drawn with r = S / sqrt(pi), because a Plot dot's symbol area is r * r * pi
 * and `plotSymbol` maps the area's square root to the side of its 16-unit box.
 */

export interface StripPlotSpec {
  /** Builds the Plot options for a pixel width. The identity is stable per spec: memoise the spec. */
  build: (width: number) => Plot.PlotOptions;
  /** The plotted values as text: the keyboard and screen-reader path. */
  table: PlotTable;
  /** The figure caption, computed from the data. */
  caption: string;
  /** What the svg shows (root aria-label). */
  ariaLabel: string;
  /** The takeaway in words (root aria-description). */
  ariaDescription: string;
  /** Sentences printed under the caption (a footnote, or the projection caveat), always visible. */
  notes?: string[];
}

/** Side in pixels of the status marks in each variant (UI-SPEC "StripPlot"). */
export const STRIP_MARK_SIZE = 16;
export const SCATTER_MARK_SIZE = 20;
export const SELECTED_MARK_SIZE = 24;

const radiusFor = (side: number) => side / Math.sqrt(Math.PI);

const MINUS_FORMAT = format('.3f');
const DB_FORMAT = format('.1f');
const DB_TICK_FORMAT = format('.0f');
const AXIS_START_FORMAT = format('.4~g');
const TICK_FORMAT = format('.2~f');

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Paint props shared by every status mark: filled in its tone with the ink outline; unknown is the hollow ring. */
function markPaint(status: HabitatStatus) {
  return status === 'unknown'
    ? { fill: MARK_FILL_UNKNOWN, stroke: statusColorVar('unknown'), strokeWidth: 2.5 }
    : { fill: (_: unknown) => statusColorVar(status), stroke: MARK_OUTLINE, strokeWidth: 1 };
}

/** The status shape as a Plot symbol (the geometry module's object satisfies Plot's symbol interface). */
function symbolFor(status: HabitatStatus) {
  return plotSymbol(status) as unknown as Plot.SymbolType;
}

// ---------------------------------------------------------------------------
// Strip
// ---------------------------------------------------------------------------

export interface StripPoint {
  id: string;
  status: HabitatStatus;
  value: number;
}

export interface StripOptions {
  /** What the value is, for the caption ("Position on component 1 of the reference projection"). */
  measureLabel: string;
  /** The selected site: drawn at size 24 with a 2 px ink ring. */
  selectedId?: string;
  /** Forces the hover label (`{site} · {Status} · {value}`) for one site, for review. */
  hoverId?: string;
}

const ROW_HEIGHT = 84;
const STRIP_MARGIN = { top: 8, right: 24, bottom: 32, left: 160 } as const;

/**
 * One row per status (only statuses that have a site, in ordinal order), one mark per site, placed
 * on the measure axis with a deterministic dodge so every mark stays identifiable. Row labels carry
 * the computed count ("Degraded 15").
 */
export function stripSpec(points: readonly StripPoint[], options: StripOptions): StripPlotSpec {
  const { measureLabel, selectedId, hoverId } = options;
  const data = points.filter((point) => Number.isFinite(point.value));
  const counts: Partial<Record<HabitatStatus, number>> = {};
  for (const point of data) counts[point.status] = (counts[point.status] ?? 0) + 1;
  const rows = HABITAT_STATUSES.filter((status) => (counts[status] ?? 0) > 0);

  const valueText = (point: StripPoint) => MINUS_FORMAT(point.value);
  const hoverText = (point: StripPoint) => `${point.id} · ${STATUS_LABELS[point.status]} · ${valueText(point)}`;

  const table: PlotTable = {
    headers: ['Site', 'Status', 'Value'],
    rows: data.map((point) => [point.id, STATUS_LABELS[point.status], valueText(point)]),
  };

  // The x axis: a nice domain around the data, or a window around the single value with no axis at all.
  const [lo, hi] = extent(data, (point) => point.value);
  const single = data.length === 1;
  let domain: [number, number] = [0, 1];
  if (lo !== undefined && hi !== undefined) {
    domain = single || lo === hi ? [lo - 1, hi + 1] : (scaleLinear().domain([lo, hi]).nice().domain() as [number, number]);
  }
  const includesZero = domain[0] <= 0 && domain[1] >= 0;

  let caption: string;
  if (data.length === 0) {
    caption = `${measureLabel}: no reference sites selected.`;
  } else if (single) {
    caption = `One value: ${data[0].id} ${lowerFirst(measureLabel)} ${valueText(data[0])}.`;
  } else {
    caption = `${measureLabel} for ${data.length} reference sites, one mark per site.`;
    if (data.length > 1 && !includesZero) caption += ` Axis starts at ${AXIS_START_FORMAT(domain[0])}, not zero.`;
  }

  const rowSummary = rows.map((status) => `${STATUS_LABELS[status]} ${counts[status]}`).join(', ');

  const sizeOf = (point: StripPoint) => radiusFor(point.id === selectedId ? SELECTED_MARK_SIZE : STRIP_MARK_SIZE);
  const dodge = { anchor: 'middle', padding: 1, x: 'value', fy: 'status', r: sizeOf } as const;

  const build = (width: number): Plot.PlotOptions => {
    const marks: Plot.Markish[] = [];
    if (data.length > 1 && includesZero) marks.push(Plot.ruleX([0], { stroke: RULE, strokeWidth: 1, clip: true }));

    for (const status of rows) {
      marks.push(
        Plot.dot(
          data.filter((point) => point.status === status),
          Plot.dodgeY({ ...dodge, symbol: symbolFor(status), title: hoverText, ...markPaint(status) }),
        ),
      );
    }

    // The ring and the forced hover label are laid out by the same dodge over the same data, so they
    // sit exactly on their mark; every other site draws nothing in these layers.
    if (selectedId !== undefined && data.some((point) => point.id === selectedId)) {
      marks.push(
        Plot.dot(
          data,
          Plot.dodgeY({ ...dodge, fill: 'none', stroke: (point: StripPoint) => (point.id === selectedId ? INK : 'none'), strokeWidth: 2 }),
        ),
      );
    }
    if (hoverId !== undefined && data.some((point) => point.id === hoverId)) {
      marks.push(
        Plot.text(
          data,
          Plot.dodgeY({
            ...dodge,
            text: (point: StripPoint) => (point.id === hoverId ? hoverText(point) : null),
            dy: -(radiusFor(SELECTED_MARK_SIZE) + 8),
            lineAnchor: 'bottom',
            textAnchor: 'middle',
            fontFamily: FONT_DATA,
            fontSize: 12,
            fill: INK,
            stroke: PANEL,
            strokeWidth: 4,
          }),
        ),
      );
    }

    return {
      width,
      height: STRIP_MARGIN.top + STRIP_MARGIN.bottom + Math.max(1, rows.length) * ROW_HEIGHT,
      marginTop: STRIP_MARGIN.top,
      marginRight: STRIP_MARGIN.right,
      marginBottom: single ? 8 : STRIP_MARGIN.bottom,
      marginLeft: STRIP_MARGIN.left,
      style: PLOT_TOKEN_STYLE,
      color: { type: 'identity' },
      r: { type: 'identity' },
      x: { domain, axis: single ? null : 'bottom', label: null, tickFormat: TICK_FORMAT, inset: 16 },
      fy: {
        domain: rows,
        label: null,
        padding: 0,
        tickSize: 0,
        tickFormat: (status: HabitatStatus) => `${STATUS_LABELS[status]} ${counts[status] ?? 0}`,
      },
      marks,
    };
  };

  return {
    build,
    table,
    caption,
    ariaLabel: `${measureLabel}, strip plot by habitat status`,
    ariaDescription: rowSummary,
  };
}

// ---------------------------------------------------------------------------
// Paired (dumbbell)
// ---------------------------------------------------------------------------

export interface PairedSide {
  siteId: string;
  status: HabitatStatus;
  /** Mean band levels in dB re full scale of the file, one per band, in `bands` order. */
  levels: readonly number[];
}

export interface PairedInput {
  a: PairedSide;
  b: PairedSide;
  /** Band labels, for example "0 to 1 kHz". */
  bands: readonly string[];
  /** Length in seconds of each of the two excerpts, for the footnote. */
  durationS: number;
}

const PAIRED_ROW_HEIGHT = 56;

/**
 * A dumbbell: one row per band, A's and B's status shapes at 24 px joined by a 5 px ink bar over a
 * 1 px rule baseline, the two levels in a right column, an x axis ticked every 5 dB. The levels are
 * the caller's (computed from the two real recordings with the same STFT); the footnote limits the
 * claim to the two clips.
 */
export function pairedSpec({ a, b, bands, durationS }: PairedInput): StripPlotSpec {
  if (a.levels.length !== bands.length || b.levels.length !== bands.length) {
    throw new RangeError('Each side needs exactly one level per band.');
  }
  const rows = bands.map((band, index) => ({ band, a: a.levels[index], b: b.levels[index] }));
  const [lo, hi] = extent(rows.flatMap((row) => [row.a, row.b]));
  const min = Math.floor(((lo ?? 0) - 1) / 5) * 5;
  const max = Math.ceil(((hi ?? 0) + 1) / 5) * 5;
  const ticks = range(min, max + 1, 5);

  const side = radiusFor(SELECTED_MARK_SIZE);
  const levelsText = (row: { a: number; b: number }) => `${DB_FORMAT(row.a)} / ${DB_FORMAT(row.b)} dB`;

  const table: PlotTable = {
    headers: ['Band', `A · ${a.siteId} (dB)`, `B · ${b.siteId} (dB)`],
    rows: rows.map((row) => [row.band, DB_FORMAT(row.a), DB_FORMAT(row.b)]),
  };

  const dots = (which: 'a' | 'b', side_: PairedSide) =>
    Plot.dot(rows, {
      x: which,
      y: 'band',
      r: side,
      symbol: symbolFor(side_.status),
      title: (row: (typeof rows)[number]) => `${which.toUpperCase()} · ${side_.siteId} · ${row.band} · ${DB_FORMAT(row[which])} dB`,
      ...markPaint(side_.status),
    });

  const build = (width: number): Plot.PlotOptions => ({
    width,
    height: 28 + 52 + rows.length * PAIRED_ROW_HEIGHT,
    marginTop: 28,
    marginRight: 168,
    marginBottom: 52,
    marginLeft: 96,
    style: PLOT_TOKEN_STYLE,
    color: { type: 'identity' },
    r: { type: 'identity' },
    x: { domain: [min, max], ticks, tickFormat: (value: number) => DB_TICK_FORMAT(value), label: 'dB re full scale (uncalibrated)', labelAnchor: 'center', labelArrow: 'none' },
    y: { type: 'point', domain: [...bands], padding: 0.5, label: null, tickSize: 0 },
    marks: [
      Plot.ruleY(rows, { y: 'band', stroke: RULE, strokeWidth: 1 }),
      Plot.link(rows, { x1: 'a', x2: 'b', y1: 'band', y2: 'band', stroke: INK, strokeWidth: 5, strokeLinecap: 'butt' }),
      dots('a', a),
      dots('b', b),
      Plot.text(rows, { x: 'a', y: 'band', text: () => 'A', dy: -(side + 6), fontFamily: FONT_DATA, fontSize: 12, fill: INK }),
      Plot.text(rows, { x: 'b', y: 'band', text: () => 'B', dy: -(side + 6), fontFamily: FONT_DATA, fontSize: 12, fill: INK }),
      Plot.text(rows, { y: 'band', frameAnchor: 'right', textAnchor: 'start', dx: 24, text: levelsText, fontFamily: FONT_DATA, fontSize: 14, fill: INK }),
    ],
  });

  return {
    build,
    table,
    caption: `A · ${a.siteId} and B · ${b.siteId}: mean level in each of ${bands.length} frequency bands.`,
    ariaLabel: `Mean level in each frequency band for ${a.siteId} (A) and ${b.siteId} (B), paired dot plot`,
    ariaDescription: rows.map((row) => `${row.band}: A ${DB_FORMAT(row.a)}, B ${DB_FORMAT(row.b)} dB`).join('; '),
    notes: [
      `Mean level in each band over these two ${durationS}-second excerpts, in dB re full scale of each file (uncalibrated). One excerpt per site; this describes two clips, not a finding about the sites.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Scatter (sites on the projection plane)
// ---------------------------------------------------------------------------

export interface ScatterSite {
  id: string;
  status: HabitatStatus;
  country: string;
  x: number;
  y: number;
}

export interface ScatterInput {
  /** Only sites that have projection coordinates; the caption says how many. */
  sites: readonly ScatterSite[];
  /** The projection's explained variance ratio for components 1 and 2 (0 to 1). */
  explained: readonly [number, number];
  /** The projection's cumulative explained variance ratio (0 to 1). */
  cumulative: number;
  /** The selected site: a 24 px mark, a 3 px accent ring 44 px across and its id on the plot. */
  selectedId?: string;
  /** Further site ids to label on the plot (the selected site and country names are always labelled). */
  labelIds?: readonly string[];
}

const percent = (ratio: number) => Math.round(ratio * 100);
const COORDINATE_FORMAT = format('.3f');
const RING_RADIUS = 22;
const SCATTER_MARGIN = { top: 16, right: 24, bottom: 44, left: 56 } as const;

/** The projection's own caveat, computed from its cumulative explained variance (never typed). */
export function projectionCaveat(cumulative: number): string {
  return `The plane shows ${percent(cumulative)}% of the variation, so near here does not mean similar in sound.`;
}

function padded(values: number[]): [number, number] {
  const [lo, hi] = extent(values);
  if (lo === undefined || hi === undefined) return [-1, 1];
  const pad = Math.max((hi - lo) * 0.08, 0.05);
  return [lo - pad, hi + pad];
}

/**
 * Sites on the first two components of the embedding projection: 20 px status marks with an ink
 * outline, zero lines in the rule colour, country names at each country's centroid, the selected
 * site ringed in the accent with its id set on the plot. The scale is equal on both axes (one unit
 * is the same distance in x and y) so plane distances are not distorted; the caveat says the plane
 * is still a partial view.
 */
export function scatterSpec({ sites, explained, cumulative, selectedId, labelIds = [] }: ScatterInput): StripPlotSpec {
  const selected = sites.find((site) => site.id === selectedId);
  const labelled = sites.filter((site) => labelIds.includes(site.id) && site.id !== selectedId);
  const present = HABITAT_STATUSES.filter((status) => sites.some((site) => site.status === status));

  const byCountry = new Map<string, { x: number; y: number; count: number }>();
  for (const site of sites) {
    const entry = byCountry.get(site.country) ?? { x: 0, y: 0, count: 0 };
    entry.x += site.x;
    entry.y += site.y;
    entry.count += 1;
    byCountry.set(site.country, entry);
  }
  const centroids = Array.from(byCountry, ([country, sum]) => ({ country, x: sum.x / sum.count, y: sum.y / sum.count }));

  const table: PlotTable = {
    headers: ['Site', 'Country', 'Status', 'Component 1', 'Component 2'],
    rows: sites.map((site) => [site.id, site.country, STATUS_LABELS[site.status], COORDINATE_FORMAT(site.x), COORDINATE_FORMAT(site.y)]),
  };

  const sizeOf = (site: ScatterSite) => radiusFor(site.id === selectedId ? SELECTED_MARK_SIZE : SCATTER_MARK_SIZE);
  const caveat = projectionCaveat(cumulative);

  const build = (width: number): Plot.PlotOptions => {
    const marks: Plot.Markish[] = [
      Plot.ruleX([0], { stroke: RULE, strokeWidth: 1, clip: true }),
      Plot.ruleY([0], { stroke: RULE, strokeWidth: 1, clip: true }),
      Plot.text(centroids, {
        x: 'x',
        y: 'y',
        text: 'country',
        textAnchor: 'middle',
        fontFamily: FONT_DISPLAY,
        fontStyle: DISPLAY_STYLE,
        fontSize: 24,
        fill: INK,
        stroke: PANEL,
        strokeWidth: 6,
        paintOrder: 'stroke',
      }),
    ];
    for (const status of present) {
      marks.push(
        Plot.dot(
          sites.filter((site) => site.status === status),
          {
            x: 'x',
            y: 'y',
            r: sizeOf,
            symbol: symbolFor(status),
            title: (site: ScatterSite) => `${site.id} · ${STATUS_LABELS[site.status]} · ${site.country}`,
            ...markPaint(status),
          },
        ),
      );
    }
    if (labelled.length > 0) {
      marks.push(
        Plot.text(labelled, {
          x: 'x',
          y: 'y',
          text: 'id',
          dy: -(radiusFor(SCATTER_MARK_SIZE) + 8),
          fontFamily: FONT_DATA,
          fontSize: 12,
          fill: INK,
          stroke: PANEL,
          strokeWidth: 4,
        }),
      );
    }
    if (selected) {
      marks.push(
        Plot.dot([selected], { x: 'x', y: 'y', r: RING_RADIUS, fill: 'none', stroke: ACCENT, strokeWidth: 3 }),
        Plot.text([selected], {
          x: 'x',
          y: 'y',
          text: 'id',
          dx: -(RING_RADIUS + 8),
          textAnchor: 'end',
          fontFamily: FONT_DATA,
          fontSize: 24,
          fill: INK,
          stroke: PANEL,
          strokeWidth: 6,
        }),
      );
    }

    return {
      width,
      marginTop: SCATTER_MARGIN.top,
      marginRight: SCATTER_MARGIN.right,
      marginBottom: SCATTER_MARGIN.bottom,
      marginLeft: SCATTER_MARGIN.left,
      aspectRatio: 1,
      style: PLOT_TOKEN_STYLE,
      color: { type: 'identity' },
      r: { type: 'identity' },
      x: {
        domain: padded(sites.map((site) => site.x)),
        ticks: [],
        tickSize: 0,
        label: `COMPONENT 1 · ${percent(explained[0])}% OF VARIANCE`,
        labelAnchor: 'center',
        labelArrow: 'none',
      },
      y: {
        domain: padded(sites.map((site) => site.y)),
        ticks: [],
        tickSize: 0,
        label: `COMPONENT 2 · ${percent(explained[1])}%`,
        labelAnchor: 'center',
        labelArrow: 'none',
      },
      marks,
    };
  };

  const count = sites.length;
  return {
    build,
    table,
    caption:
      count === 0
        ? 'No reference sites with projection coordinates.'
        : `${count} reference ${count === 1 ? 'site' : 'sites'} with projection coordinates, one mark per site.`,
    ariaLabel: 'Reference sites on the first two components of the embedding projection, scatter plot',
    ariaDescription: `${caveat} ${present.map((status) => `${STATUS_LABELS[status]} ${sites.filter((site) => site.status === status).length}`).join(', ')}.`,
    notes: [caveat],
  };
}
