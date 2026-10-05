/**
 * Chart feature module (PLAT-02): Observable Plot plus the individual d3 modules.
 *
 * Plot's chunk is about 241 KB, so consumers must load PlotFigure through
 * `next/dynamic` with `ssr: false` (and keep the figure spec memoised) to keep
 * Plot off unrelated routes:
 *
 *   const PlotFigure = dynamic(() => import('@/features/charts').then((m) => m.PlotFigure), { ssr: false });
 *   const spec = useMemo(() => probabilityBars(probabilities, { caption }), [probabilities]);
 *   <PlotFigure {...spec} />
 */
export { PlotFigure } from './PlotFigure';
export type { PlotFigureProps, PlotTable } from './PlotFigure';
export { probabilityBars, seriesLine, PLOT_STYLE } from './encodings';
export type { FigureSpec, ProbabilityBarsOptions, SeriesLineOptions, SeriesPoint } from './encodings';

// 04-19: StripPlot (strip, paired and scatter) and its token Plot theme. Consumers load StripPlot through
// `next/dynamic` with `ssr: false` (it pulls Plot), and keep the spec from stripSpec, pairedSpec or scatterSpec memoised:
//   const StripPlot = dynamic(() => import('@/features/charts').then((m) => m.StripPlot), { ssr: false });
export { StripPlot } from './StripPlot';
export type { StripPlotProps, StripPlotState } from './StripPlot';
export { stripSpec } from './strip-plot-specs';
export type { StripPlotSpec, StripPoint, StripOptions } from './strip-plot-specs';
export { PLOT_TOKEN_STYLE, RULE, INK, ACCENT } from './plot-theme';
