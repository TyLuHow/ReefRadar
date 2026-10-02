'use client';

import { useEffect, useRef, useState } from 'react';
import * as Plot from '@observablehq/plot';

/** Width used when the container cannot be measured (no ResizeObserver, or before the first measurement). */
const DEFAULT_WIDTH = 640;

export interface PlotTable {
  /** Column headers of the visually hidden data table. */
  headers: string[];
  /** One row of display strings per plotted value. */
  rows: string[][];
}

export interface PlotFigureProps {
  /** Visible caption (the <figcaption>); also names the hidden table. */
  caption: string;
  /** What the figure shows (root svg aria-label). */
  ariaLabel: string;
  /** The takeaway in words (root svg aria-description). */
  ariaDescription: string;
  /** The plotted values as text: the keyboard / screen-reader equivalent of the figure. */
  table: PlotTable;
  /** Builds the Plot options for a given pixel width. Keep the function identity stable (useMemo). */
  build: (width: number) => Plot.PlotOptions;
}

/**
 * Accessible Observable Plot figure (PLAT-02).
 *
 * - Client only: the SVG is created in an effect and appended into a ref, never rendered on the server.
 * - The node is removed in the effect cleanup; there are no transitions or entrance animations.
 * - Width follows the container through a ResizeObserver when the browser has one.
 * - Always a <figure> with a <figcaption> and a visually hidden <table> of the plotted values.
 * - No rows: the caption plus "No data to plot." and no SVG.
 */
export function PlotFigure({ caption, ariaLabel, ariaDescription, table, build }: PlotFigureProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const hasData = table.rows.length > 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (measured > 0) setWidth(measured);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [hasData]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasData) return;
    const node = Plot.plot({ ...build(width), ariaLabel, ariaDescription });
    host.append(node);
    return () => {
      node.remove();
    };
  }, [build, width, ariaLabel, ariaDescription, hasData]);

  return (
    <figure className="m-0">
      {hasData ? (
        <div ref={hostRef} className="w-full" />
      ) : (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No data to plot.
        </p>
      )}
      <figcaption className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {caption}
      </figcaption>
      {hasData && (
        <table className="sr-only">
          <caption>{caption}</caption>
          <thead>
            <tr>
              {table.headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
