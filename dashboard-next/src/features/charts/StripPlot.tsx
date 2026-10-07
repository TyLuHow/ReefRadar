'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import * as Plot from '@observablehq/plot';
import { Button } from '@/features/ui/Button';
import { EmptyState } from '@/features/ui/EmptyState';
import { ErrorState } from '@/features/ui/ErrorState';
import { LoadingState } from '@/features/ui/LoadingState';
import { Skeleton } from '@/features/ui/Skeleton';
import type { StripPlotSpec } from './strip-plot-specs';

/** Width used when the container cannot be measured (no ResizeObserver, or before the first measurement). */
const DEFAULT_WIDTH = 640;

export type StripPlotState = 'loading' | 'empty' | 'error';

export interface StripPlotProps {
  /** From `stripSpec`, `pairedSpec` or `scatterSpec`. Memoise it: a new spec redraws the plot. */
  spec?: StripPlotSpec;
  /**
   * Forces a state. With a spec that has no values the plot is empty on its own; `error` is also
   * what a failed draw becomes, and it keeps the table. Without a spec the plot is loading.
   */
  state?: StripPlotState;
  /**
   * Selects a site by id. Marks are not focusable, so a pointer click on a mark has a keyboard-operable
   * equivalent in the same view: a Select button on every row of the table. Omit it and a plot is not a control.
   */
  onSelect?: (id: string) => void;
  /** Height in pixels reserved by the loading skeleton, so nothing shifts when the figure arrives. */
  loadingHeight?: number;
  className?: string;
}

/** The id a mark's native tooltip names: the text before the first " · ". */
function idFromTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  return title.split(' · ')[0] || null;
}

/**
 * StripPlot (DS-05, 04-19): an accessible Observable Plot figure for the strip, paired and scatter
 * variants. A `<figure>` with a `<figcaption>`, the spec's notes (a footnote or the projection
 * caveat) printed under it, and a visible "Show as table" disclosure that lists the plotted values:
 * the table, not the marks, is the keyboard path. Marks are not focusable.
 *
 * Client only: the SVG is created in an effect, appended into a ref and removed on cleanup; there is
 * no transition. Width follows the container through a ResizeObserver. Plot's chunk is large, so
 * consumers load this component with `next/dynamic` and `ssr: false`.
 */
export function StripPlot({ spec, state, onSelect, loadingHeight = 220, className }: StripPlotProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [tableOpen, setTableOpen] = useState(false);
  const [failedSpec, setFailedSpec] = useState<StripPlotSpec | null>(null);
  const tableId = useId();

  const hasValues = spec !== undefined && spec.table.rows.length > 0;
  const drawFailed = spec !== undefined && failedSpec === spec;
  const effective: StripPlotState | undefined =
    state ?? (spec === undefined ? 'loading' : !hasValues ? 'empty' : drawFailed ? 'error' : undefined);
  const drawable = spec !== undefined && hasValues && effective === undefined;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (measured > 0) setWidth(measured);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [drawable]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !spec || !drawable) return;
    let node: Element | null = null;
    try {
      node = Plot.plot({ ...spec.build(width), ariaLabel: spec.ariaLabel, ariaDescription: spec.ariaDescription });
    } catch {
      // A draw that throws becomes the error state; the state is set from a microtask so the effect body
      // itself stays free of synchronous setState (a failed draw is an external result, not derived state).
      queueMicrotask(() => setFailedSpec(spec));
      return;
    }
    // The figure is one image to assistive tech (UI-SPEC: role="img" plus the caption); the table is the
    // detail. Plot labels each mark group ("dot", "rule", "text") with an aria-label on a role-less <g>,
    // which ARIA prohibits, so those labels are dropped and the root carries the name and description.
    node.setAttribute('role', 'img');
    node.querySelectorAll('[aria-label]').forEach((child) => child.removeAttribute('aria-label'));
    host.append(node);
    return () => {
      node?.remove();
    };
  }, [spec, width, drawable]);

  if (effective === 'loading') {
    return (
      <div className={className}>
        <LoadingState label="Loading plot…">
          <div style={{ height: loadingHeight }}>
            <Skeleton on="panel" className="h-full w-full" />
          </div>
        </LoadingState>
      </div>
    );
  }

  if (spec === undefined) return null;

  const showTable = hasValues && (tableOpen || effective === 'error');
  const selectable = onSelect !== undefined;

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!onSelect || !spec) return;
    // Resolve the clicked mark, then read the title that is its own direct child. A click on the svg root,
    // the margins, a gap between marks or the host has no mark under it and selects nothing (a descendant
    // query from there would return the first mark's title, an arbitrary site).
    const mark = (event.target as Element).closest?.('path, circle');
    const title = mark ? Array.from(mark.children).find((child) => child.tagName.toLowerCase() === 'title')?.textContent : undefined;
    const id = idFromTitle(title);
    if (id !== null && spec.table.rows.some((row) => row[0] === id)) onSelect(id);
  }

  return (
    <figure className={clsx('m-0', className)}>
      {effective === 'empty' ? (
        <EmptyState variant="inline" title="No values to plot." body="Adjust the selection to include at least one site." />
      ) : effective === 'error' ? (
        <ErrorState title="The plot could not be drawn." body="The table has the same values." headingLevel={3} />
      ) : (
        // The click handler is a pointer convenience only; the table's Select buttons are the keyboard path.
        <div ref={hostRef} className={clsx('w-full', selectable && '[&_path]:cursor-pointer')} onClick={selectable ? handleClick : undefined} />
      )}
      <figcaption className="text-small text-muted mt-3">{spec.caption}</figcaption>
      {spec.notes?.map((note) => (
        <p key={note} className="text-small text-muted mt-2 max-w-[72ch]">
          {note}
        </p>
      ))}
      {hasValues && effective !== 'error' ? (
        <div className="mt-3">
          <Button variant="secondary" aria-expanded={tableOpen} aria-controls={tableId} onPress={() => setTableOpen((open) => !open)}>
            {tableOpen ? 'Hide table' : 'Show as table'}
          </Button>
        </div>
      ) : null}
      {showTable ? (
        <div id={tableId} className="mt-3 overflow-x-auto">
          <table className="text-small w-full border-collapse text-start">
            <caption className="sr-only">{spec.caption}</caption>
            <thead>
              <tr>
                {spec.table.headers.map((header) => (
                  <th key={header} scope="col" className="border-rule text-muted type-eyebrow border-b py-2 pe-4 text-start font-normal">
                    {header}
                  </th>
                ))}
                {selectable ? (
                  <th scope="col" className="border-rule text-muted type-eyebrow border-b py-2 text-start font-normal">
                    Select
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {spec.table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className={clsx('border-rule border-b py-2 pe-4 text-ink', cellIndex === 0 ? 'font-data' : 'tabular-nums')}>
                      {cell}
                    </td>
                  ))}
                  {selectable ? (
                    <td className="border-rule border-b py-1">
                      <Button variant="quiet" aria-label={`Select ${row[0]}`} onPress={() => onSelect?.(row[0])}>
                        Select
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
