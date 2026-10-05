'use client';

import clsx from 'clsx';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Slider, type SliderTone } from '@/features/ui';
import { formatMix } from './compare-math';

/**
 * Crossfader (DS-05, UI-SPEC "CompareDeck"): the A/B slider of the compare deck. It is the kit
 * Slider (0 to 100 in steps of 5) named "Mix between A and B", with the value written as words
 * ("50% A, 50% B"), and a large italic "A" and "B" either side. The letters are decorative: the
 * slider's name and value text already say what each end means.
 *
 * Keys: arrows move 5 (one step), Home and End go to the ends (from React Aria), and PageUp and
 * PageDown move 20. The kit Slider moves a page by ten steps (50 here), so this component takes the
 * page keys first, on an ancestor in the capture phase, before the Slider's own handler sees them.
 *
 * The value is a position in [0, 1] (0 is all A, 1 is all B), the same number `useTransport.setMix`
 * and `wellOpacity` take. The audio stays equal-power (cos and sin); the visual dim is the deck's.
 */

export interface CrossfaderProps {
  /** Position in [0, 1]: 0 is all A, 1 is all B. */
  value: number;
  onChange: (value: number) => void;
  isDisabled?: boolean;
  tone?: SliderTone;
  className?: string;
}

/** Arrow step and page step, in percent. */
export const CROSSFADER_STEP = 5;
export const CROSSFADER_PAGE_STEP = 20;

const toPercent = (x: number) => Math.min(100, Math.max(0, Math.round(x * 100)));

export function Crossfader({ value, onChange, isDisabled = false, tone = 'light', className }: CrossfaderProps) {
  const percent = toPercent(value);

  function onKeyDownCapture(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'PageUp' && event.key !== 'PageDown') return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
    event.preventDefault();
    event.stopPropagation();
    if (isDisabled) return;
    const next = toPercent((percent + (event.key === 'PageUp' ? CROSSFADER_PAGE_STEP : -CROSSFADER_PAGE_STEP)) / 100);
    if (next !== percent) onChange(next / 100);
  }

  const letter = clsx('type-display text-title shrink-0 select-none', tone === 'well' ? 'text-well-ink' : 'text-ink');

  return (
    <div data-crossfader="" className={clsx('flex items-center gap-4', className)} onKeyDownCapture={onKeyDownCapture}>
      <span aria-hidden="true" className={letter}>
        A
      </span>
      <Slider
        className="min-w-0 flex-1"
        label="Mix between A and B"
        minValue={0}
        maxValue={100}
        step={CROSSFADER_STEP}
        value={percent}
        onChange={(next) => onChange(next / 100)}
        formatValueText={(next) => formatMix(next / 100)}
        formatEndLabel={(next) => (next === 0 ? 'All A' : 'All B')}
        isDisabled={isDisabled}
        tone={tone}
      />
      <span aria-hidden="true" className={letter}>
        B
      </span>
    </div>
  );
}
