import * as Plot from '@observablehq/plot';
import { descending } from 'd3-array';
import { format } from 'd3-format';
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

/** Shared look: inherit the page font, 12px labels, tabular numerals, transparent background, no motion. */
export const PLOT_STYLE = {
  background: 'transparent',
  color: TEXT_COLOR,
  fontFamily: 'inherit',
  fontSize: '12px',
  fontVariantNumeric: 'tabular-nums',
  overflow: 'visible',
} as const;

export interface ProbabilityBarsOptions {
  /** Visible figure caption. */
  caption: string;
  /** What the svg shows, for assistive tech. Defaults to "Class probabilities, bar chart". */
  ariaLabel?: string;
}

interface BarDatum {
  status: ReefStatus;
  word: string;
  /** Normalised probability in [0, 1]: the bar length. */
  share: number;
  /** Integer percentage from toIntegerPercentages: the label. */
  percent: number;
}

/** Sentence-style join: first item keeps its capital, the rest start lowercase ("Degraded 62%, healthy 25%"). */
function describe(data: BarDatum[]): string {
  return data
    .map((d, i) => {
      const word = i === 0 ? d.word : d.word.charAt(0).toLowerCase() + d.word.slice(1);
      return `${word} ${d.percent}%`;
    })
    .join(', ');
}

/**
 * Horizontal probability bars: categories ordered by raw probability
 * descending, x domain [0, 1] from zero with d3-format percent ticks, fills
 * from STATUS_COLORS, labels from toIntegerPercentages.
 */
export function probabilityBars(
  probabilities: Partial<Record<ReefStatus, number>> | null | undefined,
  options: ProbabilityBarsOptions
): FigureSpec {
  const entries = Object.entries(probabilities ?? {}) as [ReefStatus, number][];
  const percents = toIntegerPercentages<ReefStatus>(probabilities ?? {});
  const sum = entries.reduce((acc, [, v]) => acc + (v ?? 0), 0);

  const data: BarDatum[] = entries
    .map(([status, value]) => ({
      status,
      word: STATUS_WORDS[status] ?? status,
      share: sum > 0 ? (value ?? 0) / sum : 0,
      percent: percents[status] ?? 0,
      raw: value ?? 0,
    }))
    .sort((a, b) => descending(a.raw, b.raw))
    .map(({ status, word, share, percent }) => ({ status, word, share, percent }));

  const build = (width: number): Plot.PlotOptions => ({
    width,
    height: 36 + data.length * 32,
    marginLeft: 120,
    marginRight: 44,
    style: PLOT_STYLE,
    x: {
      domain: [0, 1],
      ticks: [0, 0.25, 0.5, 0.75, 1],
      tickFormat: percentTick,
      label: null,
      grid: false,
    },
    y: { domain: data.map((d) => d.word), label: null, padding: 0.3 },
    color: {
      domain: data.map((d) => d.status),
      range: data.map((d) => STATUS_COLORS[d.status]),
    },
    marks: [
      Plot.ruleX([0, 0.25, 0.5, 0.75, 1], { stroke: RULE_COLOR, ariaHidden: 'true' }),
      Plot.barX(data, {
        x: 'share',
        y: 'word',
        fill: 'status',
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
    caption: options.caption,
    ariaLabel: options.ariaLabel ?? 'Class probabilities, bar chart',
    ariaDescription: describe(data),
    table: {
      headers: ['Class', 'Probability'],
      rows: data.map((d) => [d.word, `${d.percent}%`]),
    },
    build,
  };
}
