'use client';

import clsx from 'clsx';
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import {
  ToggleButton as RacToggleButton,
  ToggleButtonGroup as RacToggleButtonGroup,
  type ToggleButtonGroupProps as RacToggleButtonGroupProps,
  type ToggleButtonProps as RacToggleButtonProps,
} from 'react-aria-components';

/**
 * ToggleGroup, ToggleGroupItem and ToggleButton (DS-04, UI-SPEC "ToggleGroup").
 *
 * ARIA pattern from React Aria Components: single selection is a `radiogroup` of `radio` segments
 * (`aria-checked`); multiple selection is a `toolbar` of buttons (`aria-pressed`). The group is one
 * Tab stop, the arrow keys move between segments, Space or Enter toggles.
 *
 * Segments share edges (`-ms-px`), a selected segment fills with the control token, and focus is an
 * inset outline in the focus token (never a box-shadow). Only the poster direction has a non-zero
 * control radius, so the pill ends come from `rounded-control` on the first and last segment.
 * Classes are joined with `clsx`, not `cn`, because tailwind-merge 2.x predates Tailwind 4's custom
 * colour and size names (see Button.tsx).
 */

export type ToggleTone = 'light' | 'well';

const ToneContext = createContext<ToggleTone>('light');

// Disabled text and border: rule-strong lightened 40% toward the ground (UI-SPEC common rules).
// Written out in full: Tailwind finds classes by scanning source text, so they cannot be interpolated.
const DISABLED = clsx(
  'data-disabled:bg-track data-disabled:data-selected:bg-track',
  'data-disabled:text-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]',
  'data-disabled:data-selected:text-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]',
  'data-disabled:border-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]',
  'data-disabled:cursor-not-allowed',
);

const SEGMENT_BASE =
  'min-h-11 min-w-11 px-4 inline-flex items-center justify-center border font-body text-body whitespace-normal text-start -ms-px first:ms-0 ' +
  'first:rounded-s-control last:rounded-e-control cursor-pointer transition-colors duration-(--duration-fast) ease-(--ease)';

const SEGMENT_TONE: Record<ToggleTone, string> = {
  light: clsx(
    'border-ink text-ink bg-transparent hover-state:bg-panel-hover pressed-state:bg-selected',
    'data-selected:bg-control data-selected:text-on-control data-selected:hover-state:bg-control-hover data-selected:pressed-state:bg-control-pressed',
    'focus-state:focus-ring-inset',
  ),
  well: clsx(
    'border-well-rule text-well-ink bg-transparent hover-state:bg-well-raised pressed-state:bg-well-raised',
    'data-selected:bg-well-ink data-selected:text-well',
    // Inset like the light segments; the well ring token has no inset utility, so the offset is forced.
    'focus-state:focus-ring-well focus-state:-outline-offset-2!',
  ),
};

const STANDALONE_BASE =
  'min-h-11 min-w-11 px-5 inline-flex items-center justify-center gap-2 border rounded-control font-body text-body font-semibold whitespace-normal text-start ' +
  'cursor-pointer transition-colors duration-(--duration-fast) ease-(--ease)';

const STANDALONE_TONE: Record<ToggleTone, string> = {
  light: clsx(
    'border-ink text-ink bg-transparent hover-state:bg-panel-hover pressed-state:bg-selected',
    'data-selected:bg-control data-selected:text-on-control data-selected:hover-state:bg-control-hover data-selected:pressed-state:bg-control-pressed',
    'focus-state:focus-ring',
  ),
  well: clsx(
    'border-well-rule text-well-ink bg-transparent hover-state:bg-well-raised pressed-state:bg-well-raised',
    'data-selected:bg-well-ink data-selected:text-well',
    'focus-state:focus-ring-well',
  ),
};

export type ToggleGroupProps = Omit<RacToggleButtonGroupProps, 'className'> & {
  /** `light` sits on the page ground; `well` sits inside a well or band. */
  tone?: ToggleTone;
  /** Marks the group invalid (`aria-invalid` on the group). Pair it with `helperText`. */
  isInvalid?: boolean;
  /** Text under the group, linked with `aria-describedby`. */
  helperText?: ReactNode;
  className?: string;
};

/** A row of segments with single or multiple selection. Give it an `aria-label`. */
export function ToggleGroup({ tone = 'light', isInvalid, helperText, className, children, ...rest }: ToggleGroupProps) {
  // React Aria filters aria-invalid out of the DOM props it forwards, so the attribute is set on the node.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (isInvalid) node.setAttribute('aria-invalid', 'true');
    else node.removeAttribute('aria-invalid');
  }, [isInvalid]);

  const helperId = useId();
  const describedBy = helperText ? [rest['aria-describedby'], helperId].filter(Boolean).join(' ') : rest['aria-describedby'];

  return (
    <ToneContext.Provider value={tone}>
      <RacToggleButtonGroup {...rest} ref={ref} aria-describedby={describedBy} className={clsx('inline-flex', className)}>
        {children}
      </RacToggleButtonGroup>
      {helperText ? (
        <p id={helperId} className={clsx('mt-2 text-small font-body', isInvalid ? 'text-ink font-semibold' : 'text-muted')}>
          {helperText}
        </p>
      ) : null}
    </ToneContext.Provider>
  );
}

export type ToggleGroupItemProps = Omit<RacToggleButtonProps, 'className' | 'id'> & {
  /** The key reported through `selectedKeys` and `onSelectionChange`. */
  id: string;
  className?: string;
};

/** One segment of a ToggleGroup; it takes the group's tone. */
export function ToggleGroupItem({ className, ...rest }: ToggleGroupItemProps) {
  const tone = useContext(ToneContext);
  return <RacToggleButton {...rest} className={clsx(SEGMENT_BASE, SEGMENT_TONE[tone], DISABLED, className)} />;
}

export type ToggleButtonProps = Omit<RacToggleButtonProps, 'className'> & {
  tone?: ToggleTone;
  className?: string;
};

/** A standalone on/off control, styled like a secondary Button with the selected treatment (`aria-pressed`). */
export function ToggleButton({ tone = 'light', className, ...rest }: ToggleButtonProps) {
  return <RacToggleButton {...rest} className={clsx(STANDALONE_BASE, STANDALONE_TONE[tone], DISABLED, className)} />;
}
