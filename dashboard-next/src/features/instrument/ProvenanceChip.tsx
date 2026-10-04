'use client';

import clsx from 'clsx';
import { useCallback, useSyncExternalStore } from 'react';
import { Button as RacButton, Dialog as RacDialog, DialogTrigger } from 'react-aria-components';
import { LoadingState, Sheet, Skeleton, StatusMark } from '@/features/ui';
import {
  DEFAULT_METHODS_HREF,
  SurfacePopover,
  WHY_PANEL_FRAME,
  WHY_PANEL_TITLES,
  WhyPanel,
  WhyPanelContent,
  type WhyPanelData,
  type WhyPanelKind,
  type WhyPanelState,
} from './WhyPanel';

/**
 * ProvenanceChip (DS-05, UI-SPEC "ProvenanceChip and Why panel").
 *
 * A small inline button that says where something comes from and opens the Why panel with the whole
 * answer. Kinds: `source` ("MARRS · CC BY 4.0"), `label` ("Assigned by {who}"), `model` ("Model
 * {version}") and `missing` ("Source not recorded", a dashed outline and a hollow ring). A chip whose
 * kind needs data it does not have reads "Source not recorded" rather than a partial claim, and a
 * thing with no provenance at all is the `missing` kind, never a disabled chip.
 *
 * Behaviour comes from React Aria Components: `DialogTrigger` sets `aria-expanded` and (while open)
 * `aria-controls`, Escape closes the panel and focus returns to the chip; it does not set
 * `aria-haspopup` for a dialog, so the chip names it itself (`aria-haspopup="dialog"`). From 640 px
 * the panel is a Popover anchored to the chip; below it, a bottom Sheet. The chip is 28 px high with
 * a 44 px hit area made by an invisible expansion (`hit-area`), so the small look keeps a touch-sized
 * target. Open it with the fill of a control (`control` and `on-control`), hover
 * is `panel-hover` and pressed is `selected`. Classes are joined with `clsx`, not `cn` (see Button.tsx).
 */

export type ProvenanceChipKind = WhyPanelKind;

const MISSING_TEXT = 'Source not recorded';

/** The chip text of a kind, from the data. A kind whose data is absent reads "Source not recorded". */
export function provenanceChipText(kind: ProvenanceChipKind, panel: WhyPanelData): string {
  const filled = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== '';
  if (kind === 'source' && filled(panel.datasetName) && filled(panel.licence)) return `${panel.datasetName} · ${panel.licence}`;
  if (kind === 'label' && filled(panel.assignedBy)) return `Assigned by ${panel.assignedBy}`;
  if (kind === 'model' && filled(panel.modelVersion)) return `Model ${panel.modelVersion}`;
  return MISSING_TEXT;
}

const WIDE_QUERY = '(min-width: 640px)';

/** True from 640 px up. Without matchMedia (a test environment, a server render) it is true. */
function useWide(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const query = window.matchMedia(WIDE_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const getSnapshot = useCallback(() => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY).matches : true), []);
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

const CHIP = clsx(
  'hit-area inline-flex items-center gap-2 rounded-control border border-ink bg-ground px-2 py-1',
  'font-data text-eyebrow text-ink text-start cursor-pointer',
  'transition-colors duration-(--duration-fast) ease-(--ease)',
  'hover-state:bg-panel-hover pressed-state:bg-selected focus-state:focus-ring',
  // Open: the fill of a control. Two attribute selectors out-rank the pressed state React Aria also sets while a popover is open.
  'aria-expanded:bg-control aria-expanded:text-on-control',
  // The fixtures route draws the open look on a static chip without claiming it controls anything.
  'data-force-open:bg-control data-force-open:text-on-control',
);

export type ProvenanceChipForced = 'hover' | 'focus' | 'pressed' | 'open';

const OVERLAY_MOTION =
  'transition-opacity duration-(--duration-base) ease-(--ease) data-entering:opacity-0 data-exiting:opacity-0';

export interface ProvenanceChipProps {
  kind: ProvenanceChipKind;
  /** The chip text; by default it is read from `panel` for the kind. */
  text?: string;
  /** What the Why panel shows. */
  panel: WhyPanelData;
  /** `loading` draws a skeleton chip; `error` makes the panel say it could not be loaded. */
  state?: WhyPanelState;
  /** The "Methods and limits" destination: a path or an https URL. */
  methodsHref?: string;
  onRetry?: () => void;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /** For the fixtures route: draws a hover, focus, pressed or open look through a data attribute. */
  forced?: ProvenanceChipForced;
  className?: string;
}

export function ProvenanceChip({
  kind,
  text,
  panel,
  state = 'default',
  methodsHref = DEFAULT_METHODS_HREF,
  onRetry,
  isOpen,
  defaultOpen,
  onOpenChange,
  forced,
  className,
}: ProvenanceChipProps) {
  const wide = useWide();

  if (state === 'loading') {
    return (
      <LoadingState label="Loading provenance…" className={clsx('inline-flex flex-row items-center gap-3', className)}>
        <Skeleton className="h-7 w-40" />
      </LoadingState>
    );
  }

  const label = text ?? provenanceChipText(kind, panel);
  const chip = (
    <RacButton
      aria-haspopup="dialog"
      data-hit-expanded=""
      data-kind={kind}
      {...(forced ? { [`data-force-${forced}`]: '' } : {})}
      className={clsx(CHIP, kind === 'missing' && 'border-dashed', className)}
    >
      {kind === 'missing' ? <StatusMark status="unknown" size={12} className="shrink-0" /> : null}
      <span className="wrap-anywhere">{label}</span>
    </RacButton>
  );
  const title = WHY_PANEL_TITLES[kind];
  const body = { panel, state, methodsHref, onRetry };

  if (!wide) {
    return (
      <Sheet side="bottom" title={title} trigger={chip} isOpen={isOpen} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <WhyPanelContent {...body} />
      </Sheet>
    );
  }

  return (
    <DialogTrigger isOpen={isOpen} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {chip}
      <SurfacePopover placement="bottom start" offset={8} className={clsx(WHY_PANEL_FRAME, 'w-[360px] overflow-y-auto', OVERLAY_MOTION)}>
        <RacDialog className="outline-none">
          <WhyPanel kind={kind} {...body} />
        </RacDialog>
      </SurfacePopover>
    </DialogTrigger>
  );
}
