import * as Plot from '@observablehq/plot';
import { descending, extent } from 'd3-array';
import { format } from 'd3-format';
import { scaleLinear } from 'd3-scale';
import { curveMonotoneX } from 'd3-shape';
import { toIntegerPercentages } from '@/lib/probabilities';
import { STATUS_COLORS, type ReefStatus } from '@/types';
import type { PlotFigureProps } from './PlotFigure';

/**
 * Honest-axis Plot option builders (PLAT-02).
 *
 * Each builder returns everything PlotFigure needs (caption, aria text, hidden
 * table, build function) so a figure is always accessible by construction.
 * Percentages shown to the user come only from toIntegerPercentages; the
 * probability axis is fixed to [0, 1] from a zero baseline and never rescaled.
 */

export type FigureSpec = PlotFigureProps;

/** Status wording used in labels and aria text (matches the results components). */
const STATUS_WORDS: Record<ReefStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  restored_early: 'Restored (early)',
  restored_mid: 'Restored (mid)',
  unknown: 'Unknown',
};

const RULE_COLOR = 'rgba(229,225,219,0.1)';
const TEXT_COLOR = 'var(--text-secondary)';
const percentTick = format('.0%');
const PROBABILITY_TICKS = [0, 0.25, 0.5, 0.75, 1];
/** How many categories a probability figure draws before it truncates and says so. */
const DEFAULT_CUTOFF = 12;

/** Shared look: inherit the page font, 12px labels, tabular numerals, transparent background, no motion. */
export const PLOT_STYLE = {
  background: 'transparent',
  color: TEXT_COLOR,
  fontFamily: 'inherit',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  overflow: 'visible',
} as const;

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "snake_case_key" to "Snake case key" for categories that are not reef statuses. */
function fallbackWord(key: string): string {
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ---------------------------------------------------------------------------
// Probability bars
// ---------------------------------------------------------------------------

export interface ProbabilityBarsOptions {
  /** Visible figure caption. */
  caption: string;
  /** What the svg shows, for assistive tech. Defaults to "Class probabilities, bar chart". */
  ariaLabel?: string;
  /** Draw at most this many categories (the largest); the caption states the cutoff. Default 12. */
  cutoff?: number;
}

interface BarDatum {
  key: string;
  word: string;
  /** Normalised probability in [0, 1] over ALL categories: the bar length. */
  share: number;
  /** Integer percentage from toIntegerPercentages over ALL categories: the label. */
  percent: number;
  raw: number;
}

function wordFor(key: string): string {
  return key in STATUS_WORDS ? STATUS_WORDS[key as ReefStatus] : fallbackWord(key);
}

function colorFor(key: string): string {
  return (STATUS_COLORS as Record<string, string>)[key] ?? STATUS_COLORS.unknown;
}

/**
 * Horizontal probability bars: categories ordered by raw probability
 * descending, x domain [0, 1] from zero with d3-format percent ticks, fills
 * from STATUS_COLORS, labels from toIntegerPercentages. Percentages are
 * computed over every category before any truncation, so a cut-off never
 * re-rounds the values that remain.
 */
export function probabilityBars(
  probabilities: Partial<Record<string, number>> | null | undefined,
  options: ProbabilityBarsOptions
): FigureSpec {
  const finite: Record<string, number> = {};
  for (const [key, value] of Object.entries(probabilities ?? {})) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) finite[key] = value;
  }
  const percents = toIntegerPercentages<string>(finite);
  const sum = Object.values(finite).reduce((acc, v) => acc + v, 0);

  const all: BarDatum[] = Object.entries(finite)
    .map(([key, raw]) => ({
      key,
      word: wordFor(key),
      share: sum > 0 ? raw / sum : 0,
      percent: percents[key] ?? 0,
      raw,
    }))
    .sort((a, b) => descending(a.raw, b.raw));

  const cutoff = Math.max(1, Math.floor(options.cutoff ?? DEFAULT_CUTOFF));
  const data = all.slice(0, cutoff);
  const truncated = all.length > data.length;
  const caption = truncated
    ? `${options.caption.replace(/\.\s*$/, '')}. Showing the top ${data.length} of ${all.length}.`
    : options.caption;

  const description = data
    .map((d, i) => `${i === 0 ? d.word : lowerFirst(d.word)} ${d.percent}%`)
    .join(', ');

  const build = (width: number): Plot.PlotOptions => ({
    width,
    height: 36 + data.length * 32,
    marginLeft: 120,
    marginRight: 44,
    style: PLOT_STYLE,
    x: {
      domain: [0, 1],
      ticks: PROBABILITY_TICKS,
      tickFormat: percentTick,
      label: null,
      grid: false,
    },
    y: { domain: data.map((d) => d.word), label: null, padding: 0.3 },
    color: {
      domain: data.map((d) => d.key),
      range: data.map((d) => colorFor(d.key)),
    },
    marks: [
      Plot.ruleX(PROBABILITY_TICKS, { stroke: RULE_COLOR, ariaHidden: 'true' }),
      Plot.barX(data, {
        x: 'share',
        y: 'word',
        fill: 'key',
        ariaLabel: (d: BarDatum) => `${d.word}: ${d.percent}%`,
      }),
      Plot.text(data, {
        x: 'share',
        y: 'word',
        text: (d: BarDatum) => `${d.percent}%`,
        textAnchor: 'start',
        dx: 6,
        fill: TEXT_COLOR,
        ariaHidden: 'true',
      }),
    ],
  });

  return {
    caption,
    ariaLabel: options.ariaLabel ?? 'Class probabilities, bar chart',
    ariaDescription: description,
    table: {
      headers: ['Class', 'Probability'],
      rows: data.map((d) => [d.word, `${d.percent}%`]),
    },
    build,
  };
}

// ---------------------------------------------------------------------------
// Series line
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  x: number;
  y: number;
}

export interface SeriesLineOptions {
  /** Visible figure caption. */
  caption: string;
  /** What x measures (axis label, datum labels, table header). */
  xLabel: string;
  /** What y measures (axis label, table header). */
  yLabel: string;
  /** d3-format specifier for x values. Default ",". */
  xFormat?: string;
  /** d3-format specifier for y values. Default ",~g". */
  yFormat?: string;
  /** What the svg shows, for assistive tech. Defaults to "{yLabel} by {xLabel}, line chart". */
  ariaLabel?: string;
}

/**
 * Line chart for a numeric series. The y axis always includes zero (no
 * truncated axis) and ends on a d3-scale nice() bound; x ticks use d3-format;
 * the line uses a d3-shape curve factory and every point is a labelled dot.
 */
export function seriesLine(points: SeriesPoint[] | null | undefined, options: SeriesLineOptions): FigureSpec {
  const data = (points ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const formatX = format(options.xFormat ?? ',');
  const formatY = format(options.yFormat ?? ',~g');

  const [yMin = 0, yMax = 0] = extent(data, (p) => p.y);
  const lower = Math.min(0, yMin);
  const upper = Math.max(0, yMax);
  const yDomain = scaleLinear()
    .domain([lower, upper === lower ? lower + 1 : upper])
    .nice()
    .domain();

  const build = (width: number): Plot.PlotOptions => ({
    width,
    height: 260,
    marginLeft: 48,
    marginBottom: 36,
    style: PLOT_STYLE,
    x: { label: options.xLabel, tickFormat: formatX },
    y: { domain: yDomain, label: options.yLabel, tickFormat: formatY, grid: false },
    marks: [
      Plot.ruleY(yDomain, { stroke: RULE_COLOR, ariaHidden: 'true' }),
      ...(data.length > 1
        ? [Plot.line(data, { x: 'x', y: 'y', curve: curveMonotoneX, stroke: TEXT_COLOR, strokeWidth: 1.5, ariaHidden: 'true' })]
        : []),
      Plot.dot(data, {
        x: 'x',
        y: 'y',
        r: 3,
        fill: TEXT_COLOR,
        ariaLabel: (p: SeriesPoint) => `${options.xLabel} ${formatX(p.x)}: ${formatY(p.y)}`,
      }),
    ],
  });

  const description =
    data.length === 0
      ? ''
      : data.length === 1
        ? `One point: ${options.xLabel} ${formatX(data[0]!.x)}, ${options.yLabel} ${formatY(data[0]!.y)}`
        : `${data.length} points; ${options.yLabel} from ${formatY(yMin)} to ${formatY(yMax)}`;

  return {
    caption: options.caption,
    ariaLabel: options.ariaLabel ?? `${options.yLabel} by ${options.xLabel}, line chart`,
    ariaDescription: description,
    table: {
      headers: [options.xLabel, options.yLabel],
      rows: data.map((p) => [formatX(p.x), formatY(p.y)]),
    },
    build,
  };
}
