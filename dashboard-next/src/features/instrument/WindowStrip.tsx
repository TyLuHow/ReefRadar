'use client';

import clsx from 'clsx';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ListBox, ListBoxItem, type Key, type Selection } from 'react-aria-components';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  STATUS_LABELS,
  STATUS_PATH,
  Skeleton,
  StatusMark,
  statusColorVar,
  type HabitatStatus,
} from '@/features/ui';
import { formatDb } from './ColourBar';

/**
 * WindowStrip (DS-05, UI-SPEC "WindowStrip"): a row of 44 px cells, one per 5 s window of a clip,
 * aligned under the spectrogram's time axis (cell k covers [5k, 5k + 5) s).
 *
 * INTEGRITY. Per-window model output does not exist until Phase 5, so nothing here invents it. A
 * cell is one of four kinds, and the fixtures use only the last two:
 * - reading: a model reading (status and the model's probability p). Fill is the status colour at
 *   opacity 0.2 + 0.8 x p with a white 16 px glyph outlined in ink. Shade is the model's
 *   probability for that class, not a calibrated confidence. Only unit-test inputs reach this path.
 * - abstain: the model declined to say ("can't tell"): hatched, with a hollow ring.
 * - empty: no reading and no measurement: a dashed outline (unclassified).
 * - energy: no reading, but the window's measured RMS level (dB re full scale, computed from the
 *   recording itself): `ink` at an opacity mapped linearly from the clip's own quietest to loudest
 *   window onto 0.15 to 0.85. The level is in the option name and the tooltip.
 * The legend states that the energy shade is relative within the clip, with the range it spans.
 * The legend under the strip says which of these is on screen, so a shaded cell is never read as a
 * model result.
 *
 * Semantics: a RAC horizontal `ListBox` (one tab stop; Left and Right move; Home and End jump;
 * Enter or Space selects). Selecting a window reports its index through `onSelectWindow`; the
 * caller moves the Transport to `windows[index].startS`. Window numbers are one-based in names
 * ("Window 4" is the cell covering 15 to 20 s); `index` is zero-based.
 *
 * Dense mode: when a cell would be narrower than 16 px (long uploads) the glyphs go, the row keeps
 * its 44 px height, and the tooltips (hover and keyboard focus) carry the detail. Width is measured
 * with a ResizeObserver. Tooltips are positioned from the cell itself, aligned to its start in the
 * first half of the strip and to its end in the second, so the first and last cells cannot push one
 * off screen.
 */

export type WindowReading = { status: HabitatStatus; p: number } | { abstain: true } | null;

export interface WindowCellData {
  /** Zero-based index; the window covers [startS, endS). */
  index: number;
  startS: number;
  endS: number;
  reading: WindowReading;
  /** Measured RMS level of the window in dB re full scale. Shown only on cells without a reading. */
  energyDb?: number;
}

export type WindowStripState = 'loading' | 'error';
export type WindowCellKind = 'reading' | 'abstain' | 'empty' | 'energy';

export interface WindowStripProps {
  /** The clip's label for the strip's name: "Windows of {clipLabel}, 5 seconds each". */
  clipLabel: string;
  windows: WindowCellData[];
  selectedIndex?: number;
  playingIndex?: number;
  onSelectWindow?: (index: number) => void;
  isDisabled?: boolean;
  state?: WindowStripState;
  /** Loading state: how many skeleton cells to draw. Defaults to the number of windows. */
  expectedCount?: number;
  /** Adds "{k} of {n} windows read {Status}", counted from the cells. */
  summary?: HabitatStatus;
  /** Fixtures only: draws hover or focus on one cell. */
  forced?: { index: number; state: 'hover' | 'focus' };
  className?: string;
}

/** A cell narrower than this is drawn without a glyph. */
export const WINDOW_DENSE_PX = 16;
const GAP_PX = 1;
const TOOLTIP_DELAY_MS = 300;

/** True when `count` cells and their 1 px gaps would leave each cell narrower than 16 px. */
export function isDenseStrip(containerWidth: number, count: number): boolean {
  if (!(containerWidth > 0) || count <= 0) return false;
  return (containerWidth - (count - 1) * GAP_PX) / count < WINDOW_DENSE_PX;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Fill opacity of a reading cell: 0.2 + 0.8 x p. */
export function readingOpacity(p: number): number {
  return 0.2 + 0.8 * clamp01(p);
}

/** Fill opacity of an energy cell: the clip's own range mapped linearly onto 0.15 to 0.85. */
export function energyOpacity(levelDb: number, minDb: number, maxDb: number): number {
  if (!(maxDb > minDb)) return 0.5;
  return 0.15 + 0.7 * clamp01((levelDb - minDb) / (maxDb - minDb));
}

function minSec(seconds: number): string {
  const whole = Math.floor(Math.max(0, seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** What a cell holds, for its drawing and its `data-cell-kind`. */
export function windowCellKind(cell: WindowCellData): WindowCellKind {
  if (cell.reading === null) return cell.energyDb === undefined ? 'empty' : 'energy';
  return 'status' in cell.reading ? 'reading' : 'abstain';
}

function percent(p: number): string {
  return `${Math.round(clamp01(p) * 100)}%`;
}

/** The option's accessible name: "Window 4, 0:15 to 0:20, healthy, 58%". */
export function windowOptionName(cell: WindowCellData): string {
  const head = `Window ${cell.index + 1}, ${minSec(cell.startS)} to ${minSec(cell.endS)}`;
  if (cell.reading === null) {
    return cell.energyDb === undefined ? `${head}, no reading` : `${head}, no reading, ${formatDb(cell.energyDb)} dB RMS`;
  }
  if ('abstain' in cell.reading) return `${head}, can't tell`;
  return `${head}, ${STATUS_LABELS[cell.reading.status].toLowerCase()}, ${percent(cell.reading.p)}`;
}

/** The tooltip: "Window 4 · 0:15 to 0:20 · Healthy · 58%". */
export function windowTooltipText(cell: WindowCellData): string {
  const head = `Window ${cell.index + 1} · ${minSec(cell.startS)} to ${minSec(cell.endS)}`;
  if (cell.reading === null) {
    return cell.energyDb === undefined ? `${head} · No reading` : `${head} · No reading · ${formatDb(cell.energyDb)} dB RMS`;
  }
  if ('abstain' in cell.reading) return `${head} · Can't tell`;
  return `${head} · ${STATUS_LABELS[cell.reading.status]} · ${percent(cell.reading.p)}`;
}

const MODEL_LEGEND = "Colour is the model's reading for that window. Shade is the model's probability for that class, not a calibrated confidence.";
const ENERGY_LEGEND = 'Shade is the measured RMS level of each 5 s window, from the recording itself.';
const ENERGY_SCALE =
  "Shading is relative within this clip, from its quietest to its loudest window, so strips from different clips cannot be compared by shade";
const NO_READINGS = 'No model readings exist for these windows yet.';

/** The legend line(s) for what is on screen. */
export function windowLegend(windows: WindowCellData[]): string[] {
  const hasReading = windows.some((cell) => cell.reading !== null && 'status' in cell.reading);
  const levels = windows.flatMap((cell) => (windowCellKind(cell) === 'energy' && cell.energyDb !== undefined ? [cell.energyDb] : []));
  const hasEnergy = levels.length > 0;
  const lines: string[] = [];
  if (hasReading) lines.push(MODEL_LEGEND);
  if (hasEnergy) {
    // The shade is mapped from this clip's own range (energyOpacity), so the legend says so and
    // gives the range: two strips cannot be compared by eye (B WR-06).
    const scale = `${ENERGY_SCALE} (${formatDb(Math.min(...levels))} to ${formatDb(Math.max(...levels))} dB RMS).`;
    lines.push(hasReading ? `${ENERGY_LEGEND} ${scale}` : `${ENERGY_LEGEND} ${scale} ${NO_READINGS}`);
  }
  if (!hasReading && !hasEnergy) lines.push(NO_READINGS);
  return lines;
}

/** "{k} of {n} windows read {Status}", counted from the cells. */
export function windowSummary(windows: WindowCellData[], status: HabitatStatus): string {
  const count = windows.filter((cell) => cell.reading !== null && 'status' in cell.reading && cell.reading.status === status).length;
  return `${count} of ${windows.length} windows read ${STATUS_LABELS[status]}`;
}

const HATCH = 'bg-[repeating-linear-gradient(45deg,var(--dir-rule-strong)_0_1px,transparent_1px_6px)]';

interface CellProps {
  cell: WindowCellData;
  count: number;
  dense: boolean;
  energyRange: { min: number; max: number } | null;
  playing: boolean;
  forced?: 'hover' | 'focus';
}

/** One cell of the strip: a ListBox option with its fill, glyph, edges, playing bar and tooltip. */
export function WindowCell({ cell, count, dense, energyRange, playing, forced }: CellProps) {
  const kind = windowCellKind(cell);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  // Escape dismisses an open tooltip (UI-SPEC "Tooltip"); it returns on the next hover or focus.
  useEffect(() => {
    if (!hoverOpen && !focused) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hoverOpen, focused]);

  let fillStyle: CSSProperties | undefined;
  let fillClass = '';
  if (kind === 'reading' && cell.reading && 'status' in cell.reading) {
    fillStyle = { backgroundColor: statusColorVar(cell.reading.status), opacity: readingOpacity(cell.reading.p) };
  } else if (kind === 'abstain') {
    fillClass = clsx('bg-track', HATCH);
  } else if (kind === 'energy' && cell.energyDb !== undefined && energyRange) {
    fillClass = 'bg-ink';
    fillStyle = { opacity: energyOpacity(cell.energyDb, energyRange.min, energyRange.max) };
  }

  const forceAttribute = forced ? { [`data-force-${forced}`]: '' } : {};
  const alignEnd = cell.index >= count / 2;

  return (
    <ListBoxItem
      id={cell.index}
      textValue={windowOptionName(cell)}
      aria-label={windowOptionName(cell)}
      data-cell-kind={kind}
      data-window-index={cell.index}
      onHoverStart={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setHoverOpen(true), TOOLTIP_DELAY_MS);
      }}
      onHoverEnd={() => {
        clearTimeout(timer.current);
        setHoverOpen(false);
        setDismissed(false);
      }}
      onFocusChange={(isFocused) => {
        setFocused(isFocused);
        if (!isFocused) setDismissed(false);
      }}
      className={clsx(
        'group relative h-11 min-w-0 flex-1 basis-0 cursor-pointer outline-none',
        'focus-state:focus-ring-inset data-disabled:cursor-not-allowed data-disabled:opacity-60',
        kind === 'empty' && 'border border-dashed border-rule-strong',
      )}
      {...forceAttribute}
    >
      {({ isFocusVisible }) => (
        <>
          <span data-cell-fill="" aria-hidden="true" className={clsx('absolute inset-0', fillClass)} style={fillStyle} />
          {dense ? null : kind === 'reading' && cell.reading && 'status' in cell.reading ? (
            <svg
              width={16}
              height={16}
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
              data-status={cell.reading.status}
              className="absolute inset-0 m-auto"
            >
              <path d={STATUS_PATH[cell.reading.status]} fill="var(--dir-inverse)" stroke="var(--dir-ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
          ) : kind === 'abstain' ? (
            <StatusMark status="unknown" size={16} className="absolute inset-0 m-auto" />
          ) : null}
          {/* Hover: a 2 px inset edge in panel-hover. Selected: a 3 px inset ink outline, drawn over it. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 border-2 border-transparent group-data-[hovered]:border-panel-hover group-data-[force-hover]:border-panel-hover"
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 border-[3px] border-transparent group-data-[selected]:border-ink" />
          {playing ? <span data-playing-bar="" aria-hidden="true" className="absolute inset-x-0 -bottom-[6px] h-1 bg-ink" /> : null}
          {(isFocusVisible || hoverOpen) && !dismissed ? (
            <span
              role="tooltip"
              className={clsx(
                'pointer-events-none absolute bottom-full z-50 mb-2 w-max max-w-[280px] break-words rounded-control bg-control px-3 py-2 text-start text-small font-normal text-on-control',
                alignEnd ? 'end-0' : 'start-0',
              )}
            >
              {windowTooltipText(cell)}
            </span>
          ) : null}
        </>
      )}
    </ListBoxItem>
  );
}

export function WindowStrip({
  clipLabel,
  windows,
  selectedIndex,
  playingIndex,
  onSelectWindow,
  isDisabled = false,
  state,
  expectedCount,
  summary,
  forced,
  className,
}: WindowStripProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const showing = state === undefined && windows.length > 0;

  // React Aria does not forward aria-disabled to the list, so the attribute is set on the node.
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    if (isDisabled) node.setAttribute('aria-disabled', 'true');
    else node.removeAttribute('aria-disabled');
  }, [isDisabled, showing]);

  // Measure the strip: once when it appears, then on every resize.
  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!showing || !node) return undefined;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) setWidth(last.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [showing]);

  if (state === 'loading') {
    const count = Math.max(1, expectedCount ?? windows.length);
    return (
      <LoadingState label="Loading windows…" className={className}>
        <div className="flex gap-px pb-2">
          {Array.from({ length: count }, (_, index) => (
            <Skeleton key={index} className="h-11 min-w-0 flex-1" />
          ))}
        </div>
      </LoadingState>
    );
  }
  if (state === 'error') {
    return (
      <ErrorState
        announce="status"
        headingLevel={3}
        title="Window readings could not be loaded."
        body="The recording and its spectrogram are unaffected."
        className={className}
      />
    );
  }
  if (windows.length === 0) {
    return <EmptyState title="No windows yet." body="Windows appear after the recording has been analysed." className={className} />;
  }

  const levels = windows.flatMap((cell) => (cell.reading === null && cell.energyDb !== undefined ? [cell.energyDb] : []));
  const energyRange = levels.length > 0 ? { min: Math.min(...levels), max: Math.max(...levels) } : null;
  const dense = isDenseStrip(width, windows.length);

  const select = (key: Key | null | undefined) => {
    if (key === null || key === undefined) return;
    onSelectWindow?.(Number(key));
  };

  // Choosing the window that is already selected changes no selection, so React Aria reports nothing.
  // The Transport still has to return to that window's start, so Enter, Space and a click on it are
  // reported here, in the capture phase (React Aria stops those events at the option). An unselected
  // window reports through the selection change, never twice.
  const reselect = (target: EventTarget) => {
    const node = (target as HTMLElement).closest?.('[data-window-index]');
    if (!node || isDisabled) return;
    const index = Number(node.getAttribute('data-window-index'));
    if (index === selectedIndex) onSelectWindow?.(index);
  };

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {/* The bottom padding holds the playing bar, so it never changes the row's height. */}
      <div
        ref={measureRef}
        className="pb-2"
        onKeyDownCapture={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) reselect(event.target);
        }}
        onClickCapture={(event) => reselect(event.target)}
      >
        <ListBox
          ref={listRef}
          aria-label={`Windows of ${clipLabel}, 5 seconds each`}
          data-dense={dense ? 'true' : 'false'}
          orientation="horizontal"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={selectedIndex === undefined ? [] : [selectedIndex]}
          disabledKeys={isDisabled ? windows.map((cell) => cell.index) : undefined}
          onSelectionChange={(keys: Selection) => select(keys === 'all' ? undefined : [...keys][0])}
          className="flex gap-px outline-none"
        >
          {windows.map((cell) => (
            <WindowCell
              key={cell.index}
              cell={cell}
              count={windows.length}
              dense={dense}
              energyRange={energyRange}
              playing={playingIndex === cell.index}
              forced={forced?.index === cell.index ? forced.state : undefined}
            />
          ))}
        </ListBox>
      </div>
      {summary ? <p className="text-small text-ink">{windowSummary(windows, summary)}</p> : null}
      {windowLegend(windows).map((line) => (
        <p key={line} className="text-small text-muted">
          {line}
        </p>
      ))}
      {isDisabled ? <p className="text-small text-muted">Readings are not available for this recording.</p> : null}
    </div>
  );
}
