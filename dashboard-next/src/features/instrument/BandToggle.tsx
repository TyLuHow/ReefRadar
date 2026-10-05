'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ErrorState, LoadingState, Skeleton, ToggleGroup, ToggleGroupItem, TooltipSurface, type ToggleTone } from '@/features/ui';

/**
 * BandToggle (DS-05, UI-SPEC "BandToggle"): a multiple-selection ToggleGroup of frequency bands,
 * each segment showing the band's label and, under it in the data face, its range ("0 to 2.7 kHz").
 * Bands come from props. In Phase 4 the fixtures' bands are an equal three-way split of the
 * recording's range, labelled as fixture bands; the cited band table and names arrive in Phase 7.
 * No species, behaviour or guild name belongs on a band.
 *
 * Two rules are computed here, not left to the caller:
 * - A band that starts at or above the recording's top frequency (`nyquistHz`) is disabled, with
 *   the reason "Above this recording's {n} kHz limit." The reason is in the segment's own text for
 *   assistive technology (a touch screen never shows a tooltip) and in a tooltip on mouse hover.
 *   A native disabled button swallows hover and focus, so the tooltip hangs on a wrapper that takes
 *   the pointer instead (the button itself ignores it), the same approach the Listbox uses.
 * - At least one band always stays on (`disallowEmptySelection`), so playback is never silent. A
 *   disabled band is never reported as selected, even if the caller passed it.
 *
 * `state` replaces the control with Loading (three skeleton segments), Empty (text only) or Error
 * (playback continues without filtering). `forceDisabled` and `forced` exist for the fixtures page:
 * they draw a disabled or a hover, focus or pressed segment on real bands.
 */

export interface BandDefinition {
  id: string;
  label: string;
  lowHz: number;
  highHz: number;
}

export type BandToggleState = 'loading' | 'empty' | 'error';

export interface BandToggleProps {
  bands: BandDefinition[];
  /** The recording's top frequency in hertz. */
  nyquistHz: number;
  selectedKeys: Iterable<string>;
  onSelectionChange: (keys: Set<string>) => void;
  /** `light` on the page ground, `well` inside a well or band. */
  tone?: ToggleTone;
  state?: BandToggleState;
  /** Fixtures only: disables one band with a stated reason, as if it lay above the limit. */
  forceDisabled?: { id: string; reason: string };
  /** Fixtures only: draws hover, focus or pressed on one segment. */
  forced?: { id: string; state: 'hover' | 'focus' | 'pressed' };
  className?: string;
}

const kHz = (hz: number) => String(Number((hz / 1000).toFixed(1)));

/** True when the band begins at or above the recording's top frequency. */
export function isBandAboveLimit(band: { lowHz: number }, nyquistHz: number): boolean {
  return band.lowHz >= nyquistHz;
}

/** "Above this recording's 8 kHz limit." */
export function bandLimitReason(nyquistHz: number): string {
  return `Above this recording's ${kHz(nyquistHz)} kHz limit.`;
}

/** "0 to 2.7 kHz". */
export function formatBandRange(lowHz: number, highHz: number): string {
  return `${kHz(lowHz)} to ${kHz(highHz)} kHz`;
}

const TOOLTIP_DELAY_MS = 300;

interface TipPlace {
  top: number;
  left: number;
  below: boolean;
}

/** Gives a disabled segment its hover tooltip; the wrapper takes the pointer the disabled button ignores. */
function DisabledSegment({ reason, children }: { reason: string; children: ReactNode }) {
  const [tip, setTip] = useState<TipPlace | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (tip === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTip(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tip]);

  function show(event: ReactPointerEvent<HTMLSpanElement>) {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const below = rect.top < 56;
      setTip({ top: below ? rect.bottom + 8 : rect.top - 8, left: rect.left + rect.width / 2, below });
    }, TOOLTIP_DELAY_MS);
  }

  function hide() {
    clearTimeout(timer.current);
    setTip(null);
  }

  return (
    <span
      onPointerEnter={show}
      onPointerLeave={hide}
      className={clsx(
        'relative inline-flex cursor-not-allowed -ms-px first:ms-0',
        // The button is first and last inside the wrapper, so the group's pill ends are decided here.
        '[&>button]:rounded-none! first:[&>button]:rounded-s-control! last:[&>button]:rounded-e-control!',
      )}
    >
      {children}
      {tip !== null ? (
        <span
          className="pointer-events-none fixed z-50"
          style={{ top: tip.top, left: tip.left, transform: tip.below ? 'translateX(-50%)' : 'translate(-50%, -100%)' }}
        >
          <TooltipSurface>{reason}</TooltipSurface>
        </span>
      ) : null}
    </span>
  );
}

const TONE_TEXT: Record<ToggleTone, { label: string; help: string; box: string | undefined }> = {
  light: { label: 'text-muted', help: 'text-muted', box: undefined },
  well: { label: 'text-well-muted', help: 'text-well-muted', box: 'bg-ground p-3 text-ink' },
};

export function BandToggle({ bands, nyquistHz, selectedKeys, onSelectionChange, tone = 'light', state, forceDisabled, forced, className }: BandToggleProps) {
  const text = TONE_TEXT[tone];
  const helpId = useId();

  if (state === 'loading') {
    return (
      <LoadingState label="Loading bands…" className={className}>
        <div className="flex gap-px">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} on={tone === 'well' ? 'well' : 'ground'} className="h-11 w-24" />
          ))}
        </div>
      </LoadingState>
    );
  }
  if (state === 'error') {
    return (
      <div className={clsx(text.box, className)}>
        <ErrorState announce="status" headingLevel={3} title="Band filter is unavailable." body="Playback continues without filtering." />
      </div>
    );
  }
  if (state === 'empty' || bands.length === 0) {
    return <p className={clsx('text-body', text.help, className)}>No bands are defined for this recording.</p>;
  }

  const reasons = new Map<string, string>();
  for (const band of bands) {
    if (isBandAboveLimit(band, nyquistHz)) reasons.set(band.id, bandLimitReason(nyquistHz));
  }
  if (forceDisabled) reasons.set(forceDisabled.id, forceDisabled.reason);

  const selected = new Set([...selectedKeys].filter((id) => !reasons.has(id)));

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      <p className={clsx('type-eyebrow', text.label)}>Frequency bands to play</p>
      <ToggleGroup
        aria-label="Frequency bands to play"
        aria-describedby={helpId}
        tone={tone}
        selectionMode="multiple"
        disallowEmptySelection
        selectedKeys={selected}
        onSelectionChange={(keys) => {
          onSelectionChange(new Set([...keys].map(String).filter((id) => !reasons.has(id))));
        }}
        className="self-start"
      >
        {bands.map((band) => {
          const reason = reasons.get(band.id);
          const forceAttribute = forced?.id === band.id ? { [`data-force-${forced.state}`]: '' } : {};
          const item = (
            <ToggleGroupItem key={band.id} id={band.id} isDisabled={reason !== undefined} className={reason ? 'pointer-events-none' : undefined} {...forceAttribute}>
              <span className="flex flex-col items-center">
                <span>{band.label}</span>
                <span className="font-data text-eyebrow">{formatBandRange(band.lowHz, band.highHz)}</span>
                {reason ? <span className="sr-only">{reason}</span> : null}
              </span>
            </ToggleGroupItem>
          );
          return reason ? (
            <DisabledSegment key={band.id} reason={reason}>
              {item}
            </DisabledSegment>
          ) : (
            item
          );
        })}
      </ToggleGroup>
      <p id={helpId} className={clsx('text-small', text.help)}>
        Playing the selected bands. At least one band stays on.
      </p>
    </div>
  );
}
