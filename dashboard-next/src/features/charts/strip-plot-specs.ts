import * as Plot from '@observablehq/plot';
import { extent } from 'd3-array';
import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';
import { HABITAT_STATUSES, STATUS_LABELS, plotSymbol, statusColorVar, type HabitatStatus } from '@/features/ui/status-shapes';
import type { PlotTable } from './PlotFigure';
import { FONT_DATA, INK, MARK_FILL_UNKNOWN, MARK_OUTLINE, PANEL, PLOT_TOKEN_STYLE, RULE } from './plot-theme';

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
