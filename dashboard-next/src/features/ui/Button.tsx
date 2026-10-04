'use client';

import clsx from 'clsx';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  Button as RacButton,
  Link as RacLink,
  composeRenderProps,
  type ButtonProps as RacButtonProps,
  type LinkProps as RacLinkProps,
} from 'react-aria-components';

/**
 * Button and LinkButton (DS-04, UI-SPEC "Button and LinkButton (base)").
 *
 * Behaviour comes from React Aria Components; the look is semantic-token Tailwind utilities only
 * (no hex, no font family, no pixel radius, no direction branch). Classes are joined with `clsx`,
 * not `cn`: tailwind-merge 2.x predates Tailwind 4's custom colour and size names and would read
 * `text-body` and `text-on-control` as two text colours and drop one of them.
 *
 * States are the React Aria data attributes through the `hover-state:`, `focus-state:` and
 * `pressed-state:` variants of tokens.css, so the fixtures route can force them. Focus is always an
 * outline in the direction's focus token, never a box-shadow. Padding and alignment use logical
 * properties (`px`, `ps`, `text-start`) so a right-to-left pass is cheap.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'inverse' | 'icon';
export type ButtonTone = 'light' | 'well' | 'accent';

interface ButtonBaseProps {
  /** Where the control sits: on the page ground (`light`), inside a well or band, or on an accent block. Picks the focus-ring colour. */
  tone?: ButtonTone;
  className?: string;
}

interface IconVariantProps {
  variant: 'icon';
  /** An icon-only control has no visible text, so the accessible name is required. */
  'aria-label': string;
}

interface TextVariantProps {
  variant?: Exclude<ButtonVariant, 'icon'>;
}

export type ButtonProps = Omit<RacButtonProps, 'className'> & ButtonBaseProps & (IconVariantProps | TextVariantProps);

export type LinkButtonProps = Omit<RacLinkProps, 'className'> & ButtonBaseProps & (IconVariantProps | TextVariantProps);

const BASE =
  'min-h-11 min-w-11 inline-flex items-center justify-center gap-2 rounded-control font-body text-body font-semibold whitespace-normal text-start ' +
  'transition-colors duration-(--duration-fast) ease-(--ease) cursor-pointer data-disabled:cursor-not-allowed';

// Disabled text and border: rule-strong lightened 40% toward the ground (UI-SPEC common rules).
const DISABLED_TEXT = 'data-disabled:text-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]';
const DISABLED_BORDER = 'data-disabled:border-[color:color-mix(in_srgb,var(--dir-rule-strong)_60%,var(--dir-ground))]';

const VARIANT: Record<ButtonVariant, string> = {
  primary: clsx(
    'px-5 bg-control text-on-control hover-state:bg-control-hover pressed-state:bg-control-pressed',
    'data-disabled:bg-track',
    DISABLED_TEXT,
  ),
  secondary: clsx(
    'px-5 border border-ink text-ink bg-transparent hover-state:bg-panel-hover pressed-state:bg-selected',
    'data-disabled:bg-transparent',
    DISABLED_TEXT,
    DISABLED_BORDER,
  ),
  quiet: clsx('px-5 text-accent underline underline-offset-2 hover-state:text-ink', DISABLED_TEXT),
  inverse: clsx('px-5 bg-inverse text-on-inverse', 'data-disabled:bg-track', DISABLED_TEXT),
  icon: clsx('size-11 p-0 text-ink bg-transparent hover-state:bg-panel-hover pressed-state:bg-selected', DISABLED_TEXT),
};

const FOCUS: Record<ButtonTone, string> = {
  light: 'focus-state:focus-ring',
  well: 'focus-state:focus-ring-well',
  accent: 'focus-state:focus-ring-accent',
};

function buttonClasses(variant: ButtonVariant, tone: ButtonTone, className?: string): string {
  return clsx(BASE, VARIANT[variant], FOCUS[tone], className);
}

/**
 * A press target. `isPending` keeps the label, appends an ellipsis, sets `aria-busy` and ignores
 * presses (React Aria drops the press handlers while it stays focusable); there is no spinner.
 * The `icon` variant is a 44 by 44 square and requires `aria-label`.
 */
export function Button({ variant = 'primary', tone = 'light', className, isPending, children, ...rest }: ButtonProps) {
  // React Aria filters aria-busy out of the DOM props it forwards, so the attribute is set on the node.
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (isPending) node.setAttribute('aria-busy', 'true');
    else node.removeAttribute('aria-busy');
  }, [isPending]);

  return (
    <RacButton {...rest} ref={ref} isPending={isPending} className={buttonClasses(variant, tone, className)}>
      {composeRenderProps(children, (rendered: ReactNode) => (
        <>
          {rendered}
          {isPending ? '…' : null}
        </>
      ))}
    </RacButton>
  );
}

/** A real link that looks like a button: same variants, same 44 px floor, an anchor in the DOM. */
export function LinkButton({ variant = 'primary', tone = 'light', className, children, ...rest }: LinkButtonProps) {
  return (
    <RacLink {...rest} className={buttonClasses(variant, tone, className)}>
      {children}
    </RacLink>
  );
}
