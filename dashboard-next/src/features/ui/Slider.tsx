'use client';

import clsx from 'clsx';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Label, Slider as RacSlider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';
import { LoadingState } from './LoadingState';
import { Skeleton } from './Skeleton';

/**
 * Slider and RangeSlider (DS-04, UI-SPEC "Slider and RangeSlider (dual thumb)").
 *
 * Behaviour comes from React Aria Components' `Slider`: every thumb is a native `input[type=range]`
 * (role `slider`) inside a painted square, the arrow keys change the value by `step`, Home and End
 * jump to the bounds, and in a RangeSlider a thumb stops at its neighbour, so the two can never
 * cross. Two things differ from the library, and both are handled here:
 *
 * - Page keys. React Aria moves a page by a tenth of the range; the UI-SPEC says ten steps, so a
 *   capture handler on the wrapper takes PageUp and PageDown for itself and sets the value
 *   (clamped to the neighbouring thumb and the bounds, rounded to the step). The slider is always
 *   controlled inside, so that handler and the library agree on the value.
 * - Value text. React Aria fills `aria-valuetext` from an Intl number format; the words a person
 *   needs ("0:12 of 0:30", "2,000 Hz") come from `formatValueText`, written onto each input after
 *   every render, together with `aria-invalid` (React Aria filters it out) and, for a RangeSlider,
 *   the thumb's own name: "{label} minimum" and "{label} maximum" replace the group-label
 *   concatenation React Aria would otherwise build.
 *
 * Anatomy: the label (eyebrow) and the current value (data face, end-aligned) on one row, a 4 px
 * track in `rule-strong` with the part up to the thumb (or between the thumbs) in `control`, a
 * 20 x 20 painted thumb in `control` with a 2 px ground ring inside it and a 44 x 44 hit area
 * (an invisible expansion), and the end values as 12 px labels under the track. Hover is
 * `control-hover`, a drag or press is `control-pressed`, keyboard focus is the focus ring around
 * the thumb. `state` replaces the control with Loading (a track skeleton, no thumbs), Empty
 * ("No range to choose.") or Error (thumbs `aria-invalid`, helper text). `tone="well"` uses the
 * well track and ink colours. Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x
 * predates Tailwind 4's custom colour and size names (see Button.tsx).
 */

export type SliderTone = 'light' | 'well';
export type SliderState = 'loading' | 'empty' | 'error';
/** A state drawn on the thumbs for the fixtures page; real hover, focus and press need no prop. */
export type SliderForcedState = 'hover' | 'focus' | 'pressed';

/** Pages move this many steps (UI-SPEC "Keyboard"). */
const PAGE_STEPS = 10;

// Disabled fills: rule-strong lightened 40% toward the ground (UI-SPEC common rules). The label and the value stay at full
// contrast: they are information, not the control, and a disabled control still has to be readable.
const DISABLED_FILL = 'data-disabled:bg-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]';

const TONE = {
  light: {
    label: 'text-muted',
    value: 'text-ink',
    ends: 'text-muted',
    rail: 'bg-rule-strong',
    fill: 'bg-control',
    thumb: clsx(
      'bg-control shadow-[inset_0_0_0_2px_var(--dir-ground)]',
      'hover-state:bg-control-hover pressed-state:bg-control-pressed data-dragging:bg-control-pressed',
      'focus-state:focus-ring',
    ),
    helper: 'text-muted',
    helperError: 'text-ink border-ink',
  },
  well: {
    label: 'text-well-muted',
    value: 'text-well-ink',
    ends: 'text-well-muted',
    rail: 'bg-well-rule',
    fill: 'bg-well-ink',
    thumb: clsx(
      'bg-well-ink shadow-[inset_0_0_0_2px_var(--dir-well)]',
      'hover-state:bg-well-muted pressed-state:bg-well-muted data-dragging:bg-well-muted',
      'focus-state:focus-ring-well',
    ),
    helper: 'text-well-muted',
    helperError: 'text-well-ink border-well-ink',
  },
} as const;

const THUMB_BASE = clsx(
  'absolute top-1/2 size-5 -translate-y-1/2 rounded-control outline-none cursor-grab data-dragging:cursor-grabbing',
  'transition-colors duration-(--duration-fast) ease-(--ease)',
  // The 44 x 44 hit area: an invisible expansion of 12 px on every side of the 20 px square.
  'before:absolute before:-inset-3',
  'data-disabled:cursor-not-allowed',
  DISABLED_FILL,
);

/** Decimal places in a step, so rounding to the step cannot leave 0.30000000000000004. */
function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf('.');
  return dot === -1 ? 0 : text.length - dot - 1;
}

/** `value` moved by `delta`, kept between `lo` and `hi`, rounded to a multiple of `step` from `min`. */
export function movedValue(value: number, delta: number, lo: number, hi: number, step: number, min: number): number {
  const stepped = Math.round((value + delta - min) / step) * step + min;
  const clamped = Math.min(hi, Math.max(lo, stepped));
  return Number(clamped.toFixed(decimalsOf(step)));
}

interface ThumbProps {
  index: number;
  /** The thumb's own accessible name; absent for a single slider (its label names it). */
  name?: string;
  text: string;
  invalid: boolean;
  tone: SliderTone;
  forced?: SliderForcedState;
}

function Thumb({ index, name, text, invalid, tone, forced }: ThumbProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // After every render: the words for the value, the thumb's own name, and the invalid mark.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setAttribute('aria-valuetext', text);
    if (name !== undefined) input.removeAttribute('aria-labelledby');
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  });

  const forceAttribute = forced ? { [`data-force-${forced}`]: '' } : {};
  return (
    <SliderThumb
      index={index}
      inputRef={inputRef}
      aria-label={name}
      className={clsx(THUMB_BASE, TONE[tone].thumb)}
      {...forceAttribute}
    />
  );
}

interface CoreProps {
  label: string;
  minValue: number;
  maxValue: number;
  step: number;
  values: number[];
  onValues: (next: number[]) => void;
  /** One name per thumb, or none for a single slider. */
  thumbNames?: string[];
  formatValueText: (value: number) => string;
  formatEndLabel: (value: number) => string;
  /** The visible value text. */
  outputText: string;
  tone: SliderTone;
  isDisabled: boolean;
  state?: SliderState;
  errorText?: ReactNode;
  forced?: SliderForcedState;
  className?: string;
}

function Core({
  label,
  minValue,
  maxValue,
  step,
  values,
  onValues,
  thumbNames,
  formatValueText,
  formatEndLabel,
  outputText,
  tone,
  isDisabled,
  state,
  errorText,
  forced,
  className,
}: CoreProps) {
  const helperId = useId();
  const palette = TONE[tone];
  const labelClass = clsx('type-eyebrow', palette.label);

  if (state === 'loading') {
    return (
      <div className={clsx('flex flex-col gap-2 text-start', className)}>
        <p className={clsx('type-eyebrow', palette.label)}>{label}</p>
        <LoadingState label="Loading range…">
          <Skeleton on={tone === 'well' ? 'well' : 'ground'} className="my-5 h-1 w-full" />
        </LoadingState>
      </div>
    );
  }
  if (state === 'empty') {
    return (
      <div className={clsx('flex flex-col gap-2 text-start', className)}>
        <p className={clsx('type-eyebrow', palette.label)}>{label}</p>
        <p className={clsx('border-t pt-3 text-body', tone === 'well' ? 'border-well-rule text-well-muted' : 'border-rule text-muted')}>
          No range to choose.
        </p>
      </div>
    );
  }

  const invalid = state === 'error';

  // PageUp and PageDown move ten steps, not React Aria's tenth of the range (see the file comment).
  function onKeyDownCapture(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'PageUp' && event.key !== 'PageDown') return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'range') return;
    const inputs = Array.from(event.currentTarget.querySelectorAll('input[type="range"]'));
    const index = inputs.indexOf(target);
    if (index === -1 || isDisabled) return;
    event.preventDefault();
    event.stopPropagation();
    const lo = index === 0 ? minValue : values[index - 1];
    const hi = index === values.length - 1 ? maxValue : values[index + 1];
    const delta = (event.key === 'PageUp' ? 1 : -1) * PAGE_STEPS * step;
    const next = movedValue(values[index], delta, lo, hi, step, minValue);
    if (next !== values[index]) onValues(values.map((value, i) => (i === index ? next : value)));
  }

  return (
    <div className={clsx('text-start', className)} onKeyDownCapture={onKeyDownCapture}>
      <RacSlider
        minValue={minValue}
        maxValue={maxValue}
        step={step}
        value={values}
        onChange={(next) => onValues(Array.isArray(next) ? next : [next])}
        isDisabled={isDisabled}
        aria-describedby={invalid && errorText ? helperId : undefined}
        className="flex w-full flex-col font-body"
      >
        <div className="flex items-baseline justify-between gap-4">
          <Label className={labelClass}>{label}</Label>
          <SliderOutput className={clsx('font-data text-small tabular text-end', palette.value)}>{outputText}</SliderOutput>
        </div>
        <SliderTrack className="relative mx-2.5 h-11 touch-none">
          {({ state: sliderState }) => {
            const first = sliderState.values.length > 1 ? sliderState.getThumbPercent(0) : 0;
            const last = sliderState.getThumbPercent(sliderState.values.length - 1);
            return (
              <>
                <div aria-hidden="true" className={clsx('absolute inset-x-0 top-1/2 h-1 -translate-y-1/2', palette.rail)} />
                <div
                  aria-hidden="true"
                  data-fill=""
                  className={clsx('absolute top-1/2 h-1 -translate-y-1/2', palette.fill, DISABLED_FILL)}
                  style={{ insetInlineStart: `${first * 100}%`, width: `${Math.max(0, last - first) * 100}%` }}
                />
                {values.map((value, index) => (
                  <Thumb
                    key={index}
                    index={index}
                    name={thumbNames?.[index]}
                    text={formatValueText(value)}
                    invalid={invalid}
                    tone={tone}
                    forced={forced}
                  />
                ))}
              </>
            );
          }}
        </SliderTrack>
        <div className={clsx('flex justify-between font-data text-eyebrow tabular', palette.ends)}>
          <span>{formatEndLabel(minValue)}</span>
          <span>{formatEndLabel(maxValue)}</span>
        </div>
      </RacSlider>
      {invalid && errorText ? (
        <p id={helperId} className={clsx('mt-2 border-s-[3px] ps-3 text-small font-semibold', palette.helperError)}>
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

/** Controlled when `value` is given, otherwise it keeps its own state from `defaultValue`. */
function useValues(value: number[] | undefined, defaultValue: number[]) {
  const [inner, setInner] = useState(defaultValue);
  return [value ?? inner, setInner] as const;
}

interface CommonProps {
  /** The control's name, shown as an eyebrow and used as its accessible name. */
  label: string;
  minValue: number;
  maxValue: number;
  /** Step of the arrow keys and of the values (a page is ten steps). */
  step: number;
  /** Human words for a value: "2,000 Hz", "0:12 of 0:30". Used for `aria-valuetext` and the visible value. */
  formatValueText?: (value: number) => string;
  /** The text under each end of the track; defaults to `formatValueText`. */
  formatEndLabel?: (value: number) => string;
  /** `light` sits on the page ground; `well` sits inside a well or band. */
  tone?: SliderTone;
  isDisabled?: boolean;
  /** Replaces the control with Loading, Empty or Error. */
  state?: SliderState;
  /** The helper text of the Error state. */
  errorText?: ReactNode;
  /** Draws hover, focus or pressed on the thumbs (fixtures page only). */
  forcedState?: SliderForcedState;
  className?: string;
}

const plain = (value: number) => String(value);

export interface SliderProps extends CommonProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
}

/** One thumb. Its label names it. */
export function Slider({
  label,
  minValue,
  maxValue,
  step,
  value,
  defaultValue,
  onChange,
  formatValueText = plain,
  formatEndLabel,
  tone = 'light',
  isDisabled = false,
  state,
  errorText,
  forcedState,
  className,
}: SliderProps) {
  const [values, setValues] = useValues(value === undefined ? undefined : [value], [defaultValue ?? minValue]);
  return (
    <Core
      label={label}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      values={values}
      onValues={(next) => {
        setValues(next);
        onChange?.(next[0]);
      }}
      formatValueText={formatValueText}
      formatEndLabel={formatEndLabel ?? formatValueText}
      outputText={formatValueText(values[0])}
      tone={tone}
      isDisabled={isDisabled}
      state={state}
      errorText={errorText}
      forced={forcedState}
      className={className}
    />
  );
}

export interface RangeSliderProps extends CommonProps {
  value?: [number, number];
  defaultValue?: [number, number];
  onChange?: (value: [number, number]) => void;
}

/** Two thumbs, named "{label} minimum" and "{label} maximum"; they cannot cross. */
export function RangeSlider({
  label,
  minValue,
  maxValue,
  step,
  value,
  defaultValue,
  onChange,
  formatValueText = plain,
  formatEndLabel,
  tone = 'light',
  isDisabled = false,
  state,
  errorText,
  forcedState,
  className,
}: RangeSliderProps) {
  const [values, setValues] = useValues(value, defaultValue ?? [minValue, maxValue]);
  return (
    <Core
      label={label}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      values={values}
      onValues={(next) => {
        setValues(next);
        onChange?.([next[0], next[1]]);
      }}
      thumbNames={[`${label} minimum`, `${label} maximum`]}
      formatValueText={formatValueText}
      formatEndLabel={formatEndLabel ?? formatValueText}
      outputText={`${formatValueText(values[0])} to ${formatValueText(values[1])}`}
      tone={tone}
      isDisabled={isDisabled}
      state={state}
      errorText={errorText}
      forced={forcedState}
      className={className}
    />
  );
}
